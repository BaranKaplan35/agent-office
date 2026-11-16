/**
 * Google Gemini through the official `@google/genai` SDK. Structured plans use
 * `responseJsonSchema`. Gemini's "thinking" tokens count against the output
 * limit, so thinking is kept low and the limit gets some headroom.
 */
import {
  ApiError,
  GoogleGenAI,
  ThinkingLevel,
  type GenerateContentParameters,
} from '@google/genai';
import {
  describeDailyQuota,
  describeStatus,
  isAbort,
  isRetryableStatus,
  LLMError,
} from '../errors';
import { PLAN_JSON_SCHEMA } from '../planSchema';
import { toUsage } from '../usage';
import type { LLMProvider, LLMRequest, LLMResponse } from '../types';

/** The part of the SDK this adapter uses (tests pass a fake). */
export interface GeminiModels {
  generateContent(params: GenerateContentParameters): Promise<{
    text?: string;
    candidates?: Array<{ finishReason?: string }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
      thoughtsTokenCount?: number;
    };
  }>;
}

export interface GeminiOptions {
  apiKey: string;
  models?: GeminiModels;
}

/** Extra output room for thinking tokens. */
export const THINKING_HEADROOM = 2048;

/**
 * Gemini 2.x takes a thinking budget in tokens; 3.x and later only a level
 * (a budget is rejected there). Other models get no thinking setting.
 */
export function thinkingFor(model: string): GenerateContentParameters['config'] {
  const version = /^gemini-(\d+)/.exec(model)?.[1];
  if (!version) return {};
  return Number(version) >= 3
    ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } }
    : { thinkingConfig: { thinkingBudget: 512 } };
}

export function createGeminiProvider(options: GeminiOptions): LLMProvider {
  const models = options.models ?? new GoogleGenAI({ apiKey: options.apiKey }).models;

  return {
    name: 'gemini',
    async generate(request: LLMRequest): Promise<LLMResponse> {
      const model = request.model ?? '';
      let res: Awaited<ReturnType<GeminiModels['generateContent']>>;
      try {
        res = await models.generateContent({
          model,
          contents: request.messages.map((m) => ({
            role: m.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: m.content }],
          })),
          config: {
            systemInstruction: request.system,
            maxOutputTokens: request.maxOutputTokens + THINKING_HEADROOM,
            ...thinkingFor(model),
            ...(request.json
              ? { responseMimeType: 'application/json', responseJsonSchema: PLAN_JSON_SCHEMA }
              : {}),
            abortSignal: request.signal,
          },
        });
      } catch (err) {
        if (isAbort(err) || request.signal?.aborted) throw err;
        if (err instanceof ApiError) {
          const daily = err.status === 429 ? describeDailyQuota(err.message) : null;
          if (daily) {
            throw new LLMError({
              provider: 'gemini',
              model,
              status: err.status,
              message: daily,
              retryable: false,
              cause: err,
            });
          }
          throw new LLMError({
            provider: 'gemini',
            model,
            status: err.status,
            message: describeStatus(err.status, firstLine(err.message)),
            retryable: isRetryableStatus(err.status),
            cause: err,
          });
        }
        throw new LLMError({
          provider: 'gemini',
          model,
          message: `could not reach the Gemini API (${firstLine((err as Error).message)})`,
          retryable: true,
          cause: err,
        });
      }

      const text = res.text ?? '';
      if (!text.trim()) {
        const finish = res.candidates?.[0]?.finishReason ?? 'unknown';
        throw new LLMError({
          provider: 'gemini',
          model,
          message: `the model returned no text (finish reason: ${finish})`,
          retryable: finish !== 'SAFETY',
        });
      }
      const usage = res.usageMetadata;
      return {
        text,
        // Thinking counts as output: it is billed and limited like output.
        usage: toUsage(
          usage?.promptTokenCount,
          usage?.candidatesTokenCount === undefined && usage?.thoughtsTokenCount === undefined
            ? undefined
            : (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0),
        ),
        ...(res.candidates?.[0]?.finishReason === 'MAX_TOKENS' ? { truncated: true } : {}),
      };
    },
  };
}

function firstLine(message: string): string {
  return message.split('\n')[0]?.slice(0, 200) ?? '';
}
