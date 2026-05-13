import {
  Body,
  Controller,
  Delete,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Res,
  UseGuards
} from "@nestjs/common";
import { AuthGuard } from "../common/auth.guard";
import { RequireAuthRealm } from "../common/auth-realm.decorator";
import { CurrentUser } from "../common/current-user.decorator";
import { AdminAiService } from "./admin-ai.service";
import type { AiStreamErrorEvent } from "./admin-ai.events";

type UserContext = { id: string; email?: string; permissions: string[] };

@UseGuards(AuthGuard)
@RequireAuthRealm("admin")
@Controller("admin/ai")
export class AdminAiController {
  constructor(@Inject(AdminAiService) private readonly ai: AdminAiService) {}

  @Get("config")
  config() {
    return this.ai.getConfig();
  }

  @Put("config")
  updateConfig(
    @Body()
    body: {
      providers?: Array<{ id: string; label: string; kind: "openai" | "anthropic" | "gemini"; baseUrl?: string; model: string }>;
      activeProvider?: string;
      tokenProviderId?: string;
      token?: string;
      systemPrompt?: string;
    }
  ) {
    return this.ai.updateConfig(body);
  }

  @Post("chat")
  chat(
    @CurrentUser() user: UserContext,
    @Body()
    body: {
      message: string;
      pagePath?: string;
      attachments?: Array<{ name: string; mimeType: string; contentBase64: string }>;
    }
  ) {
    return this.ai.chat(user, body);
  }

  @Post("chat/stream")
  async chatStream(
    @CurrentUser() user: UserContext,
    @Body()
    body: {
      message: string;
      pagePath?: string;
      conversationId?: string;
      pendingAction?: Record<string, unknown>;
      confirmAction?: boolean;
      attachments?: Array<{ name: string; mimeType: string; contentBase64: string }>;
    },
    @Res() res: { setHeader: (name: string, value: string) => void; write: (chunk: string) => void; end: () => void }
  ) {
    res.setHeader("content-type", "text/event-stream");
    res.setHeader("cache-control", "no-cache");
    res.setHeader("connection", "keep-alive");
    try {
      for await (const event of this.ai.chatStream(user, body)) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } catch (error) {
      const err = error as { response?: { message?: string; code?: string; details?: unknown } };
      const errorCode = err.response?.code ?? "AI_STREAM_FAILED";
      const payload: AiStreamErrorEvent = {
        type: "error",
        message: "Chat stream failed",
        code: errorCode,
        details: err.response?.details ?? null
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    }
    res.end();
  }

  @Get("conversations")
  conversations(
    @CurrentUser() user: UserContext,
    @Query("q") q?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.ai.listConversations(user, q, Number(page ?? 1), Number(limit ?? 20));
  }

  @Get("conversations/:id")
  conversation(@CurrentUser() user: UserContext, @Param("id") id: string) {
    return this.ai.getConversation(user, id);
  }

  @Patch("conversations/:id")
  renameConversation(
    @CurrentUser() user: UserContext,
    @Param("id") id: string,
    @Body() body: { title: string }
  ) {
    return this.ai.renameConversation(user, id, body.title);
  }

  @Delete("conversations/:id")
  deleteConversation(@CurrentUser() user: UserContext, @Param("id") id: string) {
    return this.ai.deleteConversation(user, id);
  }

  @Get("artifacts/:id/download")
  async downloadArtifact(
    @CurrentUser() user: UserContext,
    @Param("id") id: string,
    @Res() res: {
      setHeader: (name: string, value: string) => void;
      send: (body: Buffer) => void;
    }
  ) {
    const artifact = await this.ai.getArtifact(user, id);
    res.setHeader("content-type", artifact.mimeType);
    res.setHeader("content-disposition", `attachment; filename="${artifact.filename.replace(/"/g, "")}"`);
    res.send(Buffer.from(artifact.contentBase64, "base64"));
  }
}
