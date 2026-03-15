import { GoogleGenerativeAI } from '@google/generative-ai';

export interface AIClient {
  generate(systemPrompt: string, userMessage: string): Promise<string>;
}

interface KeyEntry {
  key: string;
  isPaid: boolean;
  rateLimitedUntil: number;
}

const COOLDOWN_MS = 60_000;

function loadApiKeys(): KeyEntry[] {
  const entries: KeyEntry[] = [];

  for (let i = 1; ; i++) {
    const key = process.env[`GEMINI_API_KEY_${i}`];
    if (!key) break;
    entries.push({ key, isPaid: false, rateLimitedUntil: 0 });
  }

  const paidKey = process.env.GEMINI_API_KEY_PAID;
  if (paidKey) {
    entries.push({ key: paidKey, isPaid: true, rateLimitedUntil: 0 });
  }

  if (entries.length === 0) {
    const single = process.env.GEMINI_API_KEY;
    if (single) {
      entries.push({ key: single, isPaid: false, rateLimitedUntil: 0 });
    }
  }

  if (entries.length === 0) {
    throw new Error(
      'No API keys found. Set GEMINI_API_KEY_1, GEMINI_API_KEY_2, ... or GEMINI_API_KEY'
    );
  }

  return entries;
}

function isRateLimitError(error: unknown): boolean {
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();
    if (
      msg.includes('429') ||
      msg.includes('resource_exhausted') ||
      msg.includes('rate limit') ||
      msg.includes('quota')
    ) {
      return true;
    }
  }
  if (typeof error === 'object' && error !== null && 'status' in error) {
    return (error as { status: number }).status === 429;
  }
  return false;
}

class GeminiClient implements AIClient {
  private keys: KeyEntry[];

  constructor() {
    this.keys = loadApiKeys();
    const freeCount = this.keys.filter((k) => !k.isPaid).length;
    const paidCount = this.keys.filter((k) => k.isPaid).length;
    console.log(`[aip] Loaded ${freeCount} free key(s), ${paidCount} paid key(s)`);
  }

  async generate(systemPrompt: string, userMessage: string): Promise<string> {
    const now = Date.now();
    const available = this.keys.filter((k) => now >= k.rateLimitedUntil);

    if (available.length === 0) {
      const nextAvailable = Math.min(...this.keys.map((k) => k.rateLimitedUntil));
      const waitSec = Math.ceil((nextAvailable - now) / 1000);
      throw new Error(`All API keys are rate-limited. Try again in ${waitSec}s.`);
    }

    for (const entry of available) {
      try {
        if (entry.isPaid) {
          console.warn('[aip] Falling back to paid API key');
        }

        const client = new GoogleGenerativeAI(entry.key);
        const model = client.getGenerativeModel({
          model: 'gemini-2.0-flash',
          systemInstruction: systemPrompt,
        });

        const result = await model.generateContent(userMessage);
        return result.response.text();
      } catch (error) {
        if (isRateLimitError(error)) {
          entry.rateLimitedUntil = now + COOLDOWN_MS;
          const keyIndex = this.keys.indexOf(entry);
          console.warn(`[aip] Key ${keyIndex + 1} rate-limited, trying next...`);
          continue;
        }
        throw error;
      }
    }

    throw new Error('All API keys are rate-limited. Try again later.');
  }
}

let instance: AIClient | null = null;

export function getAIClient(): AIClient {
  if (!instance) {
    instance = new GeminiClient();
  }
  return instance;
}
