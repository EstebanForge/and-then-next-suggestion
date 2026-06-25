import { Dialect, CompletionContext, ProviderProfile } from './types';

const CONVERSATIONAL_PREFIXES = ['here', 'sure', 'i can', 'this is', 'here is', 'below', 'following'];
// Minimum overlap length required when the match would otherwise split a word
// token. Short coincidental seams (e.g. textBefore ending in "re" vs content
// "return x") must not be treated as the model echoing context back.
const MIN_WORD_OVERLAP = 4;
const WORD_CHAR = /[A-Za-z0-9_]/;
const isWord = (ch: string | undefined): boolean => !!ch && WORD_CHAR.test(ch);
const THINKING_RE = /<thinking>[\s\S]*?<\/thinking>/gi;
const THINK_RE = /<think\b[\s\S]*?<\/think\b\s*>?/gi;
// Cap the overlap scan: models never verbatim-repeat more than a few hundred
// chars of surrounding code, so scanning the full 2000-char window is wasted
// work (this loop is O(maxLen * overlap), invoked on every response).
const MAX_OVERLAP = 300;

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

    // Strip overlapping prefix: find longest suffix of textBefore that matches a prefix of content.
    // Guard: a short match landing mid-word in content is almost always a
    // coincidental seam, not an echo (e.g. before ends "re", content "return x").
    // Require either a word boundary at the seam or a >= MIN_WORD_OVERLAP match.
    if (ctx?.textBefore && content.length > 0) {
        const before = ctx.textBefore;
        const maxLen = Math.min(MAX_OVERLAP, before.length, content.length);
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
        const splitsWord = isWord(content[overlap]) && overlap < MIN_WORD_OVERLAP;
        if (overlap > 0 && !splitsWord) { content = content.substring(overlap); }
    }

    // Strip overlapping suffix: find longest prefix of textAfter that matches a suffix of content.
    // Same mid-word guard applied to the content-side seam.
    if (ctx?.textAfter && content.length > 0) {
        const after = ctx.textAfter;
        const maxLen = Math.min(MAX_OVERLAP, after.length, content.length);
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
        const start = content.length - overlap;
        const splitsWord = overlap > 0 && overlap < MIN_WORD_OVERLAP
            && isWord(content[start]) && isWord(content[start - 1]);
        if (overlap > 0 && !splitsWord) { content = content.substring(0, content.length - overlap); }
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
