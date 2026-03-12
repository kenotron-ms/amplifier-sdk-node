// Functions
export { query } from './query';

// Classes
export { AmplifierClient } from './client';
export { Session } from './session';
export { PythonBridgeTransport } from './transport';

// Errors
export {
  AmplifierError,
  PythonNotFoundError,
  FoundationNotInstalledError,
  BridgeError,
  BridgeTimeoutError,
  BridgeCrashedError,
  SessionError,
  BundleLoadError,
  BundleValidationError,
} from './errors';

// Types
export type {
  Message,
  TextMessage,
  ThinkingMessage,
  ToolUseMessage,
  ToolResultMessage,
  ResultMessage,
  QueryOptions,
  AmplifierClientOptions,
  SessionOptions,
  HookConfig,
  HookHandler,
  HookInput,
  HookOutput,
  ApprovalRequest,
  ApprovalHandler,
  BundleHandle,
  PreparedBundleHandle,
  Usage,
  Transport,
} from './types';

// Type Guards
export {
  isTextMessage,
  isThinkingMessage,
  isToolUseMessage,
  isToolResultMessage,
  isResultMessage,
} from './types';
