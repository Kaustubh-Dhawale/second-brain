// The built-in categories. The AI may suggest NEW ones (e.g. Quotes, Recipes)
// which, once approved, become first-class categories derived from the items.
export const DEFAULT_CATEGORIES = [
  'Inbox',
  'Work',
  'Personal',
  'Fitness',
  'Projects',
  'Reference',
  'Errands',
]

// Back-compat alias (rules tier + AI classifier reference the built-in set).
export const CATEGORIES = DEFAULT_CATEGORIES

// Fixed accent colors for the built-ins (match index.css --c-* vars).
const DEFAULT_COLORS = {
  Inbox: '#8a857c',
  Work: '#4f7aa8',
  Personal: '#b5638a',
  Fitness: '#6e8c3a',
  Projects: '#7e6ac0',
  Reference: '#c08a3e',
  Errands: '#3f9e86',
}

// Palette for AI-created categories, chosen deterministically from the name so
// a given custom category always gets the same color.
const CUSTOM_PALETTE = [
  '#C8714E', '#4F7AA8', '#7E6AC0', '#3F9E86',
  '#B5638A', '#6E8C3A', '#C08A3E', '#5B8D9C', '#A0566F',
]

export function colorFor(category) {
  if (DEFAULT_COLORS[category]) return DEFAULT_COLORS[category]
  let hash = 0
  for (let i = 0; i < category.length; i++) {
    hash = (hash * 31 + category.charCodeAt(i)) >>> 0
  }
  return CUSTOM_PALETTE[hash % CUSTOM_PALETTE.length]
}

// Tidy a free-form category name from the AI into a clean label.
export function normalizeCategory(name) {
  if (!name) return ''
  const clean = String(name).trim().replace(/\s+/g, ' ').slice(0, 24)
  return clean
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

// All categories currently in play: built-ins plus any custom ones already used
// by items (newest custom categories appear after the built-ins).
export function activeCategories(items = []) {
  const set = [...DEFAULT_CATEGORIES]
  for (const it of items) {
    if (it.category && !set.includes(it.category)) set.push(it.category)
  }
  return set
}

// Map a URL ?view= slug to a category label, and back.
export const slugToCategory = (slug) => {
  if (!slug) return null
  const found = DEFAULT_CATEGORIES.find(
    (c) => c.toLowerCase() === slug.toLowerCase()
  )
  return found || null
}

export const categoryToSlug = (category) => category.toLowerCase()

// Smart views shown above the collections in the sidebar. "Inbox" doubles as a
// category filter; "Today"/"Scheduled" are schedule-driven (handled in App).
export const SMART_VIEWS = ['Today', 'Scheduled', 'Inbox']

export const slugToView = (slug) => {
  if (!slug) return null
  const map = { today: 'Today', scheduled: 'Scheduled', inbox: 'Inbox' }
  return map[String(slug).toLowerCase()] || null
}
