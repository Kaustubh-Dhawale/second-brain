// ============================================================================
// FIREBASE AI LOGIC (Gemini) — context-aware classification.
// Runs through Firebase AI Logic with the Gemini Developer API on the free
// Spark plan. The API key is managed by Firebase (not exposed in this bundle).
// All Gemini access is isolated to this file.
// ============================================================================
import { getAI, getGenerativeModel, GoogleAIBackend, Schema } from 'firebase/ai'
import { app, isFirebaseConfigured } from './firebase.js'
import { CATEGORIES, normalizeCategory } from './categories.js'

// AI is only possible in cloud mode (needs the Firebase app).
export const isAiAvailable = isFirebaseConfigured

const SYSTEM_INSTRUCTION = `You are the auto-filing brain of a personal "second brain" note app. Read each captured note and decide the single best category for it.

Categories and what belongs in each:
- Work: job tasks, meetings, deadlines, work projects, clients, colleagues.
- Personal: personal life, family, friends, home, money, appointments, general personal notes.
- Fitness: workouts, runs, gym, sport, diet, health and exercise goals, personal records.
- Projects: ideas and things to build or make — side projects, product/business/3D-printing ideas, "what if" concepts.
- Reference: things to read, watch, or remember later — links, articles, videos, documents, facts, contacts.
- Errands: concrete actions to run — call, buy, pick up, pay, book, schedule, return, reach out to someone.
- Inbox: ONLY when the note genuinely fits none of the above.

Choose exactly one category. Prefer a specific category over Inbox whenever reasonable. Return the category, a confidence between 0 and 1, and a brief reason (a few words).`

const responseSchema = Schema.object({
  properties: {
    category: Schema.enumString({ enum: CATEGORIES }),
    confidence: Schema.number(),
    reason: Schema.string(),
  },
})

let _model = null
function getModel() {
  if (!isFirebaseConfigured) return null
  if (_model) return _model
  const ai = getAI(app, { backend: new GoogleAIBackend() })
  _model = getGenerativeModel(ai, {
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema,
      temperature: 0,
    },
    systemInstruction: SYSTEM_INSTRUCTION,
  })
  return _model
}

/**
 * Classify a note with Gemini.
 * @returns {Promise<{category, confidence, reason} | null>} null on any failure.
 */
export async function classifyWithAI({ text = '', url = null } = {}) {
  const model = getModel()
  if (!model) return null
  const prompt = `Note: ${text}${url ? `\nLink: ${url}` : ''}`
  const result = await model.generateContent(prompt)
  let parsed
  try {
    parsed = JSON.parse(result.response.text())
  } catch {
    return null
  }
  if (!parsed || !CATEGORIES.includes(parsed.category)) return null
  return {
    category: parsed.category,
    confidence:
      typeof parsed.confidence === 'number' ? parsed.confidence : 0.85,
    reason: parsed.reason || 'AI classification',
  }
}

// ---------------------------------------------------------------------------
// ENRICHMENT — reads a link's page (via the URL-context tool) or long text and
// returns a one-line context, the best existing category, and optionally a
// suggested NEW category. Used in the background after a note is captured.
// ---------------------------------------------------------------------------

const ENRICH_SYSTEM = `You enrich notes in a personal "second brain" app. For each note — and, when a URL is present, the actual contents of that web page — return:
- category: the SINGLE best fit chosen ONLY from the user's existing categories given to you. If nothing fits, use "Inbox".
- context: one short line (max ~16 words) saying what this note or linked page is about, so the user knows it without opening it. Use "" if the note text is already self-explanatory and has no link.
- suggestedCategory: if the note is clearly a distinct KIND that none of the existing categories captures (e.g. a quote -> "Quotes", a recipe -> "Recipes", a person to reach -> "Contacts", a book -> "Books"), propose ONE concise Title Case name. Otherwise "". Never propose something equivalent to an existing category.
Respond with ONLY a JSON object, no markdown, no backticks:
{"category":"...","context":"...","suggestedCategory":"...","confidence":0.0}`

function parseJsonLoose(text) {
  if (!text) return null
  let s = text.trim()
  // Strip ```json fences if present.
  s = s.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  const start = s.indexOf('{')
  const end = s.lastIndexOf('}')
  if (start === -1 || end === -1) return null
  try {
    return JSON.parse(s.slice(start, end + 1))
  } catch {
    return null
  }
}

let _enrichWithTool = null
let _enrichPlain = null
function enrichModel(withUrlTool) {
  if (withUrlTool) {
    if (_enrichWithTool) return _enrichWithTool
    const ai = getAI(app, { backend: new GoogleAIBackend() })
    _enrichWithTool = getGenerativeModel(ai, {
      model: 'gemini-2.5-flash',
      tools: [{ urlContext: {} }],
      generationConfig: { temperature: 0.2 },
      systemInstruction: ENRICH_SYSTEM,
    })
    return _enrichWithTool
  }
  if (_enrichPlain) return _enrichPlain
  const ai = getAI(app, { backend: new GoogleAIBackend() })
  _enrichPlain = getGenerativeModel(ai, {
    model: 'gemini-2.5-flash',
    generationConfig: { temperature: 0.2 },
    systemInstruction: ENRICH_SYSTEM,
  })
  return _enrichPlain
}

/**
 * Enrich a note. `categories` is the user's current category list.
 * @returns {Promise<{category, context, suggestedCategory, confidence} | null>}
 */
export async function enrichNote({ text = '', url = null, categories = CATEGORIES } = {}) {
  if (!isFirebaseConfigured) return null
  const model = enrichModel(Boolean(url))
  const prompt =
    `Existing categories: ${categories.join(', ')}.\n` +
    `Note: ${text || '(no text — see link)'}` +
    (url ? `\nURL: ${url}` : '')

  const result = await model.generateContent(prompt)
  const parsed = parseJsonLoose(result.response.text())
  if (!parsed) return null

  // Validate category against the known list (case-insensitive → canonical).
  let category = null
  if (parsed.category) {
    const hit = categories.find(
      (c) => c.toLowerCase() === String(parsed.category).toLowerCase()
    )
    category = hit || null
  }

  // A suggested NEW category only counts if it isn't an existing one or Inbox.
  let suggestedCategory = normalizeCategory(parsed.suggestedCategory || '')
  if (
    !suggestedCategory ||
    suggestedCategory.toLowerCase() === 'inbox' ||
    categories.some((c) => c.toLowerCase() === suggestedCategory.toLowerCase())
  ) {
    suggestedCategory = ''
  }

  const context = String(parsed.context || '').trim().slice(0, 160)

  return {
    category,
    context,
    suggestedCategory,
    confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.8,
  }
}
