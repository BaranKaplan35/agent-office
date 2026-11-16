/**
 * Anthropic Claude through the official `@anthropic-ai/sdk`. Claude has no JSON
 * mode, so a structured plan is requested as a forced tool call whose input
 * follows the plan schema; the tool input is handed on as JSON text.
 */
import Anthropic from '@anthropic-ai/sdk';
import { describeStatus, isAbort, isRetryableStatus, LLMError, parseRetryAfter } from '../errors';
import { PLAN_JSON_SCHEMA } from '../planSchema';
import { toUsage } from '../usage';
import type { LLMProvider, LLMRequest, LLMResponse } from '../types';

const PLAN_TOOL = 'submit_plan';

type CreateParams = Anthropic.MessageCreateParamsNonStreaming;

/** The part of the SDK this adapter uses (tests pass a fake). */
export interface AnthropicMessages {
  create(
    params: CreateParams,
    options?: { signal?: AbortSignal },
  ): Promise<{
    content: Array<{ type: string; text?: string; name?: string; input?: unknown }>;
    usage?: { input_tokens?: number; output_tokens?: number };
    stop_reason?: string | null;
  }>;
}

export interface AnthropicOptions {
  apiKey: string;
  messages?: AnthropicMessages;
}

export function createAnthropicProvider(options: AnthropicOptions): LLMProvider {
  // Retries are handled by the router (one policy for every provider).
  const messages =
    options.messages ??
    (new Anthropic({ apiKey: options.apiKey, maxRetries: 0 })
      .messages as unknown as AnthropicMessages);

  return {
    name: 'anthropic',
    async generate(request: LLMRequest): Promise<LLMResponse> {
      const model = request.model ?? '';
      const params: CreateParams = {
        model,
        max_tokens: request.maxOutputTokens,
        system: request.system,
        messages: request.messages.map((m) => ({ role: m.role, content: m.content })),
        ...(request.json
          ? {
              tools: [
                {
                  name: PLAN_TOOL,
                  description:
                    'Hand in your decision: a plan (summary and one subtask per worker) or, for an unclear task, a short reply with questions.',
                  input_schema: PLAN_JSON_SCHEMA as unknown as Anthropic.Tool.InputSchema,
                },
              ],
              tool_choice: { type: 'tool', name: PLAN_TOOL },
            }
          : {}),
      };

      let res: Awaited<ReturnType<AnthropicMessages['create']>>;
      try {
        res = await messages.create(params, { signal: request.signal });
      } catch (err) {
        if (isAbort(err) || request.signal?.aborted) throw err;
        if (err instanceof Anthropic.APIError && typeof err.status === 'number') {
          const headers = err.headers as Headers | undefined;
          throw new LLMError({
            provider: 'anthropic',
            model,
            status: err.status,
            message: describeStatus(err.status, err.type ?? undefined),
            retryable: isRetryableStatus(err.status),
            retryAfterMs: parseRetryAfter(headers?.get?.('retry-after')),
            cause: err,
          });
        }
        throw new LLMError({
          provider: 'anthropic',
          model,
          message: `could not reach the Anthropic API (${(err as Error).message})`,
          retryable: true,
          cause: err,
        });
      }

      const tool = res.content.find((c) => c.type === 'tool_use' && c.name === PLAN_TOOL);
      const text = tool
        ? JSON.stringify(tool.input ?? {})
        : res.content
            .filter((c) => c.type === 'text')
            .map((c) => c.text ?? '')
            .join('');
      return {
        text,
        usage: toUsage(res.usage?.input_tokens, res.usage?.output_tokens),
        ...(res.stop_reason === 'max_tokens' ? { truncated: true } : {}),
      };
    },
  };
}
