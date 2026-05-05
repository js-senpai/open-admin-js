export type AiStreamDeltaEvent = {
  type: "delta";
  delta: string;
  conversationId?: string;
};

export type AiStreamDoneEvent = {
  type: "done";
  conversationId?: string;
  reply?: string;
  actionResult?: Record<string, unknown> | null;
  pendingAction?: Record<string, unknown> | null;
  requiresConfirmation?: boolean;
};

export type AiStreamErrorEvent = {
  type: "error";
  message: string;
  code?: string;
  details?: unknown;
};

export type AiStreamEvent = AiStreamDeltaEvent | AiStreamDoneEvent | AiStreamErrorEvent;
