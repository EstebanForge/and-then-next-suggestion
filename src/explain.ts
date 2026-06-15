import { ProviderProfile } from './providers/types';

/**
 * Chat-style "explain this code" request builder.
 *
 * Unlike the Dialect classes (which build FIM completion requests), this module
 * builds a conversational chat request per apiType. It is pure (no vscode, no
 * fetch) so it can be unit-tested the same way the dialects are.
 *
 * The Dialect abstraction stays focused on inline completion; explain is a
 * separate concern with its own prompt shape and response handling.
 *
 * The switch below is exhaustive over ProviderProfile['apiType']. If a new
 * apiType is added to the union, the `never` assignment fails to compile,
 * forcing this module to be updated rather than silently falling through.
 */

const SYSTEM_PROMPT = 'You are an expert software engineer. Explain the selected code clearly and concisely. Describe what it does, how it works step by step, and note any important details, edge cases, or potential improvements. Use plain language with short paragraphs or bullet points.';

export function buildExplainRequest(
    profile: ProviderProfile,
    apiKey: string | undefined,
    code: string
): { url: string; init: RequestInit } {
    const userPrompt = `Explain this code:\n\n\`\`\`\n${code}\n\`\`\``;
    const maxTokens = profile.maxTokens ?? 2000;

    switch (profile.apiType) {
        case 'anthropic':
            return {
                url: profile.endpoint,
                init: {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'anthropic-version': '2023-06-01',
                        ...(apiKey ? { 'x-api-key': apiKey } : {})
                    },
                    body: JSON.stringify({
                        model: profile.model,
                        system: SYSTEM_PROMPT,
                        messages: [{ role: 'user', content: userPrompt }],
                        max_tokens: maxTokens,
                        temperature: 0.3
                    })
                }
            };

        case 'ollama':
            return {
                url: profile.endpoint,
                init: {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        model: profile.model,
                        prompt: userPrompt,
                        system: SYSTEM_PROMPT,
                        stream: false,
                        options: { num_predict: maxTokens, temperature: 0.3 }
                    })
                }
            };

        case 'openai':
        case 'custom':
            // Both use the OpenAI-compatible chat format. Custom profiles with a
            // FIM-specific customBody template fall back to this standard chat
            // shape for explain (most custom endpoints are OpenAI-compatible).
            return {
                url: profile.endpoint,
                init: {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {})
                    },
                    body: JSON.stringify({
                        model: profile.model || '',
                        messages: [
                            { role: 'system', content: SYSTEM_PROMPT },
                            { role: 'user', content: userPrompt }
                        ],
                        max_tokens: maxTokens,
                        temperature: 0.3
                    })
                }
            };

        default: {
            // Exhaustiveness guard: a new apiType added to the union makes this
            // line fail to compile, preventing silent fallthrough.
            const _exhaustive: never = profile.apiType;
            throw new Error(`Unsupported apiType for explain: ${_exhaustive}`);
        }
    }
}

export function parseExplainResponse(apiType: ProviderProfile['apiType'], data: any): string | null {
    switch (apiType) {
        case 'anthropic':
            return data.content?.[0]?.text || null;
        case 'ollama':
            return data.response || null;
        case 'openai':
        case 'custom':
            return data.choices?.[0]?.message?.content || data.choices?.[0]?.text || null;
        default: {
            const _exhaustive: never = apiType;
            throw new Error(`Unsupported apiType for explain parse: ${_exhaustive}`);
        }
    }
}
