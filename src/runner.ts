import { spawn } from 'child_process';
import { checkBinaryVersion, discoverBinary } from './binary';
import { AmplifierProcessError, AmplifierSessionError } from './errors';
import type { ResultMessage } from './types';

// ─── Module-level one-time version check ────────────────────────────────────

let versionChecked = false;

/** Reset the one-time version-check flag — for use in tests only. */
export function _resetVersionChecked(): void {
  versionChecked = false;
}

// ─── Public options type ──────────────────────────────────────────────────────

export interface RunnerOptions {
  binaryPath?: string;
  timeoutMs?: number;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Extract and parse the first JSON object from a string.
 * Handles leading text such as "Bundle 'foundation' prepared successfully\n{...}".
 */
function extractJson(s: string): Record<string, unknown> | null {
  const start = s.indexOf('{');
  if (start === -1) return null;
  try {
    return JSON.parse(s.slice(start)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Normalize a raw parsed JSON object (may use snake_case keys) into ResultMessage. */
function normalizeResult(raw: Record<string, unknown>): ResultMessage {
  // Guard required fields: sessionId must be present in either form
  const sessionId = (raw['sessionId'] ?? raw['session_id']) as string | undefined;
  if (!sessionId) {
    throw new AmplifierProcessError(
      'Missing sessionId in Amplifier output',
      JSON.stringify(raw),
    );
  }

  return {
    type: raw['type'] as 'result',
    status: raw['status'] as 'success' | 'error',
    response: raw['response'] as string | undefined,
    error: raw['error'] as string | undefined,
    // Accept either camelCase (pass-through) or snake_case from the binary
    errorType: (raw['errorType'] ?? raw['error_type']) as string | undefined,
    sessionId,
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

      // Parse JSON — try stdout first, fall back to stderr.
      // Some amplifier versions write the JSON result to stderr alongside
      // status lines like "Bundle 'foundation' prepared successfully".
      const parsed = extractJson(stdoutData) ?? extractJson(stderrData);
      if (parsed === null) {
        reject(
          new AmplifierProcessError(
            'Failed to parse Amplifier JSON output',
            stderrData,
          ),
        );
        return;
      }

      let result: ResultMessage;
      try {
        result = normalizeResult(parsed);
      } catch (err) {
        reject(err);
        return;
      }

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
