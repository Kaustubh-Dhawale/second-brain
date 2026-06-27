// ============================================================================
// STORAGE SELECTOR — the single data entry point for the whole UI.
//
// If Firebase config is present  → cloud backend (Firestore + offline sync,
//                                  data locked to your signed-in account).
// If it isn't                    → local backend (IndexedDB on this device,
//                                  no account, works instantly with no setup).
//
// Both backends expose the identical API, so components never care which is
// active. Add Firebase config later and the app upgrades to cross-device sync
// without any code change.
// ============================================================================
import { isFirebaseConfigured } from '../firebase.js'
import * as cloud from './items.js'
import * as local from './localStore.js'

export const usingCloud = isFirebaseConfigured

const backend = isFirebaseConfigured ? cloud : local

export const subscribeItems = backend.subscribeItems
export const addItem = backend.addItem
export const setDone = backend.setDone
export const setCategory = backend.setCategory
export const setSchedule = backend.setSchedule
export const setGcalEventId = backend.setGcalEventId
export const setProjectFields = backend.setProjectFields
export const deleteItem = backend.deleteItem
export const editText = backend.editText
export const enrichPending = backend.enrichPending
export const tidyInbox = backend.tidyInbox
export const approveCategory = backend.approveCategory
export const dismissSuggestion = backend.dismissSuggestion
export const addAttachments = backend.addAttachments
export const getFileData = backend.getFileData
export const removeAttachment = backend.removeAttachment

export { extractUrl } from './util.js'
