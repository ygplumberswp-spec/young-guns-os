import { buildSystemPrompt } from '../prompts.js';
import type { AuraGenerateRequest, AuraProvider } from '../types.js';
import { AuraProviderError } from '../types.js';

export type AnthropicProviderConfig = {
  apiKey: string;
  model: string;
  apiVersion?: string;
};

type AnthropicResponse = {
  content?: Array<{ type?: string; text?: string }>;
  error?: { message?: string };
};

export class AnthropicProvider implements AuraProvider {
  readonly name = 'anthropic_claude';

  constructor(private readonly config: AnthropicProviderConfig) {}

  async generate(request: AuraGenerateRequest): Promise<string> {
    const systemPrompt = buildSystemPrompt(request.context);
    const messages = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? ('assistant' as const) : ('user' as const),
        content: message.content,
      }));

    let response: Response;

    try {
      response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey,
          'anthropic-version': this.config.apiVersion ?? '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.model,
          max_tokens: 2048,
          system: systemPrompt,
          messages,
        }),
      });
    } catch {
      throw new AuraProviderError(
        'PROVIDER_UNAVAILABLE',
        'Unable to reach Anthropic. Check your network connection.',
      );
    }

    const payload = (await response.json()) as AnthropicResponse;

    if (!response.ok) {
      throw new AuraProviderError(
        'PROVIDER_REQUEST_FAILED',
        payload.error?.message ?? 'Anthropic rejected the request.',
        { status: response.status },
      );
    }

    const content = payload.content?.find((block) => block.type === 'text')?.text?.trim();
    if (!content) {
      throw new AuraProviderError(
        'PROVIDER_EMPTY_RESPONSE',
        'Anthropic returned an empty response.',
      );
    }

    return content;
  }
}
