import { Dialect } from './types';
import { OpenAIDialect } from './openai';
import { AnthropicDialect } from './anthropic';
import { OllamaDialect } from './ollama';
import { CustomDialect } from './custom';

export class DialectRegistry {
    private static dialects: Map<string, Dialect> = new Map();

    static {
        this.register(new OpenAIDialect());
        this.register(new AnthropicDialect());
        this.register(new OllamaDialect());
        this.register(new CustomDialect());
    }

    static register(dialect: Dialect) {
        this.dialects.set(dialect.type, dialect);
    }

    static get(type: string): Dialect {
        const dialect = this.dialects.get(type);
        if (!dialect) {
            // Default to OpenAI if unknown
            return this.dialects.get('openai')!;
        }
        return dialect;
    }
}
