import { Dialect, CompletionContext, ProviderProfile } from './types';

const CONVERSATIONAL_PREFIXES = ['here', 'sure', 'i can', 'this is', 'here is', 'below', 'following'];
const THINKING_RE = /<thinking>[\s\S]*?<\/thinking>/gi;
const THINK_RE = /<think\b[\s\S]*?<\/think\b\s*>?/gi;

export function stripThinking(content: string): string {
    return content.replace(THINKING_RE, '').replace(THINK_RE, '').trim();
}

export function sanitize(content: string, ctx?: CompletionContext): string | null {
    if (!content) { return null; }
    content = stripThinking(content);
    if (!content) { return null; }
    const lower = content.toLowerCase();
    for (const prefix of CONVERSATIONAL_PREFIXES) {
        if (lower.startsWith(prefix)) { return null; }
    }

    // Strip overlapping prefix: find longest suffix of textBefore that matches a prefix of content
    if (ctx?.textBefore && content.length > 0) {
        const before = ctx.textBefore;
        const maxLen = Math.min(before.length, content.length);
        let overlap = 0;
        for (let len = maxLen; len > 0; len--) {
            let match = true;
            for (let i = 0; i < len; i++) {
                if (before.charCodeAt(before.length - len + i) !== content.charCodeAt(i)) {
                    match = false;
                    break;
                }
            }
            if (match) { overlap = len; break; }
        }
        if (overlap > 0) { content = content.substring(overlap); }
    }

    // Strip overlapping suffix: find longest prefix of textAfter that matches a suffix of content
    if (ctx?.textAfter && content.length > 0) {
        const after = ctx.textAfter;
        const maxLen = Math.min(after.length, content.length);
        let overlap = 0;
        for (let len = maxLen; len > 0; len--) {
            let match = true;
            for (let i = 0; i < len; i++) {
                if (content.charCodeAt(content.length - len + i) !== after.charCodeAt(i)) {
                    match = false;
                    break;
                }
            }
            if (match) { overlap = len; break; }
        }
        if (overlap > 0) { content = content.substring(0, content.length - overlap); }
    }

    return content || null;
}

export abstract class BaseDialect implements Dialect {
    abstract readonly type: string;

    prepareRequest(ctx: CompletionContext, profile: ProviderProfile, apiKey?: string): { url: string; init: RequestInit } {
        const body = this.prepareBody(ctx, profile);
        const headers = this.prepareHeaders(apiKey);

        return {
            url: profile.endpoint,
            init: {
                method: 'POST',
                headers,
                body: JSON.stringify(body)
            }
        };
    }

    protected prepareHeaders(apiKey?: string): Record<string, string> {
        const headers: Record<string, string> = {
            'Content-Type': 'application/json',
        };

        if (apiKey) {
            headers['Authorization'] = `Bearer ${apiKey}`;
        }

        return headers;
    }

    protected abstract prepareBody(ctx: CompletionContext, profile: ProviderProfile): any;
    
    abstract parseResponse(data: any, ctx?: CompletionContext): string | null;
}
