import { z } from 'zod';

// Zod schemas for AI search response validation

export const FollowUpSchema = z.object({
  question: z.string().min(1, 'Follow-up question cannot be empty'),
  field: z.enum([
    'dates',
    'price',
    'category',
    'bookingType',
    'location',
    'other',
  ]),
  options: z.array(z.string()).optional(),
});

export const SearchFiltersSchema = z.object({
  q: z.string().optional(),
  categorySlug: z.string().optional(),
  minPrice: z.number().min(0).optional(),
  maxPrice: z.number().min(0).optional(),
  bookingType: z.enum(['DAILY', 'SLOT', 'ANY']).optional(),
  availableFrom: z.string().optional(), // YYYY-MM-DD format
  availableTo: z.string().optional(),
  sortBy: z.enum(['distance', 'date', 'price_asc', 'price_desc']).optional(),
  radiusKm: z.number().min(0).max(50).optional(),
});

export const SearchChipSchema = z.object({
  key: z.string(),
  label: z.string(),
});

export const AiResponseFollowUpSchema = z.object({
  mode: z.literal('FOLLOW_UP'),
  followUp: FollowUpSchema,
  filters: SearchFiltersSchema.optional(),
  chips: z.array(SearchChipSchema).optional(),
});

export const AiResponseResultSchema = z.object({
  mode: z.literal('RESULT'),
  filters: SearchFiltersSchema,
  chips: z.array(SearchChipSchema).optional(),
});

export const AiResponseSchema = z.union([
  AiResponseFollowUpSchema,
  AiResponseResultSchema,
]);

export type AiResponse = z.infer<typeof AiResponseSchema>;
export type FollowUp = z.infer<typeof FollowUpSchema>;
export type SearchFilters = z.infer<typeof SearchFiltersSchema>;
export type SearchChip = z.infer<typeof SearchChipSchema>;

// ── Price Suggestion Response ──────────────────────────────────────────────────

const PriceSuggestionResponseSchema = z.object({
  recommended: z.number().positive(),
  rangeMin:    z.number().positive(),
  rangeMax:    z.number().positive(),
  confidence:  z.enum(['high', 'medium', 'low']),
  explanation: z.array(z.string()).min(1),
});

export type PriceSuggestionResponse = z.infer<typeof PriceSuggestionResponseSchema>;

/**
 * Strip optional markdown code fences, parse JSON, and Zod-validate the
 * Gemini price suggestion response. Returns null on any failure so the
 * caller can fall back to the math pipeline.
 */
export function parsePriceSuggestionResponse(raw: string): PriceSuggestionResponse | null {
  try {
    // Strip ```json ... ``` or ``` ... ``` fences Gemini sometimes wraps around JSON
    const cleaned = raw
      .trim()
      .replace(/^```(?:json)?\s*/i, '')
      .replace(/\s*```\s*$/, '');

    const parsed = JSON.parse(cleaned);
    const result = PriceSuggestionResponseSchema.safeParse(parsed);
    if (!result.success) return null;
    return result.data;
  } catch {
    return null;
  }
}
