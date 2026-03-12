// === Messages (discriminated union) ===

export interface TextMessage {
  type: 'text';
  content: string;
}

export interface ThinkingMessage {
  type: 'thinking';
  content: string;
}

export interface ToolUseMessage {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

export interface ToolResultMessage {
  type: 'tool_result';
  toolUseId: string;
  content: string;
  isError?: boolean;
}

export interface ResultMessage {
  type: 'result';
  response: string;
  sessionId: string;
  model?: string;
  usage?: Usage;
}

export type Message =
  | TextMessage
  | ThinkingMessage
  | ToolUseMessage
  | ToolResultMessage
  | ResultMessage;

// === Configuration ===

export interface QueryOptions {
  bundle?: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
  hooks?: HookConfig;
  onApproval?: ApprovalHandler;
  timeoutMs?: number;
  cwd?: string;
  pythonPath?: string;
}

export interface AmplifierClientOptions {
  bundle?: string;
  provider?: string;
  model?: string;
  pythonPath?: string;
  hooks?: HookConfig;
  onApproval?: ApprovalHandler;
  cwd?: string;
  transport?: Transport;
}

export interface SessionOptions {
  systemPrompt?: string;
  maxTokens?: number;
}

// === Hooks ===

export interface HookConfig {
  preToolUse?: HookHandler[];
  postToolUse?: HookHandler[];
}

export interface HookHandler {
  toolName?: string;
  handler: (input: HookInput) => Promise<HookOutput>;
}

export interface HookInput {
  event: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string;
}

export type HookOutput =
  | { action: 'allow' }
  | { action: 'deny'; reason?: string }
  | { action: 'modify'; toolInput: Record<string, unknown> };

// === Approval ===

export interface ApprovalRequest {
  toolName: string;
  toolInput: Record<string, unknown>;
  description?: string;
}

export type ApprovalHandler = (request: ApprovalRequest) => Promise<boolean>;

// === Handles (opaque references to Python-side objects) ===

export interface BundleHandle {
  readonly _handle: string;
  readonly name?: string;
}

export interface PreparedBundleHandle {
  readonly _handle: string;
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
}

// === Transport ===

export interface Transport {
  start(): Promise<void>;
  request(method: string, params?: Record<string, unknown>): Promise<unknown>;
  notify(method: string, params?: Record<string, unknown>): void;
  onNotification(handler: (method: string, params: Record<string, unknown>) => void): () => void;
  onRequest(handler: (method: string, params: Record<string, unknown>) => Promise<unknown>): () => void;
  close(): Promise<void>;
  readonly isRunning: boolean;
}

// === Type Guards ===

export function isTextMessage(msg: Message): msg is TextMessage {
  return msg.type === 'text';
}

export function isThinkingMessage(msg: Message): msg is ThinkingMessage {
  return msg.type === 'thinking';
}

export function isToolUseMessage(msg: Message): msg is ToolUseMessage {
  return msg.type === 'tool_use';
}

export function isToolResultMessage(msg: Message): msg is ToolResultMessage {
  return msg.type === 'tool_result';
}

export function isResultMessage(msg: Message): msg is ResultMessage {
  return msg.type === 'result';
}
