// ============================================================================
// LLM TIER — context-aware classification via Firebase AI Logic (Gemini).
// The classifier (index.js) calls this only for notes the offline rules can't
// confidently place. Same contract as the rules tier so it's a drop-in:
//
//   classifyByLLM({ text, url }) =>
//     Promise<{ category, confidence, reason } | null>
//
// Returns null (so the app keeps the rules result) when offline, when AI isn't
// available (local mode), or on any error — capture must never break.
// ============================================================================
import { classifyWithAI, isAiAvailable } from '../ai.js'

export async function classifyByLLM({ text = '', url = null } = {}) {
  if (!isAiAvailable) return null
  // Don't attempt a network call with no connection.
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return null
  try {
    return await classifyWithAI({ text, url })
  } catch (err) {
    // eslint-disable-next-line no-console
    console.warn('[llmTier] AI classification failed, falling back to rules:', err)
    return null
  }
}
