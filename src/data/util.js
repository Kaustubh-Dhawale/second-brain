// Shared data helpers used by both storage backends.

// Pull the first URL out of free text, if any (so a pasted link auto-files).
const URL_RE = /\bhttps?:\/\/[^\s]+/i

export function extractUrl(text = '') {
  const m = (text || '').match(URL_RE)
  return m ? m[0] : null
}

// Default structured fields for a Projects item (mirrors old Notion idea pages).
export function emptyProject() {
  return { difficulty: '', problemSolved: '', targetDate: '' }
}
