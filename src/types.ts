export interface ResultMessage {
  type: 'result';
  status: 'success' | 'error';
  response?: string;
  error?: string;
  errorType?: string;
  sessionId: string;
  bundle: string;
  model: string;
  timestamp: string;
}

export interface QueryOptions {
  sessionId?: string;
  bundle?: string;
  provider?: string;
  model?: string;
  maxTokens?: number;
  binaryPath?: string;
  timeoutMs?: number;
}

export interface AmplifierClientOptions {
  bundle?: string;
  provider?: string;
  model?: string;
  binaryPath?: string;
}

export interface SessionResult extends ResultMessage {
  sessionId: string;
}
