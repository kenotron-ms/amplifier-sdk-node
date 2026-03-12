export class AmplifierError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AmplifierError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class PythonNotFoundError extends AmplifierError {
  constructor(message = 'Python 3.11+ not found. Install it from https://python.org or via uv.') {
    super(message);
    this.name = 'PythonNotFoundError';
  }
}

export class FoundationNotInstalledError extends AmplifierError {
  constructor(
    message = 'amplifier-foundation is not installed. Run: uv tool install amplifier',
  ) {
    super(message);
    this.name = 'FoundationNotInstalledError';
  }
}

export class BridgeError extends AmplifierError {
  readonly code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'BridgeError';
    this.code = code;
  }
}

export class BridgeTimeoutError extends BridgeError {
  constructor(message = 'Bridge request timed out', timeoutMs?: number) {
    super(message, 'TIMEOUT');
    this.name = 'BridgeTimeoutError';
    if (timeoutMs !== undefined) {
      this.message = `${message} (after ${timeoutMs}ms)`;
    }
  }
}

export class BridgeCrashedError extends BridgeError {
  readonly stderr?: string;

  constructor(message: string, stderr?: string) {
    super(message, 'CRASHED');
    this.name = 'BridgeCrashedError';
    this.stderr = stderr;
  }
}

export class SessionError extends AmplifierError {
  readonly sessionId?: string;

  constructor(message: string, sessionId?: string) {
    super(message);
    this.name = 'SessionError';
    this.sessionId = sessionId;
  }
}

export class BundleLoadError extends AmplifierError {
  constructor(message: string) {
    super(message);
    this.name = 'BundleLoadError';
  }
}

export class BundleValidationError extends AmplifierError {
  readonly errors: string[];
  readonly warnings: string[];

  constructor(message: string, errors: string[], warnings: string[]) {
    super(message);
    this.name = 'BundleValidationError';
    this.errors = errors;
    this.warnings = warnings;
  }
}
