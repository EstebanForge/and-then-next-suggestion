import { BaseDialect, sanitize } from './base';
import { CompletionContext, ProviderProfile } from './types';

const BEFORE_MARKER = '<<BEFORE>>';
const AFTER_MARKER = '<<AFTER>>';
const END_BEFORE = '<</BEFORE>>';
const END_AFTER = '<</AFTER>>';

// Common FIM (Fill-in-the-Middle) template formats for local models
const FIM_TEMPLATES: Record<string, { prefix: string; suffix: string; middle: string }> = {
    codellama:   { prefix: '<PRE>',  suffix: '<SUF>',  middle: '<MID>' },
    deepseek:    { prefix: '<fim_prefix>', suffix: '<fim_suffix>', middle: '<fim_middle>' },
    qwen:        { prefix: '<|fim_prefix|>', suffix: '<|fim_suffix|>', middle: '<|fim_middle|>' },
    starcoder:   { prefix: '<fim_prefix>', suffix: '<fim_suffix>', middle: '<fim_middle>' },
    llama:       { prefix: '<PRE>',  suffix: '<SUF>',  middle: '<MID>' },
};

function detectFimFormat(model: string): { prefix: string; suffix: string; middle: string } | null {
    const lower = model.toLowerCase();
    for (const [key, tmpl] of Object.entries(FIM_TEMPLATES)) {
        if (lower.includes(key)) { return tmpl; }
    }
    return null;
}

export class OllamaDialect extends BaseDialect {
    readonly type = 'ollama';

    protected prepareBody(ctx: CompletionContext, profile: ProviderProfile): any {
        const model = profile.model || '';
        const fim = detectFimFormat(model);

        if (fim) {
            // Use native FIM prompt format for models that support it
            return {
                model: model,
                prompt: `${fim.prefix}${ctx.textBefore}${fim.middle}`,
                suffix: ctx.textAfter,
                stream: false,
                options: { num_predict: ctx.maxTokens, temperature: ctx.temperature }
            };
        }

        // Fallback to chat-style completion with markers
        return {
            model: model,
            prompt: `${BEFORE_MARKER}${ctx.textBefore}${END_BEFORE}\n${AFTER_MARKER}${ctx.textAfter}${END_AFTER}`,
            stream: false,
            options: { num_predict: ctx.maxTokens, temperature: ctx.temperature, stop: ['```'] },
            system: `You are a code completion engine for ${ctx.languageId}${ctx.fileExtension ? ` (${ctx.fileExtension})` : ''}. The cursor is between the code before it and the code after it. Output ONLY the code to insert at the cursor. No repetition of surrounding code. No explanations. No markdown. No backticks. Raw code only.`
        };
    }

    parseResponse(data: any, ctx?: CompletionContext): string | null {
        return sanitize(data.response || '', ctx);
    }
}
