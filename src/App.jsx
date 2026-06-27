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
  setSchedule,
  setGcalEventId,
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
import { slugToCategory, slugToView, activeCategories } from './categories.js'
import { bucketOf, nextOccurrence } from './schedule/buckets.js'
import {
  isCalendarConfigured,
  onCalendarState,
  connectCalendar,
  disconnectCalendar,
  pushEvent,
  deleteEvent,
  listUpcoming,
} from './calendar.js'
import AuthScreen from './components/AuthScreen.jsx'
import CaptureBar from './components/CaptureBar.jsx'
import Sidebar from './components/Sidebar.jsx'
import Agenda from './components/Agenda.jsx'
import ItemList from './components/ItemList.jsx'
import SyncStatus from './components/SyncStatus.jsx'

// Read ?view= / ?focus= once on load (used by the PWA home-screen shortcuts).
function readUrlParams() {
  const p = new URLSearchParams(window.location.search)
  const v = p.get('view')
  return {
    view: slugToView(v) || slugToCategory(v) || 'Today',
    focus: p.get('focus') === '1',
  }
}

export default function App() {
  if (!usingCloud) return <Shell uid="local" email={null} cloud={false} />
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
  const [navOpen, setNavOpen] = useState(false)
  const [calConnected, setCalConnected] = useState(false)
  const [calBusy, setCalBusy] = useState(false)
  const [external, setExternal] = useState([])
  const { items, loading } = useItems(uid)
  const didEnrich = useRef(false)

  const categories = useMemo(() => activeCategories(items), [items])

  // --- calendar state + pull --------------------------------------------
  useEffect(() => {
    if (!isCalendarConfigured) return
    return onCalendarState(setCalConnected)
  }, [])

  useEffect(() => {
    if (!isCalendarConfigured || !calConnected) {
      setExternal([])
      return
    }
    let alive = true
    listUpcoming(8).then((ev) => alive && setExternal(ev)).catch(() => {})
    return () => { alive = false }
  }, [calConnected, items])

  // --- visible items for the active view --------------------------------
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    const matchesSearch = (i) =>
      !q || `${i.text} ${i.context || ''} ${i.url || ''}`.toLowerCase().includes(q)

    return items.filter((i) => {
      if (!matchesSearch(i)) return false
      if (active === 'Today') return true
      if (active === 'Scheduled') return Boolean(i.dueAt)
      if (active === 'Inbox') return i.category === 'Inbox'
      return i.category === active
    })
  }, [items, active, search])

  const scheduleViews = active === 'Today' || active === 'Scheduled'
  const groupMode = scheduleViews ? 'bucket' : 'none'

  // For Scheduled, only keep dated items (done ones too, so they can be ticked).
  const listItems = useMemo(() => {
    if (active === 'Scheduled') return visible.filter((i) => i.dueAt)
    return visible
  }, [visible, active])

  useEffect(() => {
    const open = items.filter((i) => !i.done).length
    document.title = open ? `Second Brain (${open})` : 'Second Brain'
  }, [items])

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

  // --- calendar connect / disconnect ------------------------------------
  const connect = async () => {
    setCalBusy(true)
    try {
      await connectCalendar()
    } catch {
      /* user closed popup or denied */
    } finally {
      setCalBusy(false)
    }
  }
  const disconnect = () => disconnectCalendar()

  // Push a freshly scheduled item to Google Calendar (best effort).
  const syncToCalendar = async (id, item) => {
    if (!isCalendarConfigured || !calConnected) return
    try {
      if (item.dueAt) {
        const eventId = await pushEvent(item)
        if (eventId && eventId !== item.gcalEventId) await setGcalEventId(uid, id, eventId)
      } else if (item.gcalEventId) {
        await deleteEvent(item.gcalEventId)
        await setGcalEventId(uid, id, null)
      }
    } catch {
      /* best effort */
    }
  }

  const handlers = {
    onToggleDone: async (id, done) => {
      const item = items.find((i) => i.id === id)
      // A recurring task rolls forward instead of vanishing.
      if (done && item?.recurrence && item?.dueAt) {
        const next = nextOccurrence(item.dueAt, item.recurrence)
        await setSchedule(uid, id, { dueAt: next, hasTime: item.hasTime, recurrence: item.recurrence })
        return
      }
      await setDone(uid, id, done)
    },
    onChangeCategory: (id, cat, project) => setCategory(uid, id, cat, project),
    onSaveProject: (id, fields) => setProjectFields(uid, id, fields),
    onSchedule: async (id, schedule) => {
      await setSchedule(uid, id, schedule)
      const item = items.find((i) => i.id === id)
      await syncToCalendar(id, { ...item, ...schedule })
    },
    onEditText: (id, text) => editText(uid, id, text),
    onDelete: async (id, attachments) => {
      const item = items.find((i) => i.id === id)
      if (item?.gcalEventId) await deleteEvent(item.gcalEventId).catch(() => {})
      await deleteItem(uid, id, attachments)
    },
    onAttach: (id, prepared) => addAttachments(uid, id, prepared),
    onRemoveAttachment: (id, meta) => removeAttachment(uid, id, meta),
    onApproveCategory: (id, cat) => approveCategory(uid, id, cat),
    onDismissSuggestion: (id) => dismissSuggestion(uid, id),
    onOpenFile: async (item, att) => {
      const dataUrl = await getFileData(uid, item.id, att.fileId)
      if (dataUrl) openDataUrl(dataUrl, att.name)
    },
  }

  const onCapture = async (text, attachments, schedule) => {
    const id = await addItem(uid, { text, attachments, knownCategories: categories, schedule })
    if (schedule?.dueAt) {
      await syncToCalendar(id, { ...schedule, gcalEventId: null, text })
    }
    // Surface scheduled captures by jumping to Today.
    if (schedule?.dueAt && active !== 'Today' && active !== 'Scheduled') setActive('Today')
  }

  const pendingCount = items.filter((i) => i.needsEnrich && !i.done).length
  const showEnrich = isAiAvailable && pendingCount > 0
  const scheduledOpen = items.filter((i) => i.dueAt && !i.done)

  const viewTitle =
    active === 'Today' ? 'Today' :
    active === 'Scheduled' ? 'Scheduled' :
    active === 'Inbox' ? 'Inbox' : active

  return (
    <div className="layout">
      {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

      <div className={`sidebar-wrap ${navOpen ? 'show' : ''}`}>
        <div className="brand-row">
          <span className="logo" aria-hidden="true">b</span>
          <span className="brand-name">Second Brain</span>
        </div>
        <Sidebar
          active={active}
          onSelect={setActive}
          items={items}
          categories={categories}
          onClose={() => setNavOpen(false)}
        />
      </div>

      <main className="content">
        <header className="topbar">
          <button className="hamburger" onClick={() => setNavOpen(true)} aria-label="Menu">≡</button>
          <h1 className="view-title">{viewTitle}</h1>
          <div className="search">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              className="search-input"
              placeholder="Search or jump to…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button className="search-clear" onClick={() => setSearch('')} aria-label="Clear search">✕</button>
            )}
          </div>
          <div className="topbar-right">
            {cloud ? (
              <>
                <SyncStatus />
                <button className="link small" onClick={() => signOutUser()} title={email}>Sign out</button>
              </>
            ) : (
              <span className="sync local" title="Saved on this device">
                <span className="dot" /> On this device
              </span>
            )}
          </div>
        </header>

        {!cloud && (
          <div className="banner">
            Running locally — notes are saved on this device. Add Firebase to sync
            across your PC, Mac, and iPhone (see README).
          </div>
        )}

        <div className="capture-wrap">
          <CaptureBar
            onCapture={onCapture}
            autoFocus={focus}
          />
        </div>

        {showEnrich && (
          <div className="tidy-row">
            <button className="tidy-btn" onClick={runEnrich} disabled={enriching}>
              {enriching ? 'Reading & filing…' : `✨ Catch up with AI (${pendingCount})`}
            </button>
          </div>
        )}

        <div className="stream">
          <ItemList
            items={listItems}
            handlers={handlers}
            loading={loading}
            categories={categories}
            groupMode={groupMode}
            emptyHint={
              active === 'Scheduled'
                ? 'Nothing scheduled yet. Add a time as you capture.'
                : active === 'Inbox'
                  ? 'Inbox is clear.'
                  : 'Nothing here yet. Capture something above.'
            }
          />
        </div>
      </main>

      <Agenda
        items={scheduledOpen}
        externalEvents={external}
        calendarConfigured={isCalendarConfigured}
        calendarConnected={calConnected}
        onConnect={connect}
        onDisconnect={disconnect}
        onToggleDone={handlers.onToggleDone}
        busy={calBusy}
      />
    </div>
  )
}
