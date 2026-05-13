import * as vscode from 'vscode';

export interface ProviderProfile {
    id: string;
    name: string;
    endpoint: string;
    apiKey?: string;
    provider: string;
    apiType: 'openai' | 'anthropic' | 'ollama' | 'custom';
    model?: string;
    maxTokens?: number;
    temperature?: number;
    disableThinking?: boolean;
    supportsThinking?: boolean;
    customBody?: string;
}

export interface CompletionContext {
    textBefore: string;
    textAfter: string;
    languageId: string;
    fileExtension: string;
    maxTokens: number;
    temperature: number;
}

export interface Dialect {
    readonly type: string;
    prepareRequest(ctx: CompletionContext, profile: ProviderProfile, apiKey?: string): { url: string; init: RequestInit };
    parseResponse(data: any, ctx?: CompletionContext): string | null;
}
