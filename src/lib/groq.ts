import 'server-only';
import { createGroqRanker } from './groq-client';
import { observeProviderHeaders, reserveProviderBudget } from './rate-limit';

export const groqRank = createGroqRanker({
  apiKey: () => process.env.GROQ_API_KEY,
  model: () => process.env.GROQ_MODEL,
  reserve: tokens => reserveProviderBudget('groq', { requests: 1, tokens }),
  observe: (headers, status) => observeProviderHeaders('groq', headers, status),
});
