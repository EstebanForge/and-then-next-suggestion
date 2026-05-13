import { BaseDialect, sanitize } from './base';
import { CompletionContext, ProviderProfile } from './types';

export class OpenAIDialect extends BaseDialect {
    readonly type = 'openai';

    protected prepareBody(ctx: CompletionContext, profile: ProviderProfile): any {
        const model = profile.model || '';
        const disableThinking = profile.disableThinking !== false;
        const supportsThinking = profile.supportsThinking !== undefined
            ? profile.supportsThinking
            : /^o[1-9]|deepseek-reasoner|deepseek-r1/i.test(model);

        const body: any = {
            model: model,
            messages: [
                {
                    role: 'system',
                    content: `You are a code completion engine for ${ctx.languageId}${ctx.fileExtension ? ` (${ctx.fileExtension})` : ''}. Output ONLY the code to insert at the cursor. No repetition of surrounding code. No explanations. No markdown. No backticks. Raw code only.`
                },
                {
                    role: 'user',
                    content: `BEFORE CURSOR:\n${ctx.textBefore}\nAFTER CURSOR:\n${ctx.textAfter}\nOUTPUT:`
                }
            ],
            max_tokens: ctx.maxTokens,
            temperature: ctx.temperature,
            stop: ['```', '<|end|>', '\n\n\n']
        };

        if (supportsThinking) {
            if (disableThinking) {
                body.thinking = { type: 'disabled' };
            } else {
                body.reasoning_effort = 'high';
                body.thinking = { type: 'enabled' };
                delete body.temperature;
            }
        }

        return body;
    }

    parseResponse(data: any, ctx?: CompletionContext): string | null {
        const choice = data.choices?.[0];
        if (choice?.message) {
            if (!choice.message.content && choice.message.reasoning_content) { return null; }
            return sanitize(choice.message.content || '', ctx);
        } else if (choice?.text) {
            return sanitize(choice.text || '', ctx);
        }
        return null;
    }
}
