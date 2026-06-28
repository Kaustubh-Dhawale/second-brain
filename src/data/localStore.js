// ============================================================================
// LOCAL STORAGE BACKEND — no Firebase required.
// Stores items in the browser's IndexedDB so the app works fully offline on a
// single device with ZERO setup. Exposes the exact same API as the Firestore
// backend (items.js), so the rest of the app doesn't know which one is in use.
//
// IndexedDB has no built-in change events, so we keep an in-memory cache and a
// tiny pub/sub to notify the UI on every write.
// ============================================================================
import { classify } from '../classifier/index.js'
import { extractUrl, emptyProject } from './util.js'

const DB_NAME = 'second-brain-local'
const STORE = 'items'

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

function readAll() {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readonly')
        const req = tx.objectStore(STORE).getAll()
        req.onsuccess = () => resolve(req.result || [])
        req.onerror = () => reject(req.error)
      })
  )
}

function writeItem(item) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).put(item)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

function eraseItem(id) {
  return openDB().then(
    (db) =>
      new Promise((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite')
        tx.objectStore(STORE).delete(id)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
  )
}

// --- in-memory cache + pub/sub ---------------------------------------------
let cache = null
const listeners = new Set()

async function ensureCache() {
  if (!cache) cache = await readAll()
  return cache
}

function sorted() {
  return [...cache].sort((a, b) => b.createdAt - a.createdAt)
}

function emit() {
  const snap = sorted()
  listeners.forEach((fn) => fn(snap))
}

function newId() {
  return 'id-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

// --- public API (matches items.js) -----------------------------------------
export function subscribeItems(_uid, onChange) {
  let active = true
  listeners.add(onChange)
  ensureCache().then(() => {
    if (active) onChange(sorted())
  })
  return () => {
    active = false
    listeners.delete(onChange)
  }
}

function attachmentId() {
  return 'f-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
}

export async function addItem(_uid, { text, url = null, attachments = [], schedule = null }) {
  await ensureCache()
  const trimmed = (text || '').trim()
  const detectedUrl = url || extractUrl(trimmed)
  // Local mode keeps full bytes inline (IndexedDB has no 1 MB doc limit).
  const atts = attachments.map((a) => ({ fileId: attachmentId(), ...a }))
  const classifyText = trimmed || atts.map((a) => a.name).join(', ')
  const result = await classify({ text: classifyText, url: detectedUrl })
  const now = Date.now()
  const item = {
    id: newId(),
    text: trimmed || atts.map((a) => a.name).join(', '),
    url: detectedUrl,
    category: result.category,
    classification: {
      auto: true,
      confidence: result.confidence,
      tier: result.tier,
      reason: result.reason,
    },
    done: false,
    createdAt: now,
    updatedAt: now,
    project: result.category === 'Projects' ? emptyProject() : null,
    context: '',
    suggestedCategory: null,
    needsEnrich: false, // no AI in local mode
    attachments: atts,
    dueAt: schedule?.dueAt ?? null,
    hasTime: schedule?.hasTime ?? false,
    recurrence: schedule?.recurrence ?? null,
    gcalEventId: null,
  }
  cache.push(item)
  await writeItem(item)
  emit()
  return item.id
}

async function patch(id, fn) {
  await ensureCache()
  const i = cache.findIndex((x) => x.id === id)
  if (i < 0) return
  const updated = { ...cache[i], ...fn(cache[i]), updatedAt: Date.now() }
  cache[i] = updated
  await writeItem(updated)
  emit()
}

export function setDone(_uid, id, done) {
  return patch(id, () => ({ done }))
}

export function setCategory(_uid, id, category, currentProject) {
  return patch(id, (item) => ({
    category,
    project:
      category === 'Projects' ? currentProject || emptyProject() : null,
    classification: { ...item.classification, auto: false },
  }))
}

export function setSchedule(_uid, id, schedule) {
  return patch(id, () => ({
    dueAt: schedule?.dueAt ?? null,
    hasTime: schedule?.hasTime ?? false,
    recurrence: schedule?.recurrence ?? null,
  }))
}

export function setGcalEventId(_uid, id, gcalEventId) {
  return patch(id, () => ({ gcalEventId: gcalEventId ?? null }))
}

export function setProjectFields(_uid, id, fields) {
  return patch(id, (item) => ({
    project: {
      ...(item.project || emptyProject()),
      difficulty: fields.difficulty ?? '',
      problemSolved: fields.problemSolved ?? '',
      targetDate: fields.targetDate ?? '',
    },
  }))
}

export function editText(_uid, id, text) {
  return patch(id, () => ({ text: (text || '').trim() }))
}

export function addAttachments(_uid, id, prepared = []) {
  const atts = prepared.map((a) => ({ fileId: attachmentId(), ...a }))
  return patch(id, (item) => ({
    attachments: [...(item.attachments || []), ...atts],
  }))
}

export async function getFileData(_uid, id, fileId) {
  await ensureCache()
  const item = cache.find((x) => x.id === id)
  const att = item?.attachments?.find((a) => a.fileId === fileId)
  return att ? att.dataUrl : null
}

export function removeAttachment(_uid, id, meta) {
  return patch(id, (item) => ({
    attachments: (item.attachments || []).filter((a) => a.fileId !== meta.fileId),
  }))
}

// No AI in local mode — nothing to enrich. Present for API parity.
export async function enrichPending() {
  return 0
}
export const tidyInbox = enrichPending

export function approveCategory(_uid, id, category) {
  return patch(id, () => ({
    category,
    suggestedCategory: null,
    project: category === 'Projects' ? emptyProject() : null,
  }))
}

export function dismissSuggestion(_uid, id) {
  return patch(id, () => ({ suggestedCategory: null }))
}

export async function deleteItem(_uid, id) {
  await ensureCache()
  cache = cache.filter((x) => x.id !== id)
  await eraseItem(id)
  emit()
}

// Push reminders require the cloud backend; no-ops in local mode.
export async function savePushSubscription() {}
export async function removePushSubscription() {}
export async function setReminderLead() {}
export async function getReminderLead() { return 15 }
