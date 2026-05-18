import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';

export interface ClassifyImagesResult {
  categorySlug: 'stays' | 'mobility' | 'sports-facilities' | 'beach-gear';
  label: string;
  icon: string;
  confidence: number;
  source: 'vision' | 'fallback';
}

const CATEGORY_META: Record<string, { label: string; icon: string }> = {
  stays:               { label: 'Séjour / Villa',      icon: 'fa-house'  },
  mobility:            { label: 'Voiture / Mobilité',  icon: 'fa-car'    },
  'sports-facilities': { label: 'Terrain de sport',    icon: 'fa-futbol' },
  'beach-gear':        { label: 'Équipement de plage', icon: 'fa-water'  },
};

const VALID_SLUGS = Object.keys(CATEGORY_META) as ClassifyImagesResult['categorySlug'][];

@Injectable()
export class ImageClassifierService {
  private readonly logger = new Logger(ImageClassifierService.name);
  private visionClient: OpenAI | null = null;
  private visionModel = 'gemini-2.5-flash';

  constructor(private readonly configService: ConfigService) {
    // Build a dedicated vision client. All three providers accept base64
    // image_url payloads via the OpenAI-compatible Chat Completions API.
    // Priority: Gemini → Groq → OpenAI.
    const geminiKey = this.configService.get<string>('GEMINI_API_KEY');
    if (geminiKey?.trim()) {
      this.visionClient = new OpenAI({
        apiKey: geminiKey,
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
      });
      this.visionModel =
        this.configService.get<string>('GEMINI_MODEL', 'gemini-2.5-flash') ??
        'gemini-2.5-flash';
      this.logger.log(`Vision using Gemini (${this.visionModel})`);
      return;
    }

    // Groq vision — the chat model (llama-3.3-70b) has no vision support, so
    // require a separately-configured vision-capable model.
    const groqKey = this.configService.get<string>('GROQ_API_KEY');
    if (groqKey?.trim()) {
      this.visionClient = new OpenAI({
        apiKey: groqKey,
        baseURL: 'https://api.groq.com/openai/v1',
      });
      this.visionModel = this.configService.get<string>(
        'GROQ_VISION_MODEL',
        'meta-llama/llama-4-scout-17b-16e-instruct',
      ) ?? 'meta-llama/llama-4-scout-17b-16e-instruct';
      this.logger.log(`Vision using Groq (${this.visionModel})`);
      return;
    }

    // Plain OpenAI — only if the base URL is not pointed at a different provider
    // (e.g. when OPENAI_API_KEY is actually a Groq key behind a custom baseURL).
    const openaiKey = this.configService.get<string>('OPENAI_API_KEY');
    const openaiBaseUrl = this.configService.get<string>('OPENAI_BASE_URL');
    const baseLooksLikeOpenAI =
      !openaiBaseUrl || openaiBaseUrl.includes('api.openai.com');
    if (openaiKey?.trim() && baseLooksLikeOpenAI) {
      this.visionClient = new OpenAI({ apiKey: openaiKey });
      this.visionModel = 'gpt-4o-mini';
      this.logger.log('Vision using OpenAI (gpt-4o-mini)');
      return;
    }

    this.logger.warn(
      'No vision-capable key found (set GEMINI_API_KEY, GROQ_API_KEY + ' +
      'GROQ_VISION_MODEL, or a real OPENAI_API_KEY). ' +
      'Image classification will be skipped.',
    );
  }

  async classify(files: Express.Multer.File[]): Promise<ClassifyImagesResult> {
    this.logger.log(
      `classify: files=${files?.length ?? 0}, visionReady=${!!this.visionClient}`,
    );

    if (files?.length && this.visionClient) {
      try {
        return await this.classifyWithVision(files);
      } catch (err: any) {
        this.logger.error(
          `Vision classification failed: ${err?.message ?? err}`,
          err?.stack,
        );
      }
    }

    return this.noResult();
  }

