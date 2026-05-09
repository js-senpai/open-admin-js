import { BadRequestException, ForbiddenException, Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../common/prisma.service";
import { pluginRuntime } from "../plugins/plugin-runtime";
import { resources } from "../resources/registry";
import { AdminResourceService } from "./admin-resource.service";

type UserContext = { id: string; email?: string; permissions: string[] };

type AiProviderConfig = {
  id: string;
  label: string;
  kind: "openai" | "anthropic" | "gemini";
  baseUrl?: string;
  model: string;
};

type ChatAttachment = {
  name: string;
  mimeType: string;
  contentBase64: string;
};

type ChatPayload = {
  message: string;
  pagePath?: string;
  attachments?: ChatAttachment[];
  conversationId?: string;
  pendingAction?: Record<string, unknown>;
  confirmAction?: boolean;
};

type ChatResult = {
  reply: string;
  actionResult: unknown;
  pendingAction: Record<string, unknown> | null;
  requiresConfirmation: boolean;
};

type CompensationRecord = {
  label: string;
  run: () => Promise<void>;
};

const SETTINGS_KEYS = {
  providers: "ai.providers",
  activeProvider: "ai.activeProvider",
  tokens: "ai.tokens",
  systemPrompt: "ai.systemPrompt"
} as const;

const DEFAULT_PROVIDERS: AiProviderConfig[] = [
  { id: "chatgpt", label: "ChatGPT", kind: "openai", baseUrl: "https://api.openai.com/v1", model: "gpt-4o-mini" },
  { id: "gemini", label: "Gemini", kind: "gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta", model: "gemini-1.5-flash" },
  { id: "claude", label: "Claude", kind: "anthropic", baseUrl: "https://api.anthropic.com/v1", model: "claude-3-5-sonnet-latest" },
  { id: "deepseek", label: "DeepSeek", kind: "openai", baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" }
];

const DEFAULT_SYSTEM_PROMPT = [
  "You are an AI consultant inside the OpenAdminJS admin panel.",
  "Help users with current functionality, resource structure, and data analysis.",
  "If the user requests a data operation, return JSON in this format:",
  '{"reply":"...","action":{"type":"list|get|create|update|delete|analyze","resource":"posts","id":"...","payload":{},"query":{}}}',
  "You can also create files using actions:",
  '{"reply":"...","action":{"type":"export","resource":"orders","query":{},"format":"csv","filename":"orders.csv","columns":["id","status","total"]}}',
  '{"reply":"...","action":{"type":"artifact","filename":"note.txt","mimeType":"text/plain","content":"...","encoding":"utf8"}}',
  '{"reply":"...","action":{"type":"image","prompt":"Create a modern hero banner with abstract gradients","filename":"hero.png","size":"1024x1024"}}',
  '{"reply":"...","action":{"type":"workflow","steps":[{"type":"image","prompt":"Create product hero","filename":"hero.png"},{"type":"update","resource":"posts","id":"...","payload":{"coverImage":"{{latest_image}}"}}]}}',
  'Workflow supports transactionMode: "best_effort" (default) or "rollback_on_error".',
  "To attach created artifact into resource payload, use value format: ai-artifact:<artifactId>.",
  "Autofill shortcuts are supported in create/update payload:",
  '- "{{latest_artifact}}" -> latest artifact URL',
  '- "{{latest_image}}" -> latest image artifact URL',
  '- For image-like fields (image, coverImage, avatar, thumbnail, banner, icon), values "auto", "latest", true also map to latest image artifact.',
  "If no operation is needed, return only the reply field.",
  "For action, use only existing resources and safe queries."
].join("\n");

@Injectable()
export class AdminAiService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(AdminResourceService) private readonly resourcesService: AdminResourceService
  ) {}

  async getConfig() {
    const providers = await this.readJsonSetting<AiProviderConfig[]>(SETTINGS_KEYS.providers, DEFAULT_PROVIDERS);
    const activeProvider = await this.readStringSetting(SETTINGS_KEYS.activeProvider, providers[0]?.id ?? "chatgpt");
    const tokens = await this.readJsonSetting<Record<string, string>>(SETTINGS_KEYS.tokens, {});
    return {
      providers,
      activeProvider,
      tokenConfigured: Object.fromEntries(providers.map((provider) => [provider.id, Boolean(tokens[provider.id])]))
    };
  }

  async updateConfig(input: {
    providers?: AiProviderConfig[];
    activeProvider?: string;
    tokenProviderId?: string;
    token?: string;
    systemPrompt?: string;
  }) {
    if (input.providers) {
      const normalized = input.providers
        .map((provider) => ({
          ...provider,
          id: String(provider.id ?? "").trim().toLowerCase(),
          label: String(provider.label ?? "").trim(),
          model: String(provider.model ?? "").trim(),
          baseUrl: provider.baseUrl ? String(provider.baseUrl).trim() : undefined
        }))
        .filter((provider) => provider.id && provider.label && provider.model);
      if (normalized.length === 0) {
        throw new BadRequestException({ message: "At least one valid provider is required", code: "AI_PROVIDERS_REQUIRED" });
      }
      await this.upsertSetting(SETTINGS_KEYS.providers, "json", normalized);
    }
    if (typeof input.activeProvider === "string" && input.activeProvider.trim().length > 0) {
      await this.upsertSetting(SETTINGS_KEYS.activeProvider, "string", input.activeProvider.trim());
    }
    if (typeof input.systemPrompt === "string") {
      await this.upsertSetting(SETTINGS_KEYS.systemPrompt, "string", input.systemPrompt.trim());
    }
    if (typeof input.tokenProviderId === "string") {
      const providerId = input.tokenProviderId.trim().toLowerCase();
      const tokenValue = (input.token ?? "").trim();
      const tokens = await this.readJsonSetting<Record<string, string>>(SETTINGS_KEYS.tokens, {});
      if (tokenValue.length === 0) {
        delete tokens[providerId];
      } else {
        tokens[providerId] = tokenValue;
      }
      await this.upsertSetting(SETTINGS_KEYS.tokens, "json", tokens);
    }
    return this.getConfig();
  }

  async chat(user: UserContext, payload: ChatPayload) {
    const conversationId = await this.resolveConversation(user.id, payload.conversationId, payload.message);
    await this.createMessage(conversationId, "user", payload.message);
    const result = await this.runChatCore(user, payload);
    await this.createMessage(conversationId, "assistant", result.reply, {
      actionResult: result.actionResult,
      requiresConfirmation: result.requiresConfirmation ?? false,
      pendingAction: result.pendingAction ?? null
    });
    return { ...result, conversationId };
  }

  async *chatStream(user: UserContext, payload: ChatPayload) {
    const conversationId = await this.resolveConversation(user.id, payload.conversationId, payload.message);
    await this.createMessage(conversationId, "user", payload.message);
    this.ensureChatPermission(user);
    const prepared = await this.prepareCompletion(user, payload);
    let completion = "";
    if (prepared.provider.kind === "openai" || prepared.provider.kind === "anthropic") {
      for await (const delta of this.requestCompletionStream(prepared.provider, prepared.token, prepared.input)) {
        completion += delta;
        yield { type: "delta", delta, conversationId };
      }
    } else {
      completion = await this.requestCompletion(prepared.provider, prepared.token, prepared.input);
      if (completion) yield { type: "delta", delta: completion, conversationId };
    }
    const result = await this.finalizeCompletion(user, payload, completion, prepared);
    await this.createMessage(conversationId, "assistant", result.reply, {
      actionResult: result.actionResult,
      requiresConfirmation: result.requiresConfirmation ?? false,
      pendingAction: result.pendingAction ?? null
    });
    yield {
      type: "done",
      conversationId,
      reply: result.reply,
      actionResult: result.actionResult,
      pendingAction: result.pendingAction ?? null,
      requiresConfirmation: result.requiresConfirmation ?? false
    };
  }

  async listConversations(user: UserContext, search?: string, page = 1, limit = 20) {
    this.ensureChatPermission(user);
    const q = String(search ?? "").trim();
    const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;
    const safeLimit = Math.min(50, Math.max(1, Number.isFinite(limit) ? Math.floor(limit) : 20));
    const where = {
      userId: user.id,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: "insensitive" as const } },
              {
                messages: {
                  some: {
                    content: { contains: q, mode: "insensitive" as const }
                  }
                }
              }
            ]
          }
        : {})
    };
    const [items, total] = await Promise.all([
      this.prisma.aiConversation.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        include: {
          messages: {
            orderBy: { createdAt: "desc" },
            take: 1
          }
        },
        skip: (safePage - 1) * safeLimit,
        take: safeLimit
      }),
      this.prisma.aiConversation.count({ where })
    ]);
    return {
      data: items,
      meta: {
        page: safePage,
        limit: safeLimit,
        total,
        pages: Math.max(1, Math.ceil(total / safeLimit))
      }
    };
  }

  async getConversation(user: UserContext, conversationId: string) {
    this.ensureChatPermission(user);
    const conversation = await this.prisma.aiConversation.findFirst({
      where: { id: conversationId, userId: user.id },
      include: { messages: { orderBy: { createdAt: "asc" } } }
    });
    if (!conversation) {
      throw new BadRequestException({ message: "Conversation not found", code: "AI_CONVERSATION_NOT_FOUND" });
    }
    return conversation;
  }

  async renameConversation(user: UserContext, conversationId: string, title: string) {
    this.ensureChatPermission(user);
    const trimmed = title.trim();
    if (!trimmed) {
      throw new BadRequestException({ message: "Title is required", code: "AI_CONVERSATION_TITLE_REQUIRED" });
    }
    const updated = await this.prisma.aiConversation.updateMany({
      where: { id: conversationId, userId: user.id },
      data: { title: trimmed.slice(0, 120) }
    });
    if (updated.count === 0) {
      throw new BadRequestException({ message: "Conversation not found", code: "AI_CONVERSATION_NOT_FOUND" });
    }
    return { ok: true };
  }

  async deleteConversation(user: UserContext, conversationId: string) {
    this.ensureChatPermission(user);
    const deleted = await this.prisma.aiConversation.deleteMany({
      where: { id: conversationId, userId: user.id }
    });
    if (deleted.count === 0) {
      throw new BadRequestException({ message: "Conversation not found", code: "AI_CONVERSATION_NOT_FOUND" });
    }
    return { ok: true };
  }

  private ensureChatPermission(user: UserContext) {
    if (!this.hasPermission(user, "ai.chat")) {
      throw new ForbiddenException({ message: "Missing permission", code: "PERMISSION_DENIED" });
    }
  }

  private async runChatCore(
    user: UserContext,
    payload: ChatPayload
  ): Promise<ChatResult> {
    this.ensureChatPermission(user);
    const prepared = await this.prepareCompletion(user, payload);
    const completion = await this.requestCompletion(prepared.provider, prepared.token, prepared.input);
    return this.finalizeCompletion(user, payload, completion, prepared);
  }

  private async finalizeCompletion(
    user: UserContext,
    payload: ChatPayload,
    completion: string,
    aiContext?: {
      provider: AiProviderConfig;
      token: string;
      input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] };
    }
  ): Promise<ChatResult> {
    const parsed = this.tryParseStructuredOutput(completion);
    if (!parsed?.action && payload.pendingAction && payload.confirmAction) {
      const actionResult = await this.executeAction(user, payload.pendingAction, aiContext);
      const reply = parsed?.reply ? `${parsed.reply}\n\nAction completed.` : "Action completed.";
      return { reply, actionResult, pendingAction: null, requiresConfirmation: false };
    }

    if (!parsed?.action) {
      return { reply: parsed?.reply ?? completion, actionResult: null, pendingAction: null, requiresConfirmation: false };
    }

    if (String(parsed.action.type ?? "") === "delete" && !payload.confirmAction) {
      return {
        reply: `${parsed.reply ?? "Delete action detected."}\n\nPlease confirm this destructive action.`,
        actionResult: null,
        pendingAction: parsed.action,
        requiresConfirmation: true
      };
    }

    const actionResult = await this.executeAction(user, parsed.action, aiContext);
    const finalReply = parsed.reply
      ? `${parsed.reply}\n\nResult:\n${JSON.stringify(actionResult, null, 2)}`
      : `Done.\n\n${JSON.stringify(actionResult, null, 2)}`;
    return { reply: finalReply, actionResult, pendingAction: null, requiresConfirmation: false };
  }

  private async prepareCompletion(
    user: UserContext,
    payload: ChatPayload
  ): Promise<{
    provider: AiProviderConfig;
    token: string;
    input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] };
  }> {
    const message = String(payload.message ?? "").trim();
    if (!message) {
      throw new BadRequestException({ message: "Message is required", code: "AI_MESSAGE_REQUIRED" });
    }
    const config = await this.getConfig();
    const providers = await this.readJsonSetting<AiProviderConfig[]>(SETTINGS_KEYS.providers, DEFAULT_PROVIDERS);
    const active = providers.find((provider) => provider.id === config.activeProvider) ?? providers[0];
    if (!active) {
      throw new BadRequestException({ message: "No AI providers configured", code: "AI_PROVIDER_MISSING" });
    }
    const tokens = await this.readJsonSetting<Record<string, string>>(SETTINGS_KEYS.tokens, {});
    const providerToken = tokens[active.id];
    if (!providerToken) {
      throw new BadRequestException({
        message: `Token for provider "${active.label}" is not configured`,
        code: "AI_TOKEN_MISSING"
      });
    }
    const systemPrompt = await this.readStringSetting(SETTINGS_KEYS.systemPrompt, DEFAULT_SYSTEM_PROMPT);
    const context = this.buildAssistantContext(user, payload.pagePath);
    return {
      provider: active,
      token: providerToken,
      input: {
        message,
        context,
        systemPrompt,
        attachments: payload.attachments ?? []
      }
    };
  }

  private async executeAction(
    user: UserContext,
    action: Record<string, unknown>,
    aiContext?: { provider: AiProviderConfig; token: string }
  ) {
    const type = String(action.type ?? "");
    if (type === "workflow") {
      return this.executeWorkflow(user, action, aiContext);
    }
    const resource = String(action.resource ?? "");
    const id = action.id ? String(action.id) : undefined;
    const payload = (action.payload ?? {}) as Record<string, unknown>;
    const query = (action.query ?? {}) as Record<string, unknown>;
    if (!resource) {
      throw new BadRequestException({ message: "Action resource is required", code: "AI_ACTION_RESOURCE_REQUIRED" });
    }
    if (!resources.some((item) => item.name === resource)) {
      throw new BadRequestException({ message: `Unknown resource "${resource}"`, code: "AI_ACTION_RESOURCE_UNKNOWN" });
    }
    switch (type) {
      case "list":
        return this.resourcesService.list(resource, { limit: 20, ...query }, user);
      case "get":
        if (!id) throw new BadRequestException({ message: "Action id is required", code: "AI_ACTION_ID_REQUIRED" });
        return this.resourcesService.get(resource, id, user);
      case "create":
        return this.resourcesService.create(
          resource,
          (await this.resolveArtifactRefs(user.id, payload, resource)) as Record<string, unknown>,
          user
        );
      case "update":
        if (!id) throw new BadRequestException({ message: "Action id is required", code: "AI_ACTION_ID_REQUIRED" });
        return this.resourcesService.update(
          resource,
          id,
          (await this.resolveArtifactRefs(user.id, payload, resource)) as Record<string, unknown>,
          user
        );
      case "delete":
        if (!id) throw new BadRequestException({ message: "Action id is required", code: "AI_ACTION_ID_REQUIRED" });
        return this.resourcesService.delete(resource, id, user);
      case "analyze": {
        const listing = await this.resourcesService.list(resource, { limit: 100, ...query }, user) as { data: Record<string, unknown>[]; meta: unknown };
        const data = listing.data ?? [];
        return {
          count: data.length,
          keys: [...new Set(data.flatMap((row) => Object.keys(row))).values()],
          sample: data.slice(0, 10)
        };
      }
      case "export": {
        const listing = await this.resourcesService.list(resource, { limit: 1000, ...query }, user) as { data: Record<string, unknown>[]; meta: unknown };
        const format = String(action.format ?? "csv").toLowerCase();
        const filename = String(action.filename ?? `${resource}-export.${format === "json" ? "json" : "csv"}`);
        if (format === "json") {
          const content = JSON.stringify(listing.data ?? [], null, 2);
          return this.createArtifact(user.id, content, {
            conversationId: undefined,
            filename,
            mimeType: "application/json",
            encoding: "utf8",
            meta: { type: "export", format, resource, query }
          });
        }
        const columns = Array.isArray(action.columns) ? action.columns.map((item) => String(item)) : undefined;
        const csv = this.toCsv(listing.data ?? [], columns);
        return this.createArtifact(user.id, csv, {
          conversationId: undefined,
          filename,
          mimeType: "text/csv",
          encoding: "utf8",
          meta: { type: "export", format: "csv", resource, query, columns: columns ?? null }
        });
      }
      case "artifact": {
        const filename = String(action.filename ?? "artifact.txt");
        const mimeType = String(action.mimeType ?? "text/plain");
        const encoding = String(action.encoding ?? "utf8").toLowerCase() === "base64" ? "base64" : "utf8";
        const content = String(action.content ?? "");
        return this.createArtifact(user.id, content, {
          conversationId: undefined,
          filename,
          mimeType,
          encoding,
          meta: { type: "artifact", resource: null }
        });
      }
      case "image": {
        if (!aiContext) {
          throw new BadRequestException({ message: "AI context is required for image generation", code: "AI_IMAGE_CONTEXT_REQUIRED" });
        }
        return this.createImageArtifact(user.id, action, aiContext.provider, aiContext.token);
      }
      default:
        throw new BadRequestException({ message: `Unsupported action type "${type}"`, code: "AI_ACTION_UNSUPPORTED" });
    }
  }

  private async executeWorkflow(
    user: UserContext,
    action: Record<string, unknown>,
    aiContext?: { provider: AiProviderConfig; token: string }
  ) {
    const transactionModeRaw = String(action.transactionMode ?? "best_effort").toLowerCase();
    const transactionMode = transactionModeRaw === "rollback_on_error" ? "rollback_on_error" : "best_effort";
    const stepsRaw = action.steps;
    if (!Array.isArray(stepsRaw) || stepsRaw.length === 0) {
      throw new BadRequestException({
        message: "Workflow must include at least one step",
        code: "AI_WORKFLOW_STEPS_REQUIRED"
      });
    }
    if (stepsRaw.length > 8) {
      throw new BadRequestException({
        message: "Workflow step limit is 8",
        code: "AI_WORKFLOW_STEPS_LIMIT"
      });
    }
    const results: Array<Record<string, unknown>> = [];
    const compensations: CompensationRecord[] = [];
    for (let index = 0; index < stepsRaw.length; index += 1) {
      const raw = stepsRaw[index];
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
        throw new BadRequestException({
          message: `Workflow step ${index + 1} is invalid`,
          code: "AI_WORKFLOW_STEP_INVALID"
        });
      }
      const step = raw as Record<string, unknown>;
      const stepType = String(step.type ?? "");
      if (stepType === "workflow") {
        throw new BadRequestException({
          message: "Nested workflow is not supported",
          code: "AI_WORKFLOW_NESTED_UNSUPPORTED"
        });
      }
      try {
        const resolvedStep = (await this.resolveArtifactRefs(user.id, step)) as Record<string, unknown>;
        const result = await this.executeAction(user, resolvedStep, aiContext);
        const compensation = this.buildCompensation(user, resolvedStep, result);
        if (compensation) compensations.push(compensation);
        results.push({
          step: index + 1,
          type: stepType,
          resource: String(resolvedStep.resource ?? ""),
          targetId:
            typeof (result as Record<string, unknown>)?.id === "string"
              ? String((result as Record<string, unknown>).id)
              : typeof resolvedStep.id === "string"
                ? String(resolvedStep.id)
                : "",
          result: result as Record<string, unknown>
        });
      } catch (error) {
        const known = error as { response?: unknown };
        const response =
          known && typeof known === "object" && "response" in known
            ? (known.response as { message?: string; details?: unknown } | undefined)
            : undefined;
        const rolledBack: string[] = [];
        const rollbackFailures: Array<{ label: string; reason: string }> = [];
        if (transactionMode === "rollback_on_error" && compensations.length > 0) {
          for (let rollbackIndex = compensations.length - 1; rollbackIndex >= 0; rollbackIndex -= 1) {
            try {
              const compensate = compensations[rollbackIndex];
              if (!compensate) continue;
              await compensate.run();
              rolledBack.push(compensate.label);
            } catch (rollbackError) {
              rollbackFailures.push({
                label: compensations[rollbackIndex]?.label ?? `step-${rollbackIndex + 1}`,
                reason: rollbackError instanceof Error ? rollbackError.message : "rollback failed"
              });
            }
          }
        }
        const origin =
          (response && typeof response === "object" && typeof response.message === "string"
            ? response.message
            : null) ??
          (error instanceof Error ? error.message : "workflow step failed");
        throw new BadRequestException({
          message: origin,
          code: "AI_WORKFLOW_FAILED",
          details: {
            transactionMode,
            failedStep: index + 1,
            failedStepType: stepType,
            completedSteps: results.length,
            partialResults: results,
            ...(response && typeof response === "object" && response.details ? { cause: response.details } : {}),
            rolledBack,
            rollbackFailures
          }
        });
      }
    }
    return {
      ok: true,
      transactionMode,
      stepsExecuted: results.length,
      results
    };
  }

  private buildCompensation(
    user: UserContext,
    step: Record<string, unknown>,
    result: unknown
  ): CompensationRecord | null {
    const type = String(step.type ?? "");
    if ((type === "artifact" || type === "image") && result && typeof result === "object") {
      const artifactId = String((result as Record<string, unknown>).artifactId ?? "");
      if (!artifactId) return null;
      return {
        label: `artifact:${artifactId}`,
        run: async () => {
          await this.prisma.aiArtifact.deleteMany({
            where: { id: artifactId, userId: user.id }
          });
        }
      };
    }
    if (type === "create" && result && typeof result === "object") {
      const resource = String(step.resource ?? "");
      const createdId = String((result as Record<string, unknown>).id ?? "");
      if (!resource || !createdId) return null;
      return {
        label: `${resource}:${createdId}`,
        run: async () => {
          try {
            await this.resourcesService.delete(resource, createdId, user);
          } catch {
            // resource might be already deleted or protected
          }
        }
      };
    }
    return null;
  }

  private buildAssistantContext(user: UserContext, pagePath?: string) {
    const readableResources = resources
      .filter((resource) => this.hasPermission(user, resource.permissions.read))
      .map((resource) => ({
        name: resource.name,
        label: resource.label,
        fields: Object.entries(resource.fields).map(([name, field]) => ({
          name,
          type: field.type,
          label: field.label ?? name,
          searchable: Boolean(field.searchable),
          filterable: Boolean(field.filterable)
        })),
        permissions: resource.permissions
      }));
    return {
      pagePath: pagePath ?? "",
      user: { id: user.id, email: user.email ?? "", permissions: user.permissions },
      resources: readableResources
    };
  }

  private async requestCompletion(
    provider: AiProviderConfig,
    token: string,
    input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] }
  ): Promise<string> {
    if (provider.kind === "anthropic") {
      return this.callAnthropic(provider, token, input);
    }
    if (provider.kind === "gemini") {
      return this.callGemini(provider, token, input);
    }
    return this.callOpenAiCompatible(provider, token, input);
  }

  private async *requestCompletionStream(
    provider: AiProviderConfig,
    token: string,
    input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] }
  ): AsyncGenerator<string> {
    if (provider.kind === "anthropic") {
      yield* this.callAnthropicStream(provider, token, input);
      return;
    }
    if (provider.kind === "gemini") {
      yield* this.callGeminiStream(provider, token, input);
      return;
    }
    yield* this.callOpenAiCompatibleStream(provider, token, input);
  }

  private async callOpenAiCompatible(
    provider: AiProviderConfig,
    token: string,
    input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] }
  ) {
    const imageParts = input.attachments
      .filter((file) => file.mimeType.startsWith("image/"))
      .map((file) => ({
        type: "image_url",
        image_url: { url: `data:${file.mimeType};base64,${file.contentBase64}` }
      }));
    const fileDigest = input.attachments
      .filter((file) => !file.mimeType.startsWith("image/"))
      .map((file) => `${file.name} (${file.mimeType}, ${Math.round(file.contentBase64.length / 4)} bytes approx)`)
      .join("\n");
    const userText = [
      input.message,
      fileDigest ? `\nFiles:\n${fileDigest}` : "",
      `\nContext:\n${JSON.stringify(input.context)}`
    ].join("");
    const response = await fetch(`${provider.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        messages: [
          { role: "system", content: input.systemPrompt },
          {
            role: "user",
            content: [{ type: "text", text: userText }, ...imageParts]
          }
        ]
      })
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      choices?: Array<{ message?: { content?: string } }>;
    };
    if (!response.ok) {
      throw new BadRequestException({
        message: data.error?.message ?? "AI provider request failed",
        code: "AI_PROVIDER_REQUEST_FAILED"
      });
    }
    return data.choices?.[0]?.message?.content?.trim() ?? "Empty response from AI.";
  }

  private async *callOpenAiCompatibleStream(
    provider: AiProviderConfig,
    token: string,
    input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] }
  ): AsyncGenerator<string> {
    const imageParts = input.attachments
      .filter((file) => file.mimeType.startsWith("image/"))
      .map((file) => ({
        type: "image_url",
        image_url: { url: `data:${file.mimeType};base64,${file.contentBase64}` }
      }));
    const fileDigest = input.attachments
      .filter((file) => !file.mimeType.startsWith("image/"))
      .map((file) => `${file.name} (${file.mimeType}, ${Math.round(file.contentBase64.length / 4)} bytes approx)`)
      .join("\n");
    const userText = [
      input.message,
      fileDigest ? `\nFiles:\n${fileDigest}` : "",
      `\nContext:\n${JSON.stringify(input.context)}`
    ].join("");
    const response = await fetch(`${provider.baseUrl ?? "https://api.openai.com/v1"}/chat/completions`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        model: provider.model,
        temperature: 0.2,
        stream: true,
        messages: [
          { role: "system", content: input.systemPrompt },
          { role: "user", content: [{ type: "text", text: userText }, ...imageParts] }
        ]
      })
    });
    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new BadRequestException({
        message: data.error?.message ?? "AI provider request failed",
        code: "AI_PROVIDER_REQUEST_FAILED"
      });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        const parsed = JSON.parse(payload) as {
          choices?: Array<{ delta?: { content?: string } }>;
        };
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      }
    }
  }

  private async callAnthropic(
    provider: AiProviderConfig,
    token: string,
    input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] }
  ) {
    const content: Array<Record<string, unknown>> = [
      {
        type: "text",
        text: `${input.message}\n\nContext:\n${JSON.stringify(input.context)}`
      }
    ];
    for (const file of input.attachments) {
      if (file.mimeType.startsWith("image/")) {
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: file.mimeType,
            data: file.contentBase64
          }
        });
      } else {
        content.push({ type: "text", text: `File: ${file.name} (${file.mimeType})` });
      }
    }
    const response = await fetch(`${provider.baseUrl ?? "https://api.anthropic.com/v1"}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": token,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1800,
        temperature: 0.2,
        system: input.systemPrompt,
        messages: [{ role: "user", content }]
      })
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      content?: Array<{ type?: string; text?: string }>;
    };
    if (!response.ok) {
      throw new BadRequestException({
        message: data.error?.message ?? "AI provider request failed",
        code: "AI_PROVIDER_REQUEST_FAILED"
      });
    }
    const text = data.content?.find((item) => item.type === "text")?.text;
    return text?.trim() ?? "Empty response from AI.";
  }

  private async *callAnthropicStream(
    provider: AiProviderConfig,
    token: string,
    input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] }
  ): AsyncGenerator<string> {
    const content: Array<Record<string, unknown>> = [
      { type: "text", text: `${input.message}\n\nContext:\n${JSON.stringify(input.context)}` }
    ];
    for (const file of input.attachments) {
      if (file.mimeType.startsWith("image/")) {
        content.push({
          type: "image",
          source: { type: "base64", media_type: file.mimeType, data: file.contentBase64 }
        });
      } else {
        content.push({ type: "text", text: `File: ${file.name} (${file.mimeType})` });
      }
    }
    const response = await fetch(`${provider.baseUrl ?? "https://api.anthropic.com/v1"}/messages`, {
      method: "POST",
      headers: {
        "x-api-key": token,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: provider.model,
        max_tokens: 1800,
        temperature: 0.2,
        stream: true,
        system: input.systemPrompt,
        messages: [{ role: "user", content }]
      })
    });
    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new BadRequestException({
        message: data.error?.message ?? "AI provider request failed",
        code: "AI_PROVIDER_REQUEST_FAILED"
      });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        const parsed = JSON.parse(payload) as {
          type?: string;
          delta?: { text?: string };
        };
        if (parsed.type === "content_block_delta" && parsed.delta?.text) {
          yield parsed.delta.text;
        }
      }
    }
  }

  private async callGemini(
    provider: AiProviderConfig,
    token: string,
    input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] }
  ) {
    const parts: Array<Record<string, unknown>> = [
      {
        text: `${input.systemPrompt}\n\nUser request:\n${input.message}\n\nContext:\n${JSON.stringify(input.context)}`
      }
    ];
    for (const file of input.attachments) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.contentBase64
        }
      });
    }
    const url = `${provider.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta"}/models/${provider.model}:generateContent?key=${encodeURIComponent(token)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2 } })
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    if (!response.ok) {
      throw new BadRequestException({
        message: data.error?.message ?? "AI provider request failed",
        code: "AI_PROVIDER_REQUEST_FAILED"
      });
    }
    return data.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("").trim() ?? "Empty response from AI.";
  }

  private async *callGeminiStream(
    provider: AiProviderConfig,
    token: string,
    input: { message: string; context: unknown; systemPrompt: string; attachments: ChatAttachment[] }
  ): AsyncGenerator<string> {
    const parts: Array<Record<string, unknown>> = [
      {
        text: `${input.systemPrompt}\n\nUser request:\n${input.message}\n\nContext:\n${JSON.stringify(input.context)}`
      }
    ];
    for (const file of input.attachments) {
      parts.push({
        inlineData: {
          mimeType: file.mimeType,
          data: file.contentBase64
        }
      });
    }
    const url = `${provider.baseUrl ?? "https://generativelanguage.googleapis.com/v1beta"}/models/${provider.model}:streamGenerateContent?alt=sse&key=${encodeURIComponent(token)}`;
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ contents: [{ role: "user", parts }], generationConfig: { temperature: 0.2 } })
    });
    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => ({}))) as { error?: { message?: string } };
      throw new BadRequestException({
        message: data.error?.message ?? "AI provider request failed",
        code: "AI_PROVIDER_REQUEST_FAILED"
      });
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        const parsed = JSON.parse(payload) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
        };
        const delta = parsed.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
        if (delta) yield delta;
      }
    }
  }

  private tryParseStructuredOutput(text: string): { reply?: string; action?: Record<string, unknown> } | null {
    const trimmed = text.trim();
    const codeBlock = trimmed.match(/```json\s*([\s\S]*?)```/i)?.[1];
    const candidate = codeBlock ?? trimmed;
    try {
      const parsed = JSON.parse(candidate) as { reply?: string; action?: Record<string, unknown> };
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private hasPermission(user: UserContext, permission?: string) {
    return Boolean(permission && (user.permissions.includes(permission) || user.permissions.includes("*")));
  }

  private async readJsonSetting<T>(key: string, fallback: T): Promise<T> {
    const entry = await this.prisma.setting.findUnique({ where: { key } });
    if (!entry) return fallback;
    return entry.value as T;
  }

  private async readStringSetting(key: string, fallback: string): Promise<string> {
    const entry = await this.prisma.setting.findUnique({ where: { key } });
    if (!entry) return fallback;
    const value = entry.value;
    return typeof value === "string" ? value : String(value ?? fallback);
  }

  private async upsertSetting(key: string, type: "string" | "json", value: unknown) {
    await this.prisma.setting.upsert({
      where: { key },
      create: {
        key,
        group: "ai-assistant",
        type,
        value: value as Prisma.InputJsonValue
      },
      update: {
        group: "ai-assistant",
        type,
        value: value as Prisma.InputJsonValue
      }
    });
  }

  private async resolveConversation(userId: string, conversationId: string | undefined, firstMessage: string) {
    if (conversationId) {
      const existing = await this.prisma.aiConversation.findFirst({ where: { id: conversationId, userId } });
      if (existing) return existing.id;
    }
    const created = await this.prisma.aiConversation.create({
      data: {
        userId,
        title: firstMessage.trim().slice(0, 80) || "New chat"
      }
    });
    return created.id;
  }

  private async createMessage(conversationId: string, role: "user" | "assistant", content: string, meta?: Record<string, unknown>) {
    await this.prisma.aiMessage.create({
      data: {
        conversationId,
        role,
        content,
        meta: (meta ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
      }
    });
  }

  async getArtifact(user: UserContext, artifactId: string) {
    this.ensureChatPermission(user);
    const artifact = await this.prisma.aiArtifact.findFirst({
      where: { id: artifactId, userId: user.id }
    });
    if (!artifact) {
      throw new BadRequestException({ message: "Artifact not found", code: "AI_ARTIFACT_NOT_FOUND" });
    }
    return artifact;
  }

  private async createArtifact(
    userId: string,
    content: string,
    input: {
      conversationId?: string;
      filename: string;
      mimeType: string;
      encoding: "utf8" | "base64";
      meta?: Record<string, unknown>;
    }
  ) {
    const initialContentBase64 =
      input.encoding === "base64" ? content : Buffer.from(content, "utf8").toString("base64");
    let filename = input.filename.slice(0, 180);
    let mimeType = input.mimeType.slice(0, 120);
    let contentBase64 = initialContentBase64;
    for (const hooks of pluginRuntime.getMediaHooks()) {
      await hooks.beforeStore?.({
        filename,
        mimeType,
        size: Buffer.from(contentBase64, "base64").byteLength,
        contentBase64,
        user: { id: userId, email: "", permissions: [] }
      });
      if (hooks.transform) {
        const transformed = await hooks.transform({
          filename,
          mimeType,
          contentBase64,
          user: { id: userId, email: "", permissions: [] }
        });
        filename = (transformed.filename ?? filename).slice(0, 180);
        mimeType = (transformed.mimeType ?? mimeType).slice(0, 120);
        contentBase64 = transformed.contentBase64;
      }
    }
    const size = Buffer.from(contentBase64, "base64").byteLength;
    const artifact = await this.prisma.aiArtifact.create({
      data: {
        userId,
        conversationId: input.conversationId ?? null,
        filename,
        mimeType,
        size,
        contentBase64,
        meta: (input.meta ?? null) as Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput
      }
    });
    for (const hooks of pluginRuntime.getMediaHooks()) {
      await hooks.afterStore?.({
        fileId: artifact.id,
        filename: artifact.filename,
        mimeType: artifact.mimeType,
        size: artifact.size,
        user: { id: userId, email: "", permissions: [] }
      });
    }
    return {
      id: artifact.id,
      artifactId: artifact.id,
      artifactRef: `ai-artifact:${artifact.id}`,
      filename: artifact.filename,
      mimeType: artifact.mimeType,
      size: artifact.size,
      downloadUrl: `/admin/ai/artifacts/${artifact.id}/download`
    };
  }

  private async createImageArtifact(
    userId: string,
    action: Record<string, unknown>,
    provider: AiProviderConfig,
    token: string
  ) {
    if (provider.kind !== "openai") {
      throw new BadRequestException({
        message: `Provider "${provider.label}" does not support image generation in this integration`,
        code: "AI_IMAGE_PROVIDER_UNSUPPORTED"
      });
    }
    const prompt = String(action.prompt ?? "").trim();
    if (!prompt) {
      throw new BadRequestException({ message: "Image prompt is required", code: "AI_IMAGE_PROMPT_REQUIRED" });
    }
    const filename = String(action.filename ?? "generated-image.png");
    const size = String(action.size ?? "1024x1024");
    const model = String(action.model ?? "gpt-image-1");
    const response = await fetch(`${provider.baseUrl ?? "https://api.openai.com/v1"}/images/generations`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model,
        prompt,
        size,
        response_format: "b64_json"
      })
    });
    const data = (await response.json().catch(() => ({}))) as {
      error?: { message?: string };
      data?: Array<{ b64_json?: string }>;
    };
    if (!response.ok) {
      throw new BadRequestException({
        message: data.error?.message ?? "Image generation failed",
        code: "AI_IMAGE_GENERATION_FAILED"
      });
    }
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) {
      throw new BadRequestException({
        message: "Image provider returned empty payload",
        code: "AI_IMAGE_EMPTY_PAYLOAD"
      });
    }
    return this.createArtifact(userId, b64, {
      filename,
      mimeType: "image/png",
      encoding: "base64",
      meta: { type: "image", prompt, model, size }
    });
  }

  private async resolveArtifactRefs(userId: string, value: unknown, resourceName?: string): Promise<unknown> {
    const latestImageUrl = await this.getLatestArtifactUrl(userId, { imageOnly: true });
    const latestAnyUrl = await this.getLatestArtifactUrl(userId, { imageOnly: false });

    const isImageLikeField = (field: string) =>
      /(image|cover|avatar|thumbnail|banner|icon)/i.test(field);

    const resolveValue = async (input: unknown, fieldName?: string): Promise<unknown> => {
      if (typeof input === "string") {
        if (input.startsWith("ai-artifact:")) {
          const artifactId = input.slice("ai-artifact:".length).trim();
          if (!artifactId) return input;
          const artifact = await this.prisma.aiArtifact.findFirst({
            where: { id: artifactId, userId }
          });
          if (!artifact) {
            throw new BadRequestException({
              message: `Artifact "${artifactId}" not found`,
              code: "AI_ARTIFACT_NOT_FOUND"
            });
          }
          return `/admin/ai/artifacts/${artifact.id}/download`;
        }
        if (input === "{{latest_image}}") return latestImageUrl ?? input;
        if (input === "{{latest_artifact}}") return latestAnyUrl ?? input;
        if (fieldName && isImageLikeField(fieldName) && /^(auto|latest)$/i.test(input)) {
          return latestImageUrl ?? input;
        }
        return input;
      }
      if (typeof input === "boolean" && fieldName && isImageLikeField(fieldName) && input) {
        return latestImageUrl ?? input;
      }
      if (Array.isArray(input)) {
        return Promise.all(input.map((item) => resolveValue(item)));
      }
      if (input && typeof input === "object") {
        const entries = await Promise.all(
          Object.entries(input as Record<string, unknown>).map(async ([key, nested]) => [
            key,
            await resolveValue(nested, key)
          ])
        );
        return Object.fromEntries(entries);
      }
      return input;
    };

    const resolved = await resolveValue(value);
    if (resourceName && resolved && typeof resolved === "object") {
      return resolved;
    }
    return resolved;
  }

  private async getLatestArtifactUrl(userId: string, options: { imageOnly: boolean }) {
    const artifact = await this.prisma.aiArtifact.findFirst({
      where: {
        userId,
        ...(options.imageOnly ? { mimeType: { startsWith: "image/" } } : {})
      },
      orderBy: { createdAt: "desc" }
    });
    if (!artifact) return null;
    return `/admin/ai/artifacts/${artifact.id}/download`;
  }

  private toCsv(rows: Record<string, unknown>[], explicitColumns?: string[]) {
    const columns =
      explicitColumns && explicitColumns.length > 0
        ? explicitColumns
        : [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const escapeCell = (value: unknown) => {
      const str = value == null ? "" : typeof value === "object" ? JSON.stringify(value) : String(value);
      if (/[",\n]/.test(str)) return `"${str.replace(/"/g, "\"\"")}"`;
      return str;
    };
    const head = columns.map(escapeCell).join(",");
    const lines = rows.map((row) => columns.map((column) => escapeCell(row[column])).join(","));
    return [head, ...lines].join("\n");
  }

}
