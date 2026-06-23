import { useEffect, useMemo, useRef, useState } from 'react'
import { usingCloud } from './data/store.js'
import { isAiAvailable } from './ai.js'
import { useAuth } from './hooks/useAuth.js'
import { useItems } from './hooks/useItems.js'
import {
  addItem,
  setDone,
  setCategory,
  setProjectFields,
  deleteItem,
  editText,
  enrichPending,
  approveCategory,
  dismissSuggestion,
  addAttachments,
  getFileData,
  removeAttachment,
} from './data/store.js'
import { openDataUrl } from './files.js'
import { signOutUser } from './auth.js'
import { slugToCategory, activeCategories } from './categories.js'
import AuthScreen from './components/AuthScreen.jsx'
import CaptureBar from './components/CaptureBar.jsx'
import CategoryTabs from './components/CategoryTabs.jsx'
import ItemList from './components/ItemList.jsx'
import SyncStatus from './components/SyncStatus.jsx'

// Read ?view= / ?focus= once on load (used by the PWA home-screen shortcuts).
function readUrlParams() {
  const p = new URLSearchParams(window.location.search)
  return {
    view: slugToCategory(p.get('view')) || 'All',
    focus: p.get('focus') === '1',
  }
}

export default function App() {
  // Local mode: no Firebase config → run instantly on this device, no sign-in.
  if (!usingCloud) {
    return <Shell uid="local" email={null} cloud={false} />
  }
  // Cloud mode: require sign-in so data is locked to the account.
  return <AuthedGate />
}

function AuthedGate() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="screen center">
        <p className="muted">Loading…</p>
      </div>
    )
  }
  if (!user) return <AuthScreen />

  return <Shell uid={user.uid} email={user.email} cloud={true} />
}

function Shell({ uid, email, cloud }) {
  const [{ view: initialView, focus }] = useState(readUrlParams)
  const [active, setActive] = useState(initialView)
  const [search, setSearch] = useState('')
  const [enriching, setEnriching] = useState(false)
  const { items, loading } = useItems(uid)
  const didEnrich = useRef(false)

  // Built-in categories plus any custom ones already in use.
  const categories = useMemo(() => activeCategories(items), [items])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return items.filter((i) => {
      if (active !== 'All' && i.category !== active) return false
      if (q && !(`${i.text} ${i.context || ''} ${i.url || ''}`.toLowerCase().includes(q)))
        return false
      return true
    })
  }, [items, active, search])

  // Keep the document title showing the open-item count.
  useEffect(() => {
    const open = items.filter((i) => !i.done).length
    document.title = open ? `Second Brain (${open})` : 'Second Brain'
  }, [items])

  // Catch-up once per load: AI-enrich any notes still pending (e.g. captured
  // offline). No-ops in local mode / offline / when nothing pending.
  useEffect(() => {
    if (didEnrich.current || loading || !isAiAvailable) return
    if (!items.some((i) => i.needsEnrich && !i.done)) return
    didEnrich.current = true
    enrichPending(uid, items, categories).catch(() => {})
  }, [items, loading, uid, categories])

  const runEnrich = async () => {
    if (enriching) return
    setEnriching(true)
    try {
      await enrichPending(uid, items, categories)
    } finally {
      setEnriching(false)
    }
  }

  const handlers = {
    onToggleDone: (id, done) => setDone(uid, id, done),
    onChangeCategory: (id, cat, project) => setCategory(uid, id, cat, project),
    onSaveProject: (id, fields) => setProjectFields(uid, id, fields),
    onEditText: (id, text) => editText(uid, id, text),
    onDelete: (id, attachments) => deleteItem(uid, id, attachments),
    onAttach: (id, prepared) => addAttachments(uid, id, prepared),
    onRemoveAttachment: (id, meta) => removeAttachment(uid, id, meta),
    onApproveCategory: (id, cat) => approveCategory(uid, id, cat),
    onDismissSuggestion: (id) => dismissSuggestion(uid, id),
    onOpenFile: async (item, att) => {
      const dataUrl = await getFileData(uid, item.id, att.fileId)
      if (dataUrl) openDataUrl(dataUrl, att.name)
    },
  }

  const pendingCount = items.filter((i) => i.needsEnrich && !i.done).length
  const showEnrich = isAiAvailable && pendingCount > 0

  return (
    <div className="app">
      <header className="topbar">
        <h1 className="brand"><span className="logo" aria-hidden="true">b</span> Second Brain</h1>
        <div className="topbar-right">
          {cloud ? (
            <>
              <SyncStatus />
              <button className="link small" onClick={() => signOutUser()} title={email}>
                Sign out
              </button>
            </>
          ) : (
            <span className="sync local" title="Saved on this device">
              <span className="dot" />
              On this device
            </span>
          )}
        </div>
      </header>

      {!cloud && (
        <div className="banner">
          Running locally — your notes are saved on this device. To sync across
          your PC, Mac, and iPhone, add Firebase later (see README). No setup
          needed to use it now.
        </div>
      )}

      <div className="sticky-top">
        <CaptureBar
          onCapture={(text, attachments) =>
            addItem(uid, { text, attachments, knownCategories: categories })
          }
          autoFocus={focus}
        />

        <div className="search">
          <span className="search-icon" aria-hidden="true">⌕</span>
          <input
            type="search"
            className="search-input"
            placeholder="Search notes…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          {search && (
            <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">
              ✕
            </button>
          )}
        </div>

        <CategoryTabs
          active={active}
          onSelect={setActive}
          items={items}
          categories={categories}
        />
      </div>

      {showEnrich && (
        <div className="tidy-row">
          <button className="tidy-btn" onClick={runEnrich} disabled={enriching}>
            {enriching ? 'Reading & filing…' : `✨ Catch up with AI (${pendingCount})`}
          </button>
        </div>
      )}

      <main className="list-area">
        <ItemList
          items={visible}
          handlers={handlers}
          loading={loading}
          categories={categories}
        />
      </main>
    </div>
  )
}
