"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, Check, Loader2, MessageCircle, Paperclip, Pencil, Plus, Search, Send, Sparkles, Trash2, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { API_URL, api, token } from "../lib/api";
import type { AiStreamEvent } from "../lib/ai-events";

type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  actionResult?: Record<string, unknown> | null;
  errorDetails?: { code?: string; details?: unknown } | null;
  pendingAction?: Record<string, unknown> | null;
  requiresConfirmation?: boolean;
};

type UploadAttachment = {
  name: string;
  mimeType: string;
  contentBase64: string;
};

const MAX_ATTACHMENTS = 5;
const QUICK_PROMPTS = [
  "Analyze current page data and summarize insights.",
  "Export this resource to CSV with key fields.",
  "Generate a banner image and prepare it for record update.",
  "Find anomalies in recent records and explain."
];

function toBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const marker = "base64,";
      const index = value.indexOf(marker);
      if (index === -1) {
        reject(new Error("Invalid file encoding"));
        return;
      }
      resolve(value.slice(index + marker.length));
    };
    reader.onerror = () => reject(reader.error ?? new Error("File read failed"));
    reader.readAsDataURL(file);
  });
}

function saveBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function AiAssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I am your AI admin consultant. I can explain features, analyze data, and help with CRUD operations."
    }
  ]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [conversations, setConversations] = useState<Array<{ id: string; title?: string | null }>>([]);
  const [conversationPage, setConversationPage] = useState(1);
  const [conversationPages, setConversationPages] = useState(1);
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [search, setSearch] = useState("");
  const [attachments, setAttachments] = useState<UploadAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState("");
  const [lastFailedPayload, setLastFailedPayload] = useState<{
    message: string;
    attachments: UploadAttachment[];
    pendingAction?: Record<string, unknown>;
    confirmAction?: boolean;
  } | null>(null);
  const [expandedDiagnostics, setExpandedDiagnostics] = useState<Record<string, boolean>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const canSend = useMemo(() => prompt.trim().length > 0 && !loading, [prompt, loading]);

  async function refreshConversations(query?: string, page = 1, append = false) {
    const qs = query?.trim() ? `?q=${encodeURIComponent(query.trim())}` : "";
    const paging = `${qs ? "&" : "?"}page=${page}&limit=12`;
    return api<{
      data: Array<{ id: string; title?: string | null }>;
      meta: { page: number; pages: number };
    }>(`/admin/ai/conversations${qs}${paging}`)
      .then((response) => {
        setConversations((current) => (append ? [...current, ...response.data] : response.data));
        setConversationPage(response.meta.page);
        setConversationPages(response.meta.pages);
      })
      .catch(() => {});
  }

  useEffect(() => {
    void refreshConversations();
  }, []);

  useEffect(() => {
    if (!open) return;
    if (conversationId) return;
    const latest = conversations[0];
    if (!latest?.id) return;
    setConversationId(latest.id);
    void api<{ messages: Array<{ id: string; role: "user" | "assistant"; content: string }> }>(`/admin/ai/conversations/${latest.id}`)
      .then((conversation) => {
        if (!conversation.messages?.length) return;
        setMessages(
          conversation.messages.map((msg) => ({
            id: msg.id,
            role: msg.role,
            content: msg.content
          }))
        );
      })
      .catch(() => {});
  }, [open, conversationId, conversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, streamingText, open]);

  async function loadConversation(id: string) {
    const conversation = await api<{ messages: Array<{ id: string; role: "user" | "assistant"; content: string }> }>(`/admin/ai/conversations/${id}`);
    setConversationId(id);
    setMessages(
      conversation.messages.length
        ? conversation.messages.map((msg) => ({ id: msg.id, role: msg.role, content: msg.content }))
        : [
            {
              id: "welcome",
              role: "assistant",
              content: "Hi! I am your AI admin consultant. I can explain features, analyze data, and help with CRUD operations."
            }
          ]
    );
  }

  function startNewChat() {
    setConversationId(null);
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: "New chat started. Ask me anything about the admin panel."
      }
    ]);
    setAttachments([]);
    setPrompt("");
    setError(null);
  }

  async function removeConversation(id: string) {
    const ok = window.confirm("Delete this conversation?");
    if (!ok) return;
    await api(`/admin/ai/conversations/${id}`, { method: "DELETE" });
    if (conversationId === id) {
      startNewChat();
    }
    await refreshConversations(search, 1, false);
  }

  async function downloadArtifact(message: ChatMessage) {
    const result = message.actionResult;
    const downloadUrl = typeof result?.downloadUrl === "string" ? result.downloadUrl : null;
    const filename = typeof result?.filename === "string" ? result.filename : "artifact.bin";
    if (!downloadUrl) return;
    const response = await fetch(`${API_URL}${downloadUrl}`, {
      headers: {
        ...(token() ? { authorization: `Bearer ${token()}` } : {})
      }
    });
    if (!response.ok) {
      setError("Failed to download artifact");
      return;
    }
    const blob = await response.blob();
    saveBlob(filename, blob);
  }

  async function saveInlineRename(id: string) {
    const title = editingTitle.trim();
    if (!title) return;
    await api(`/admin/ai/conversations/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ title })
    });
    setEditingConversationId(null);
    setEditingTitle("");
    await refreshConversations(search, 1, false);
  }

  async function onPickFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    const selected = Array.from(files).slice(0, MAX_ATTACHMENTS);
    try {
      const next = await Promise.all(
        selected.map(async (file) => ({
          name: file.name,
          mimeType: file.type || "application/octet-stream",
          contentBase64: await toBase64(file)
        }))
      );
      setAttachments((current) => [...current, ...next].slice(0, MAX_ATTACHMENTS));
      setError(null);
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : "Failed to read file");
    }
  }

  async function sendStream(payload: {
    message: string;
    attachments: UploadAttachment[];
    pendingAction?: Record<string, unknown>;
    confirmAction?: boolean;
  }) {
    const response = await fetch(`${API_URL}/admin/ai/chat/stream`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token() ? { authorization: `Bearer ${token()}` } : {})
      },
      body: JSON.stringify({
        message: payload.message,
        pagePath: pathname,
        conversationId,
        attachments: payload.attachments,
        pendingAction: payload.pendingAction,
        confirmAction: payload.confirmAction
      })
    });
    if (!response.ok || !response.body) {
      throw new Error("Unable to start AI stream");
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";
      for (const rawEvent of events) {
        const line = rawEvent.split("\n").find((item) => item.startsWith("data: "));
        if (!line) continue;
        const data = JSON.parse(line.slice(6)) as AiStreamEvent;
        if ("conversationId" in data && data.conversationId) {
          setConversationId(data.conversationId);
        }
        if (data.type === "delta") {
          text += data.delta ?? "";
          setStreamingText(text);
        } else if (data.type === "error") {
          const msg = data.message ?? "AI stream failed";
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: msg,
              errorDetails: { code: data.code, details: data.details }
            }
          ]);
          setStreamingText("");
          setError(msg);
          setLastFailedPayload(payload);
        } else if (data.type === "done") {
          setMessages((current) => [
            ...current,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: data.reply?.trim() || text.trim() || "Done.",
              actionResult: data.actionResult ?? null,
              errorDetails: null,
              pendingAction: data.pendingAction ?? null,
              requiresConfirmation: Boolean(data.requiresConfirmation)
            }
          ]);
          setStreamingText("");
        }
      }
    }
  }

  async function onSend(options?: { pendingAction?: Record<string, unknown>; confirmAction?: boolean }) {
    const text = prompt.trim();
    if ((!text && !options?.pendingAction) || loading) return;
    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: options?.confirmAction ? "Confirm delete action." : text
    };
    setMessages((current) => [...current, userMessage]);
    if (!options?.pendingAction) setPrompt("");
    setLoading(true);
    setError(null);
    try {
      const streamPayload = {
        message: options?.pendingAction ? "Proceed with pending action." : text,
        attachments,
        pendingAction: options?.pendingAction,
        confirmAction: options?.confirmAction
      };
      await sendStream(streamPayload);
      setAttachments([]);
      await refreshConversations(search, 1, false);
      setLastFailedPayload(null);
    } catch (sendError) {
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Could not get AI response. Check provider and token in settings."
        }
      ]);
      setError(sendError instanceof Error ? sendError.message : "AI request failed");
    } finally {
      setLoading(false);
    }
  }

  async function retryLastFailedWorkflow() {
    if (!lastFailedPayload || loading) return;
    setLoading(true);
    setError(null);
    try {
      await sendStream(lastFailedPayload);
      await refreshConversations(search, 1, false);
      setLastFailedPayload(null);
    } catch (retryError) {
      setError(retryError instanceof Error ? retryError.message : "Retry failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="fixed bottom-6 right-6 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-[#2454ff] to-[#0ea5a4] text-white shadow-[0_16px_36px_rgba(36,84,255,0.42)] transition-all duration-300 hover:scale-105 hover:shadow-[0_22px_46px_rgba(36,84,255,0.5)]"
        onClick={() => setOpen((value) => !value)}
        aria-label={open ? "Close AI chat" : "Open AI chat"}
      >
        {open ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {open && (
        <div className="fixed bottom-0 right-0 z-40 h-[84vh] w-full overflow-hidden rounded-t-3xl border border-slate-200 bg-white shadow-[0_18px_56px_rgba(15,23,42,0.22)] animate-in dark:border-slate-700 dark:bg-slate-900 sm:bottom-24 sm:right-6 sm:h-auto sm:w-[min(440px,calc(100vw-24px))] sm:rounded-2xl">
          <div className="flex items-center gap-3 border-b border-slate-100 bg-gradient-to-r from-[#2454ff] to-[#0ea5a4] px-4 py-3 text-white dark:border-slate-700">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
              <Bot className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">AI-консультант</p>
              <p className="truncate text-xs text-white/85">Понимает текущую страницу и структуру ресурсов</p>
            </div>
            <Sparkles className="ml-auto h-4 w-4 text-white/80" />
          </div>

          <div className="flex min-h-0">
            <aside className="hidden w-44 shrink-0 border-r border-slate-100 bg-slate-50/80 p-2 dark:border-slate-700 dark:bg-slate-950/40 sm:block">
              <button type="button" className="btn-primary mb-2 h-9 w-full justify-center px-2 text-xs" onClick={startNewChat}>
                <Plus className="h-3.5 w-3.5" />
                New chat
              </button>
              <div className="mb-2 flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 dark:border-slate-700 dark:bg-slate-900">
                <Search className="h-3.5 w-3.5 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSearch(value);
                    void refreshConversations(value, 1, false);
                  }}
                  placeholder="Search chats"
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>
              <div className="max-h-[46vh] space-y-1 overflow-y-auto">
                {conversations.map((conversation) => (
                  <div
                    key={conversation.id}
                    className={`group w-full rounded-lg px-2 py-1.5 text-xs transition ${
                      conversationId === conversation.id
                        ? "bg-[#2454ff] text-white"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => void loadConversation(conversation.id)}
                      className="w-full text-left"
                    >
                      {editingConversationId === conversation.id ? (
                        <input
                          value={editingTitle}
                          onChange={(event) => setEditingTitle(event.target.value)}
                          onBlur={() => void saveInlineRename(conversation.id)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              void saveInlineRename(conversation.id);
                            }
                            if (event.key === "Escape") {
                              setEditingConversationId(null);
                              setEditingTitle("");
                            }
                          }}
                          autoFocus
                          className="w-full rounded border border-white/30 bg-white/10 px-1.5 py-1 text-xs outline-none"
                        />
                      ) : (
                        <span className="line-clamp-2">{conversation.title || "New chat"}</span>
                      )}
                    </button>
                    <div className="mt-1 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingConversationId(conversation.id);
                          setEditingTitle(conversation.title || "New chat");
                        }}
                        className="rounded p-1 hover:bg-black/10"
                        title="Rename"
                      >
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void removeConversation(conversation.id)}
                        className="rounded p-1 hover:bg-black/10"
                        title="Delete"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
                {conversationPage < conversationPages && (
                  <button
                    type="button"
                    className="btn-ghost mt-2 h-8 w-full px-2 text-xs"
                    onClick={() => void refreshConversations(search, conversationPage + 1, true)}
                  >
                    Load more
                  </button>
                )}
              </div>
            </aside>

            <div className="min-w-0 flex-1">
              <div className="border-b border-slate-100 px-3 py-2 dark:border-slate-700 sm:hidden">
                <button type="button" className="btn-primary h-8 px-3 text-xs" onClick={startNewChat}>
                  <Plus className="h-3.5 w-3.5" />
                  New chat
                </button>
              </div>

              <div ref={scrollRef} className="max-h-[58vh] space-y-3 overflow-y-auto p-4 sm:max-h-[52vh]">
            {messages.map((message, index) => (
              <div
                key={`${message.id}-${index}`}
                className={`max-w-[90%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed transition-all duration-200 ${
                  message.role === "assistant"
                    ? "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-200"
                    : "ml-auto bg-[#2454ff] text-white"
                }`}
              >
                {message.content}
                {message.requiresConfirmation && message.pendingAction && (
                  <div className="mt-2 flex gap-2">
                    <button className="btn-primary h-8 px-3 text-xs" onClick={() => void onSend({ pendingAction: message.pendingAction ?? undefined, confirmAction: true })}>
                      <Check className="h-3.5 w-3.5" />
                      Confirm delete
                    </button>
                    <button className="btn-ghost h-8 px-3 text-xs" onClick={() => setMessages((current) => current.filter((item) => item.id !== message.id))}>
                      <Trash2 className="h-3.5 w-3.5" />
                      Cancel
                    </button>
                  </div>
                )}
                {message.actionResult && typeof message.actionResult.downloadUrl === "string" && (
                  <div className="mt-2">
                    <button
                      type="button"
                      className="btn-ghost h-8 px-3 text-xs"
                      onClick={() => void downloadArtifact(message)}
                    >
                      Download file
                    </button>
                  </div>
                )}
                {message.actionResult &&
                  Array.isArray(message.actionResult.results) && (
                    <div className="mt-2 rounded-lg border border-slate-200 bg-white/60 p-2 text-xs text-slate-600 dark:border-slate-700 dark:bg-slate-900/40 dark:text-slate-300">
                      Workflow: {String(message.actionResult.stepsExecuted ?? message.actionResult.results.length)} steps executed
                      <div className="mt-1.5 space-y-1">
                        {message.actionResult.results.map((entry, idx) => (
                          <div key={idx} className="flex items-center justify-between">
                            <div className="min-w-0">
                              <span className="truncate">
                                Step {String((entry as Record<string, unknown>).step ?? idx + 1)} · {String((entry as Record<string, unknown>).type ?? "action")}
                              </span>
                              {String((entry as Record<string, unknown>).resource ?? "") &&
                                String((entry as Record<string, unknown>).targetId ?? "") && (
                                  <div className="mt-1">
                                    <a
                                      href={`/resources/${String((entry as Record<string, unknown>).resource)}/${String((entry as Record<string, unknown>).targetId)}`}
                                      className="text-[10px] font-semibold text-[#2454ff] hover:underline"
                                    >
                                      Open related record
                                    </a>
                                  </div>
                                )}
                            </div>
                            <span className="rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">SUCCESS</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                {(() => {
                  const details = message.errorDetails?.details;
                  if (!details || typeof details !== "object") return null;
                  const map = details as Record<string, unknown>;
                  return (
                    <div className="mt-2 rounded-lg border border-red-200 bg-red-50 p-2 text-xs text-red-700 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-300">
                      <div className="flex items-center justify-between gap-2">
                        <p className="font-semibold">Workflow diagnostics</p>
                        <button
                          type="button"
                          className="rounded border border-red-300 px-1.5 py-0.5 text-[10px] font-semibold"
                          onClick={() =>
                            setExpandedDiagnostics((current) => ({
                              ...current,
                              [message.id]: !current[message.id]
                            }))
                          }
                        >
                          {expandedDiagnostics[message.id] ? "Hide" : "Show"}
                        </button>
                      </div>
                      {expandedDiagnostics[message.id] && (
                        <div className="mt-1 space-y-1">
                          {"failedStep" in map && (
                            <p>
                              Failed step: {String(map.failedStep ?? "n/a")} ({String(map.failedStepType ?? "unknown")})
                            </p>
                          )}
                          {"partialResults" in map &&
                            Array.isArray(map.partialResults) &&
                            map.partialResults.length > 0 && (
                              <div>
                                <p className="font-semibold">Completed before failure:</p>
                                {map.partialResults.map((entry, idx) => {
                                  const obj = entry as Record<string, unknown>;
                                  return (
                                    <p key={idx}>
                                      #{String(obj.step ?? idx + 1)} {String(obj.type ?? "action")}
                                    </p>
                                  );
                                })}
                              </div>
                            )}
                          {"rolledBack" in map && <p>Rolled back: {JSON.stringify(map.rolledBack)}</p>}
                          {"rollbackFailures" in map && (
                            <p>Rollback failures: {JSON.stringify(map.rollbackFailures)}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ))}
            {streamingText && (
              <div className="max-w-[90%] rounded-2xl bg-slate-100 px-3.5 py-2.5 text-sm leading-relaxed text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {streamingText}
              </div>
            )}
            {loading && (
              <div className="inline-flex items-center gap-2 rounded-2xl bg-slate-100 px-3.5 py-2 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" />
                Generating...
              </div>
            )}
              </div>
            </div>
          </div>

          <div className="border-t border-slate-100 p-3 dark:border-slate-700">
            {attachments.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {attachments.map((attachment, index) => (
                  <span key={`${attachment.name}-${index}`} className="badge badge-blue">
                    {attachment.name}
                  </span>
                ))}
              </div>
            )}
            {!loading && (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {QUICK_PROMPTS.map((preset) => (
                  <button
                    key={preset}
                    type="button"
                    className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-500 transition hover:border-slate-300 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400 dark:hover:text-slate-200"
                    onClick={() => setPrompt(preset)}
                  >
                    {preset}
                  </button>
                ))}
              </div>
            )}
            {error && <p className="mb-2 text-xs text-red-500">{error}</p>}
            {lastFailedPayload && (
              <div className="mb-2">
                <button
                  type="button"
                  className="btn-ghost h-8 px-3 text-xs"
                  onClick={() => void retryLastFailedWorkflow()}
                  disabled={loading}
                >
                  Retry last failed workflow
                </button>
              </div>
            )}
            <div className="flex items-end gap-2">
              <button
                type="button"
                className="btn-ghost flex h-10 w-10 items-center justify-center p-0"
                onClick={() => fileInputRef.current?.click()}
                title="Attach file or image"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={(event) => {
                  void onPickFiles(event.target.files);
                  event.currentTarget.value = "";
                }}
              />
              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                rows={2}
                placeholder="Ask about current functionality or request an action..."
                className="input-base min-h-10 flex-1 resize-none"
              />
              <button type="button" className="btn-primary h-10 px-3" onClick={() => void onSend()} disabled={!canSend}>
                <Send className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
