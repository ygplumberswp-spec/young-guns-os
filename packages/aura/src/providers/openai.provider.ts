import { buildSystemPrompt } from '../prompts.js';
import type { AuraGenerateRequest, AuraProvider } from '../types.js';
import { AuraProviderError } from '../types.js';

export type OpenAiProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl: string;
  requestTimeoutMs?: number;
};

type OpenAiChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
};

export class OpenAiProvider implements AuraProvider {
  readonly name = 'openai';

  constructor(private readonly config: OpenAiProviderConfig) {}

  async generate(request: AuraGenerateRequest): Promise<string> {
    const systemPrompt = buildSystemPrompt(request.context);
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      ...request.messages.filter((message) => message.role !== 'system'),
    ];

    let response: Response;

    const timeoutMs = this.config.requestTimeoutMs ?? 60_000;
    const signal =
      typeof AbortSignal.timeout === 'function'
        ? AbortSignal.timeout(timeoutMs)
        : undefined;

    try {
      response = await fetch(`${this.config.baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify({
          model: this.config.model,
          messages,
          temperature: 0.7,
          max_tokens: 1024,
        }),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'TimeoutError') {
        throw new AuraProviderError(
          'PROVIDER_TIMEOUT',
          'The AI provider did not respond in time. Please try again.',
        );
      }

      throw new AuraProviderError(
        'PROVIDER_UNAVAILABLE',
        'Unable to reach the AI provider. Check your network connection.',
      );
    }

    const payload = (await response.json()) as OpenAiChatCompletionResponse;

    if (!response.ok) {
      throw new AuraProviderError(
        'PROVIDER_REQUEST_FAILED',
        payload.error?.message ?? 'The AI provider rejected the request.',
        { status: response.status },
      );
    }

    const content = payload.choices?.[0]?.message?.content?.trim();

    if (!content) {
      throw new AuraProviderError('PROVIDER_EMPTY_RESPONSE', 'The AI provider returned an empty response.');
    }

    return content;
  }
}
