import { buildSystemPrompt } from '../prompts.js';
import type { AuraGenerateRequest, AuraProvider } from '../types.js';
import { AuraProviderError } from '../types.js';

export type GeminiProviderConfig = {
  apiKey: string;
  model: string;
  baseUrl?: string;
};

type GeminiResponse = {
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  error?: { message?: string };
};

export class GeminiProvider implements AuraProvider {
  readonly name = 'google_gemini';

  constructor(private readonly config: GeminiProviderConfig) {}

  async generate(request: AuraGenerateRequest): Promise<string> {
    const systemPrompt = buildSystemPrompt(request.context);
    const conversation = request.messages
      .filter((message) => message.role !== 'system')
      .map((message) => ({
        role: message.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: message.content }],
      }));

    const baseUrl = (
      this.config.baseUrl ?? 'https://generativelanguage.googleapis.com/v1beta'
    ).replace(/\/$/, '');
    const url = `${baseUrl}/models/${encodeURIComponent(this.config.model)}:generateContent?key=${encodeURIComponent(this.config.apiKey)}`;

    let response: Response;

    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: conversation,
        }),
      });
    } catch {
      throw new AuraProviderError(
        'PROVIDER_UNAVAILABLE',
        'Unable to reach Google Gemini. Check your network connection.',
      );
    }

    const payload = (await response.json()) as GeminiResponse;

    if (!response.ok) {
      throw new AuraProviderError(
        'PROVIDER_REQUEST_FAILED',
        payload.error?.message ?? 'Gemini rejected the request.',
        { status: response.status },
      );
    }

    const content = payload.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!content) {
      throw new AuraProviderError('PROVIDER_EMPTY_RESPONSE', 'Gemini returned an empty response.');
    }

    return content;
  }
}
