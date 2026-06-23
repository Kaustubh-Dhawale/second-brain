// ============================================================================
// AUTO-FILING CLASSIFIER  —  ONE swappable module behind a clear interface.
// ----------------------------------------------------------------------------
// PUBLIC INTERFACE (the rest of the app only depends on this):
//
//   classify({ text, url }) => Promise<{ category, confidence, tier, reason }>
//
//     text        raw captured text (string, may be empty)
//     url         optional URL (string | null)
//     returns     category  : one of CATEGORIES
//                 confidence: 0..1
//                 tier      : which tier produced the result ('rules' | 'llm')
//                 reason    : short human-readable explanation (for debugging)
//
// The classifier runs tiers in order and returns the first confident answer.
// Today only the offline RULES tier is active. A future LLM tier is stubbed
// below — swap it in by setting USE_LLM_TIER = true and implementing the stub.
// No external AI API or keys are wired in.
// ============================================================================

import { classifyByRules } from './rulesTier.js'
import { classifyByLLM } from './llmTier.js'

// LLM tier (Firebase AI Logic + Gemini) is active. It only runs for notes the
// offline rules can't confidently place, and safely no-ops offline / in local
// mode (see llmTier.js), so capture always works.
const USE_LLM_TIER = true

// Below this confidence the rules tier is considered "uncertain".
const CONFIDENCE_THRESHOLD = 0.5

/**
 * Classify a capture into a category.
 * @param {{ text?: string, url?: string|null }} input
 * @returns {Promise<{category: string, confidence: number, tier: string, reason: string}>}
 */
export async function classify({ text = '', url = null } = {}) {
  // Tier 1: offline rules. Always runs, always available (no network).
  const rules = classifyByRules({ text, url })

  if (rules.confidence >= CONFIDENCE_THRESHOLD) {
    return { ...rules, tier: 'rules' }
  }

  // Tier 2: optional LLM tier for the uncertain cases. Disabled by default.
  if (USE_LLM_TIER) {
    try {
      const llm = await classifyByLLM({ text, url })
      if (llm && llm.confidence >= CONFIDENCE_THRESHOLD) {
        return { ...llm, tier: 'llm' }
      }
    } catch (err) {
      // Never let the LLM tier break capture — fall through to the rules result.
      // eslint-disable-next-line no-console
      console.warn('[classifier] LLM tier failed, using rules result:', err)
    }
  }

  // Nothing confident → file to Inbox (the rules tier already returns Inbox here).
  return { ...rules, tier: 'rules' }
}