  private async classifyWithVision(
    files: Express.Multer.File[],
  ): Promise<ClassifyImagesResult> {
    const imageContent = files
      .filter((f) => Buffer.isBuffer(f.buffer) && f.buffer.length > 0)
      .slice(0, 3)
      .map((f) => ({
        type: 'image_url' as const,
        image_url: {
          url: `data:${f.mimetype};base64,${f.buffer.toString('base64')}`,
        },
      }));

    if (!imageContent.length) {
      this.logger.warn('No valid buffers in uploaded files — falling back');
      return this.noResult();
    }

    this.logger.log(`Sending ${imageContent.length} image(s) to ${this.visionModel}`);

    const response = await this.visionClient!.chat.completions.create({
      model: this.visionModel,
      messages: [
        {
          role: 'user',
          content: [
            ...imageContent,
            {
              type: 'text',
              text:
                'You are classifying a rental listing photo for a marketplace.\n\n' +
                'Categories:\n' +
                '- "stays": house, villa, apartment, studio, chalet, room — any accommodation\n' +
                '- "mobility": car, scooter, motorbike, bicycle, van, boat — any vehicle\n' +
                '- "sports-facilities": padel, tennis, football pitch, basketball court — any sports venue\n' +
                '- "beach-gear": kayak, paddleboard, jet-ski, surfboard, snorkel — any beach/water equipment\n\n' +
                'Reply with ONLY a JSON object, nothing else:\n' +
                '{"categorySlug":"stays","confidence":0.95}',
            },
          ],
        },
      ],
      // Gemini 2.5-flash spends some of its budget on internal reasoning before
      // emitting the JSON, so keep this generous to avoid mid-value truncation.
      max_tokens: 256,
      temperature: 0,
      // No response_format — Gemini rejects json_object alongside image_url content
    } as any);

    const raw = response.choices[0]?.message?.content?.trim() ?? '';
    this.logger.log(`Vision raw response: ${raw.substring(0, 200)}`);

    const parsed = this.extractClassification(raw);
    if (!parsed) {
      this.logger.warn(`Could not parse vision response — falling back. Raw: ${raw}`);
      return this.noResult();
    }

    const slug: ClassifyImagesResult['categorySlug'] = VALID_SLUGS.includes(
      parsed.categorySlug as any,
    )
      ? (parsed.categorySlug as ClassifyImagesResult['categorySlug'])
      : 'stays';

    const confidence =
      typeof parsed.confidence === 'number'
        ? Math.min(1, Math.max(0, parsed.confidence))
        : 0.7;

    this.logger.log(`Classified as: ${slug} (confidence=${confidence})`);

    return {
      categorySlug: slug,
      ...CATEGORY_META[slug],
      confidence,
      source: 'vision',
    };
  }

  /**
   * Extract {categorySlug, confidence} from the model output. Tries strict
   * JSON.parse first (after stripping ``` fences), then falls back to regex
   * so a truncated or oddly-formatted response still gets us a category.
   */
  private extractClassification(
    raw: string,
  ): { categorySlug: string; confidence: number } | null {
    if (!raw) return null;

    const stripped = raw.replace(/```json?/gi, '').replace(/```/g, '').trim();

    // Try strict parse on the cleaned string
    try {
      const obj = JSON.parse(stripped);
      if (typeof obj?.categorySlug === 'string') {
        return {
          categorySlug: obj.categorySlug,
          confidence:
            typeof obj.confidence === 'number' ? obj.confidence : 0.7,
        };
      }
    } catch {
      /* fall through to regex */
    }

    // Try to parse just the first {...} block in case of trailing junk
    const firstBlock = stripped.match(/\{[\s\S]*?\}/);
    if (firstBlock) {
      try {
        const obj = JSON.parse(firstBlock[0]);
        if (typeof obj?.categorySlug === 'string') {
          return {
            categorySlug: obj.categorySlug,
            confidence:
              typeof obj.confidence === 'number' ? obj.confidence : 0.7,
          };
        }
      } catch {
        /* fall through */
      }
    }

    // Regex fallback for truncated responses (e.g. `{"categorySlug":"stays","confidence":0.9`)
    const slugMatch = stripped.match(/"categorySlug"\s*:\s*"([a-z-]+)"/i);
    const confMatch = stripped.match(/"confidence"\s*:\s*([0-9.]+)/);
    if (slugMatch) {
      return {
        categorySlug: slugMatch[1],
        confidence: confMatch ? parseFloat(confMatch[1]) : 0.7,
      };
    }

    return null;
  }

  private noResult(): ClassifyImagesResult {
    return {
      categorySlug: 'stays',
      label: 'Séjour / Villa',
      icon: 'fa-house',
      confidence: 0,
      source: 'fallback',
    };
  }
}
