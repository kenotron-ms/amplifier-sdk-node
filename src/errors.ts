export class AmplifierBinaryNotFoundError extends Error {
  override readonly name = 'AmplifierBinaryNotFoundError';

  constructor() {
    super(
      'Amplifier binary not found. Install it with: npm install amplifier',
    );
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AmplifierProcessError extends Error {
  override readonly name = 'AmplifierProcessError';
  readonly stderr: string;
  readonly code: string | undefined;

  constructor(message: string, stderr: string, code?: string) {
    super(message);
    this.stderr = stderr;
    this.code = code;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class AmplifierSessionError extends Error {
  override readonly name = 'AmplifierSessionError';
  readonly errorType: string | undefined;

  constructor(message: string, errorType?: string) {
    super(message);
    this.errorType = errorType;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
