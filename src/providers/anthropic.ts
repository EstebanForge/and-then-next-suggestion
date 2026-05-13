import { BaseDialect, sanitize } from './base';
import { CompletionContext, ProviderProfile } from './types';

export class AnthropicDialect extends BaseDialect {
    readonly type = 'anthropic';

    protected prepareHeaders(apiKey?: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
            'anthropic-version': '2023-06-01',
        };

        if (apiKey) {
            headers['x-api-key'] = apiKey;
        }

        return headers;
    }

    protected prepareBody(ctx: CompletionContext, profile: ProviderProfile): any {
        return {
            model: profile.model,
            system: `You are a code completion engine for ${ctx.languageId}${ctx.fileExtension ? ` (${ctx.fileExtension})` : ''}. Output ONLY the code to insert at the cursor. No repetition of surrounding code. No explanations. No markdown. No backticks. Raw code only.`,
            messages: [
                {
                    role: 'user',
                    content: `BEFORE CURSOR:\n${ctx.textBefore}\nAFTER CURSOR:\n${ctx.textAfter}\nOUTPUT:`
                }
            ],
            max_tokens: ctx.maxTokens,
            temperature: ctx.temperature,
            stop_sequences: ['```', '\n\n\n']
        };
    }

    parseResponse(data: any, ctx?: CompletionContext): string | null {
        return sanitize(data.content?.[0]?.text || '', ctx);
    }
}
