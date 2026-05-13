import { BaseDialect, sanitize } from './base';
import { CompletionContext, ProviderProfile } from './types';

export class CustomDialect extends BaseDialect {
    readonly type = 'custom';

    private static injectVars(template: string, vars: Map<string, () => string>): string {
        // Replace all {{key}} tokens with properly-serialized values
        return template.replace(/\{\{(\w+)\}\}/g, (match, key: string) => {
            const factory = vars.get(key);
            if (!factory) { return match; }
            return factory();
        });
    }

    protected prepareBody(ctx: CompletionContext, profile: ProviderProfile): any {
        const customBody = profile.customBody;
        if (customBody && customBody !== '{}') {
            try {
                // String values are JSON-serialized (includes quotes + escaping).
                // Numeric values are injected raw so they stay valid JSON numbers.
                const vars = new Map<string, () => string>([
                    ['before', () => JSON.stringify(ctx.textBefore)],
                    ['after', () => JSON.stringify(ctx.textAfter)],
                    ['model', () => JSON.stringify(profile.model || '')],
                    ['maxTokens', () => String(ctx.maxTokens)],
                    ['temperature', () => String(ctx.temperature)],
                    ['languageId', () => JSON.stringify(ctx.languageId)],
                    ['fileExtension', () => JSON.stringify(ctx.fileExtension)],
                ]);

                const bodyStr = CustomDialect.injectVars(customBody, vars);
                return JSON.parse(bodyStr);
            } catch (_e) {
                const msg = _e instanceof Error ? _e.message : String(_e);
                throw new Error(`Invalid Custom JSON Body: ${msg}`);
            }
        }
        return { model: profile.model, messages: [{ role: 'user', content: ctx.textBefore }], max_tokens: ctx.maxTokens };
    }

    parseResponse(data: any, ctx?: CompletionContext): string | null {
        const choice = data.choices?.[0];
        const raw = choice?.message?.content || choice?.text || '';
        return sanitize(raw, ctx);
    }
}
