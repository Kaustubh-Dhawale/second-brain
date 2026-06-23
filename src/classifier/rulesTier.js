// Offline rules tier. Pure function, no network, deterministic.
// Classifies by URL pattern first, then by keywords in the text.

const includesAny = (haystack, needles) =>
  needles.some((n) => haystack.includes(n))

/**
 * @param {{ text?: string, url?: string|null }} input
 * @returns {{category: string, confidence: number, reason: string}}
 */
export function classifyByRules({ text = '', url = null }) {
  const t = (text || '').toLowerCase()
  const u = (url || '').toLowerCase()
  const combined = `${t} ${u}`.trim()

  // --- URL-pattern rules → Reference -------------------------------------
  if (u) {
    const isVideo =
      includesAny(u, ['youtube.com', 'youtu.be', 'vimeo.com']) ||
      /\b(video|watch)\b/.test(u)
    const isDoc =
      /\.pdf(\?|#|$)/.test(u) ||
      includesAny(u, [
        '.doc',
        '.docx',
        'docs.google.com',
        'arxiv.org',
        '/paper',
      ])
    if (isVideo) {
      return { category: 'Reference', confidence: 0.9, reason: 'URL looks like a video' }
    }
    if (isDoc) {
      return { category: 'Reference', confidence: 0.9, reason: 'URL looks like a document/PDF' }
    }
    // A LinkedIn profile is usually someone to reach out to → an errand.
    if (/linkedin\.com\/in\//.test(u)) {
      return { category: 'Errands', confidence: 0.8, reason: 'LinkedIn profile to reach out to' }
    }
    // Any other saved link is reference material by default.
    return { category: 'Reference', confidence: 0.7, reason: "It's a saved link" }
  }

  // Text mentions a video/pdf even without a URL.
  if (includesAny(combined, ['youtube', 'video', '.pdf'])) {
    return { category: 'Reference', confidence: 0.65, reason: 'Mentions video/pdf' }
  }

  // --- Keyword rules → Errands -------------------------------------------
  // Actions you need to do: call/buy/pick up/email/remind.
  const errandWords = [
    'call ',
    'buy ',
    'pick up',
    'pickup',
    'email ',
    'remind',
    'schedule ',
    'book ',
    'pay ',
    'return ',
  ]
  if (includesAny(combined, errandWords) || /^(call|buy|email|book|pay)\b/.test(t)) {
    return { category: 'Errands', confidence: 0.8, reason: 'Action keyword (errand)' }
  }

  // --- Keyword rules → Projects ------------------------------------------
  if (includesAny(combined, ['idea', 'concept', 'project idea', 'what if'])) {
    return { category: 'Projects', confidence: 0.75, reason: 'Mentions idea/concept' }
  }

  // --- Uncertain → Inbox -------------------------------------------------
  return { category: 'Inbox', confidence: 0.3, reason: 'No rule matched; defaulting to Inbox' }
}
