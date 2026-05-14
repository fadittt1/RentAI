import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface CompletionOptions {
  maxTokens?: number;
  temperature?: number;
  systemPrompt?: string;
  /** Force the model to emit valid JSON (uses response_format json_object) */
  jsonMode?: boolean;
  /** Max retries on transient failure (default 2) */
  maxRetries?: number;
  /** Request timeout in ms (default 15000) */
  timeoutMs?: number;
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
  scores: Record<string, number>;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private client: OpenAI | null = null;
  private model: string = 'gpt-4o-mini';
  private readonly isEnabled: boolean;

  constructor(private configService: ConfigService) {
    const provider = this.configService.get<string>('AI_PROVIDER', 'openai').toLowerCase();

    if (provider === 'groq') {
      const apiKey = this.configService.get<string>('GROQ_API_KEY');
      if (apiKey?.trim()) {
        this.client = new OpenAI({ apiKey, baseURL: 'https://api.groq.com/openai/v1' });
        this.model = this.configService.get<string>('GROQ_MODEL', 'llama-3.3-70b-versatile');
        this.isEnabled = true;
        this.logger.log(`AiService using Groq (model: ${this.model})`);
      } else {
        this.logger.warn('AI_PROVIDER=groq but GROQ_API_KEY is not set. AI features disabled.');
        this.isEnabled = false;
      }
    } else if (provider === 'gemini') {
      const apiKey = this.configService.get<string>('GEMINI_API_KEY');
      if (apiKey?.trim()) {
        const geminiModel = this.configService.get<string>('GEMINI_MODEL', 'gemini-2.5-flash');
        this.client = new OpenAI({
          apiKey,
          baseURL: `https://generativelanguage.googleapis.com/v1beta/openai/`,
        });
        this.model = geminiModel;
        this.isEnabled = true;
        this.logger.log(`AiService using Gemini (model: ${this.model})`);
      } else {
        this.logger.warn('AI_PROVIDER=gemini but GEMINI_API_KEY is not set. AI features disabled.');
        this.isEnabled = false;
      }
    } else {
      // Default: OpenAI
      const apiKey = this.configService.get<string>('OPENAI_API_KEY');
      if (apiKey?.trim()) {
        this.client = new OpenAI({ apiKey });
        this.model = this.configService.get<string>('AI_MODEL', 'gpt-4o-mini');
        this.isEnabled = true;
        this.logger.log(`AiService using OpenAI (model: ${this.model})`);
      } else {
        this.logger.warn('OPENAI_API_KEY not configured. AI features disabled.');
        this.isEnabled = false;
      }
    }
  }

  isAiEnabled(): boolean {
    return this.isEnabled;
  }

  async generateCompletion(
    prompt: string,
    options: CompletionOptions = {},
  ): Promise<string> {
    if (!this.isEnabled || !this.client) {
      throw new Error('AI features are not enabled. Please configure an AI provider key.');
    }

    const {
      maxTokens = 500,
      temperature = 0.7,
      systemPrompt = 'You are a helpful assistant for a rental platform.',
      jsonMode = false,
      maxRetries = 2,
      timeoutMs = 15_000,
    } = options;

    let lastError: unknown;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      if (attempt > 0) {
        const delay = Math.min(1000 * 2 ** (attempt - 1), 4000); // 1s, 2s, 4s
        this.logger.warn(`AI retry ${attempt}/${maxRetries} after ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }

      try {
        const abortController = new AbortController();
        const timer = setTimeout(() => abortController.abort(), timeoutMs);

        const requestParams: any = {
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: prompt },
          ],
          max_tokens: maxTokens,
          temperature,
        };

        // Enable JSON mode — forces valid JSON output (supported by Groq, OpenAI, Gemini)
        if (jsonMode) {
          requestParams.response_format = { type: 'json_object' };
        }

        const response = await this.client.chat.completions.create(requestParams, {
          signal: abortController.signal,
        });

        clearTimeout(timer);

        const content = response.choices[0]?.message?.content;
        if (!content) throw new Error('Empty response from AI provider');
        return content.trim();
      } catch (error: any) {
        lastError = error;
        const msg = String(error?.message ?? error).toLowerCase();
        // Don't retry on abort/timeout, auth errors, or rate limits
        if (
          error?.name === 'AbortError' ||
          msg.includes('abort') ||
          msg.includes('timed out') ||
          msg.includes('timeout') ||
          error?.status === 401 || error?.status === 403 || error?.status === 429
        ) {
          break;
        }
        this.logger.warn(`AI attempt ${attempt + 1} failed: ${String(error?.message ?? error)}`);
      }
    }

    this.logger.error('All AI attempts failed', lastError);
    throw new Error('Failed to generate AI completion after retries');
  }

  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.isEnabled || !this.client) throw new Error('AI features are not enabled');
    try {
      const response = await this.client.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
      });
      return response.data[0].embedding;
    } catch (error) {
      this.logger.error('Error generating embedding:', error);
      throw new Error('Failed to generate embedding');
    }
  }

  async moderateContent(text: string): Promise<ModerationResult> {
    if (!this.isEnabled || !this.client) {
      return { flagged: false, categories: [], scores: {} };
    }
    try {
      const response = await this.client.moderations.create({ input: text });
      const result = response.results[0];
      const flaggedCategories = Object.entries(result.categories)
        .filter(([_key, flagged]) => flagged)
        .map(([category]) => category);
      return {
        flagged: result.flagged,
        categories: flaggedCategories,
        scores: result.category_scores as unknown as Record<string, number>,
      };
    } catch (error) {
      this.logger.error('Error moderating content:', error);
      return { flagged: false, categories: [], scores: {} };
    }
  }

  estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }
}
