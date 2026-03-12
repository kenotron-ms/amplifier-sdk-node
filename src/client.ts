import { Session } from './session';
import { PythonBridgeTransport } from './transport';
import { BundleLoadError, BundleValidationError } from './errors';
import type {
  AmplifierClientOptions,
  BundleHandle,
  HookOutput,
  PreparedBundleHandle,
  SessionOptions,
  Transport,
} from './types';

export class AmplifierClient {
  private readonly options: AmplifierClientOptions;
  private readonly transport: Transport;
  private started = false;

  constructor(options?: AmplifierClientOptions) {
    this.options = options ?? {};
    this.transport =
      this.options.transport ??
      new PythonBridgeTransport({
        pythonPath: this.options.pythonPath,
        cwd: this.options.cwd,
      });
  }

  private async ensureStarted(): Promise<void> {
    if (this.started) return;

    // Register reverse-call handler for hooks and approval
    const unsubRequest = this.transport.onRequest(async (method, params) => {
      if (method === 'hook.preToolUse' || method === 'hook.postToolUse') {
        return this.handleHook(method, params);
      }
      if (method === 'approval.request') {
        return this.handleApproval(params);
      }
      return null;
    });

    try {
      await this.transport.start();
      this.started = true;
    } catch (err) {
      unsubRequest();
      throw err;
    }
  }

  async loadBundle(source: string): Promise<BundleHandle> {
    await this.ensureStarted();
    const result = (await this.transport.request('bundle.load', { source })) as Record<string, unknown>;
    if (!result['handle']) {
      throw new BundleLoadError(`Failed to load bundle from '${source}'`);
    }
    return { _handle: result['handle'] as string, name: result['name'] as string | undefined };
  }

  async prepareBundle(bundle: BundleHandle): Promise<PreparedBundleHandle> {
    await this.ensureStarted();
    const result = (await this.transport.request('bundle.prepare', {
      handle: bundle._handle,
    })) as Record<string, unknown>;
    return { _handle: result['handle'] as string };
  }

  async composeBundle(base: BundleHandle, ...overlays: BundleHandle[]): Promise<BundleHandle> {
    await this.ensureStarted();
    const result = (await this.transport.request('bundle.compose', {
      base: base._handle,
      overlays: overlays.map((o) => o._handle),
    })) as Record<string, unknown>;
    return { _handle: result['handle'] as string, name: result['name'] as string | undefined };
  }

  async createSession(optionsOrPrepared?: SessionOptions | PreparedBundleHandle, sessionOptions?: SessionOptions): Promise<Session> {
    await this.ensureStarted();

    let preparedHandle: string | undefined;
    let opts: SessionOptions | undefined;

    if (optionsOrPrepared && '_handle' in optionsOrPrepared) {
      preparedHandle = (optionsOrPrepared as PreparedBundleHandle)._handle;
      opts = sessionOptions;
    } else {
      opts = optionsOrPrepared as SessionOptions | undefined;
    }

    const params: Record<string, unknown> = {};

    if (preparedHandle) {
      params['handle'] = preparedHandle;
    } else if (this.options.bundle) {
      // Auto-load and prepare the client-level bundle
      const bundle = await this.loadBundle(this.options.bundle);
      const prepared = await this.prepareBundle(bundle);
      params['handle'] = prepared._handle;
    }

    if (this.options.cwd) params['cwd'] = this.options.cwd;
    if (this.options.provider) params['provider'] = this.options.provider;
    if (this.options.model) params['model'] = this.options.model;
    if (opts?.systemPrompt) params['systemPrompt'] = opts.systemPrompt;
    if (opts?.maxTokens) params['maxTokens'] = opts.maxTokens;
    if (this.options.hooks) params['hookEvents'] = Object.keys(this.options.hooks);
    if (this.options.onApproval) params['hasApprovalHandler'] = true;

    const result = (await this.transport.request('session.create', params)) as Record<string, unknown>;
    return new Session(
      result['sessionId'] as string,
      result['handle'] as string,
      this.transport,
    );
  }

  async close(): Promise<void> {
    if (!this.started) return;
    await this.transport.close();
    this.started = false;
  }

  private async handleHook(method: string, params: Record<string, unknown>): Promise<HookOutput> {
    const hooks = this.options.hooks;
    if (!hooks) return { action: 'allow' };

    const toolName = params['toolName'] as string;
    const handlers =
      method === 'hook.preToolUse' ? hooks.preToolUse : hooks.postToolUse;

    if (!handlers) return { action: 'allow' };

    for (const handler of handlers) {
      if (handler.toolName && handler.toolName !== toolName) continue;
      const result = await handler.handler({
        event: method,
        toolName,
        toolInput: params['toolInput'] as Record<string, unknown>,
        toolResult: params['toolResult'] as string | undefined,
      });
      if (result.action !== 'allow') return result;
    }

    return { action: 'allow' };
  }

  private async handleApproval(params: Record<string, unknown>): Promise<{ approved: boolean }> {
    if (!this.options.onApproval) return { approved: true };
    const approved = await this.options.onApproval({
      toolName: params['toolName'] as string,
      toolInput: (params['toolInput'] as Record<string, unknown>) ?? {},
      description: params['description'] as string | undefined,
    });
    return { approved };
  }
}
