import { spawn } from 'child_process';
import { checkBinaryVersion, discoverBinary } from './binary';
import { AmplifierProcessError, AmplifierSessionError } from './errors';
import type { ResultMessage } from './types';

// ─── Module-level one-time version check ────────────────────────────────────

let versionChecked = false;

// ─── Public options type ──────────────────────────────────────────────────────

export interface RunnerOptions {
  binaryPath?: string;
  timeoutMs?: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Normalize a raw parsed JSON object (may use snake_case keys) into ResultMessage. */
function normalizeResult(raw: Record<string, unknown>): ResultMessage {
  return {
    type: raw['type'] as 'result',
    status: raw['status'] as 'success' | 'error',
    response: raw['response'] as string | undefined,
    error: raw['error'] as string | undefined,
    // Accept either camelCase (pass-through) or snake_case from the binary
    errorType: (raw['errorType'] ?? raw['error_type']) as string | undefined,
    sessionId: (raw['sessionId'] ?? raw['session_id']) as string,
    bundle: raw['bundle'] as string,
    model: raw['model'] as string,
    timestamp: raw['timestamp'] as string,
  };
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Spawn the Amplifier binary with the given args and return a resolved
 * ResultMessage, or throw on process/session errors.
 */
export async function runAmplifier(
  args: string[],
  options?: RunnerOptions,
): Promise<ResultMessage> {
  const binaryPath = options?.binaryPath ?? discoverBinary();

  // One-time version check on the first call
  if (!versionChecked) {
    versionChecked = true;
    checkBinaryVersion(binaryPath);
  }

  return new Promise<ResultMessage>((resolve, reject) => {
    const proc = spawn(binaryPath, args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let stdoutData = '';
    let stderrData = '';
    let timedOut = false;

    // Cleanup: ensure child is killed if the host process exits
    const exitHandler = () => {
      proc.kill();
    };
    process.on('exit', exitHandler);

    // Timeout: kill the child after the given delay
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (options?.timeoutMs !== undefined) {
      timer = setTimeout(() => {
        timedOut = true;
        proc.kill();
      }, options.timeoutMs);
    }

    proc.stdout.on('data', (chunk: Buffer) => {
      stdoutData += chunk.toString();
    });

    proc.stderr.on('data', (chunk: Buffer) => {
      stderrData += chunk.toString();
    });

    proc.on('close', (code: number | null) => {
      if (timer !== undefined) clearTimeout(timer);
      process.removeListener('exit', exitHandler);

      // Timeout path
      if (timedOut) {
        reject(
          new AmplifierProcessError(
            'Amplifier process timed out',
            stderrData,
            'TIMEOUT',
          ),
        );
        return;
      }

      // Non-zero exit path
      if (code !== 0) {
        reject(
          new AmplifierProcessError(
            `Amplifier process exited with code ${code}`,
            stderrData,
          ),
        );
        return;
      }

      // Parse JSON output
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(stdoutData) as Record<string, unknown>;
      } catch {
        reject(
          new AmplifierProcessError(
            'Failed to parse Amplifier JSON output',
            stdoutData,
          ),
        );
        return;
      }

      const result = normalizeResult(parsed);

      // Session-level error reported inside the JSON payload
      if (result.status === 'error') {
        reject(
          new AmplifierSessionError(
            result.error ?? 'Amplifier session error',
            result.errorType,
          ),
        );
        return;
      }

      resolve(result);
    });
  });
}
