// ============================================================================
// DATA LAYER — all reads/writes go through here. The UI never imports Firestore
// directly. Items live at:  users/{uid}/items/{itemId}
//
// Offline-first: every write goes to the local IndexedDB-backed cache first and
// syncs to the cloud automatically when there's a connection. Timestamps are
// client-side millis (Date.now) so ordering is stable even while offline.
// ============================================================================
import {
  collection,
  doc,
  addDoc,
  setDoc,
  getDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  orderBy,
  arrayUnion,
  arrayRemove,
} from 'firebase/firestore'
import { db } from '../firebase.js'
import { classifyByRules } from '../classifier/rulesTier.js'
import { enrichNote } from '../ai.js'
import { CATEGORIES } from '../categories.js'
import { extractUrl, emptyProject } from './util.js'

// A note is worth an AI enrichment pass if it has a link, is long, or the rules
// couldn't confidently place it.
function shouldEnrich(text, url, category) {
  return Boolean(url) || (text && text.length >= 80) || category === 'Inbox'
}

export { extractUrl }

const itemsCol = (uid) => collection(db, 'users', uid, 'items')

function newFileId() {
  return 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

// Split a prepared file into the lightweight metadata kept on the item doc and
// the heavy bytes stored in the files subcollection.
function splitAttachment(prepared) {
  const fileId = newFileId()
  return {
    meta: {
      fileId,
      name: prepared.name,
      type: prepared.type,
      size: prepared.size,
      thumb: prepared.thumb || null,
    },
    bytes: {
      dataUrl: prepared.dataUrl,
      name: prepared.name,
      type: prepared.type,
      size: prepared.size,
      createdAt: Date.now(),
    },
  }
}

function fileRef(uid, itemId, fileId) {
  return doc(db, 'users', uid, 'items', itemId, 'files', fileId)
}

/**
 * Live subscription to all of a user's items, newest first.
 * @param {string} uid
 * @param {(items: Array) => void} onChange
 * @param {(err: Error) => void} [onError]
 * @returns {() => void} unsubscribe
 */
export function subscribeItems(uid, onChange, onError) {
  const q = query(itemsCol(uid), orderBy('createdAt', 'desc'))
  return onSnapshot(
    q,
    (snap) => {
      const items = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
      onChange(items)
    },
    (err) => {
      // eslint-disable-next-line no-console
      console.error('[items] subscription error:', err)
      if (onError) onError(err)
    }
  )
}

/**
 * Capture a new item. Runs the auto-filing classifier, then writes the doc.
 * @param {string} uid
 * @param {{ text: string, url?: string|null }} input
 * @returns {Promise<string>} new item id
 */
export async function addItem(
  uid,
  { text, url = null, attachments = [], knownCategories = CATEGORIES }
) {
  const trimmed = (text || '').trim()
  const detectedUrl = url || extractUrl(trimmed)

  // For a file-only capture, use the file name(s) as the text.
  const split = attachments.map(splitAttachment)
  const classifyText = trimmed || split.map((s) => s.meta.name).join(', ')
  const displayText = trimmed || split.map((s) => s.meta.name).join(', ')

  // Instant, offline rules classification — no AI on the capture path.
  const rules = classifyByRules({ text: classifyText, url: detectedUrl })
  const now = Date.now()
  const willEnrich = shouldEnrich(classifyText, detectedUrl, rules.category)

  const docData = {
    text: displayText,
    url: detectedUrl,
    category: rules.category,
    classification: {
      auto: true,
      confidence: rules.confidence,
      tier: 'rules',
      reason: rules.reason,
    },
    done: false,
    createdAt: now,
    updatedAt: now,
    project: rules.category === 'Projects' ? emptyProject() : null,
    context: '',
    suggestedCategory: null,
    needsEnrich: willEnrich, // AI pass adds context / better category later
    attachments: split.map((s) => s.meta),
  }

  const ref = await addDoc(itemsCol(uid), docData)
  await Promise.all(
    split.map((s) => setDoc(fileRef(uid, ref.id, s.meta.fileId), s.bytes))
  )

  // Fire the AI enrichment in the background (don't block capture).
  if (willEnrich) {
    void enrichItem(uid, ref.id, {
      text: classifyText,
      url: detectedUrl,
      knownCategories,
    }).catch(() => {})
  }
  return ref.id
}

const itemRef = (uid, id) => doc(db, 'users', uid, 'items', id)

export function updateItem(uid, id, patch) {
  return updateDoc(itemRef(uid, id), { ...patch, updatedAt: Date.now() })
}

export function setDone(uid, id, done) {
  return updateItem(uid, id, { done })
}

/**
 * Manual recategorization. Marks the item as no longer auto-filed and adds the
 * project sub-object if moving into Projects (and drops it when moving out).
 */
export function setCategory(uid, id, category, currentProject) {
  const patch = {
    category,
    'classification.auto': false,
  }
  if (category === 'Projects') {
    patch.project = currentProject || emptyProject()
  } else {
    patch.project = null
  }
  return updateItem(uid, id, patch)
}

export function setProjectFields(uid, id, fields) {
  return updateItem(uid, id, {
    'project.difficulty': fields.difficulty ?? '',
    'project.problemSolved': fields.problemSolved ?? '',
    'project.targetDate': fields.targetDate ?? '',
  })
}

export async function deleteItem(uid, id, attachments = []) {
  // Clean up any stored file bytes first (subcollections aren't auto-deleted).
  await Promise.all(
    (attachments || []).map((a) =>
      deleteDoc(fileRef(uid, id, a.fileId)).catch(() => {})
    )
  )
  await deleteDoc(itemRef(uid, id))
}

/**
 * Edit a note's text. Keeps its category/flags as-is (the user is editing
 * wording, not re-filing).
 */
export function editText(uid, id, text) {
  return updateItem(uid, id, { text: (text || '').trim() })
}

/** Attach one or more prepared files to an existing note. */
export async function addAttachments(uid, id, prepared = []) {
  const split = prepared.map(splitAttachment)
  await Promise.all(
    split.map((s) => setDoc(fileRef(uid, id, s.meta.fileId), s.bytes))
  )
  await updateDoc(itemRef(uid, id), {
    attachments: arrayUnion(...split.map((s) => s.meta)),
    updatedAt: Date.now(),
  })
}

/** Fetch a file's bytes (data URL) on demand, for viewing/downloading. */
export async function getFileData(uid, id, fileId) {
  const snap = await getDoc(fileRef(uid, id, fileId))
  return snap.exists() ? snap.data().dataUrl : null
}

/** Remove one attachment from a note (deletes its bytes too). */
export async function removeAttachment(uid, id, meta) {
  await deleteDoc(fileRef(uid, id, meta.fileId))
  await updateDoc(itemRef(uid, id), {
    attachments: arrayRemove(meta),
    updatedAt: Date.now(),
  })
}

/**
 * AI-enrich a single note: read its link/long text, add a one-line context,
 * pick the best existing category, and maybe suggest a new one. Safe no-op
 * offline. Won't override a category the user set manually.
 */
export async function enrichItem(uid, id, { text, url = null, knownCategories = CATEGORIES }) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return
  let res = null
  try {
    res = await enrichNote({ text, url, categories: knownCategories })
  } catch {
    res = null
  }
  if (!res) {
    // Don't keep retrying forever if the AI couldn't help.
    await updateItem(uid, id, { needsEnrich: false }).catch(() => {})
    return
  }

  const patch = { needsEnrich: false, context: res.context || '' }
  if (res.suggestedCategory) patch.suggestedCategory = res.suggestedCategory

  // Snapshot the item to respect a manual category and current value.
  let current = null
  try {
    const snap = await getDoc(itemRef(uid, id))
    current = snap.exists() ? snap.data() : null
  } catch {
    current = null
  }
  const manual = current?.classification?.auto === false
  if (!manual && res.category && res.category !== current?.category) {
    patch.category = res.category
    patch.classification = {
      auto: true,
      confidence: res.confidence,
      tier: 'llm',
      reason: 'AI context-aware filing',
    }
    patch.project = res.category === 'Projects' ? emptyProject() : null
  }
  await updateItem(uid, id, patch)
}

/**
 * Catch-up pass: enrich every note still flagged needsEnrich (e.g. captured
 * offline). Safe on load; no-ops offline / in local mode.
 * @returns {Promise<number>} how many notes were enriched.
 */
export async function enrichPending(uid, items, knownCategories = CATEGORIES) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 0
  const pending = (items || []).filter((i) => i.needsEnrich && !i.done)
  let n = 0
  for (const item of pending) {
    await enrichItem(uid, item.id, {
      text: item.text,
      url: item.url || null,
      knownCategories,
    })
    n += 1
  }
  return n
}

// Back-compat alias.
export const tidyInbox = enrichPending

/** Approve an AI-suggested new category: move the note into it. */
export function approveCategory(uid, id, category) {
  return updateItem(uid, id, {
    category,
    suggestedCategory: null,
    'classification.auto': false,
    project: category === 'Projects' ? emptyProject() : null,
  })
}

/** Dismiss an AI category suggestion (keep current category). */
export function dismissSuggestion(uid, id) {
  return updateItem(uid, id, { suggestedCategory: null })
}
