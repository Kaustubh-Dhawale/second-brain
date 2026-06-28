import { colorFor } from '../categories.js'
import { bucketOf } from '../schedule/buckets.js'

// Small line icons (kept inline so there's no icon dependency).
const Icon = ({ d, ...p }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none"
    stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"
    strokeLinejoin="round" aria-hidden="true" {...p}>
    {d}
  </svg>
)
const SunIcon = () => <Icon d={<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>} />
const CalIcon = () => <Icon d={<><rect x="3" y="4.5" width="18" height="16" rx="2" /><path d="M3 9h18M8 2.5v4M16 2.5v4" /></>} />
const InboxIcon = () => <Icon d={<><path d="M3 12h5l1.5 3h5L16 12h5" /><path d="M5 5h14l2 7v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5z" /></>} />
const BellIcon = () => <Icon d={<><path d="M6 9a6 6 0 0 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6z" /><path d="M10 20a2 2 0 0 0 4 0" /></>} />

const LEAD_OPTS = [
  [0, 'At due time only'],
  [5, '5 min before'],
  [10, '10 min before'],
  [15, '15 min before'],
  [30, '30 min before'],
  [60, '1 hour before'],
]

// Persistent navigation. VIEWS are schedule-driven smart views; COLLECTIONS are
// the user's categories (built-in + any AI-created), each with a live count.
// A footer holds device-level controls (push reminders) reachable on mobile too.
export default function Sidebar({
  active, onSelect, items, categories, onClose,
  pushConfigured, pushEnabled, pushPermission, pushBusy,
  onEnablePush, onDisablePush, leadMin, onLeadChange,
}) {
  const open = items.filter((i) => !i.done)
  const now = Date.now()

  const todayCount = open.filter((i) => {
    const b = bucketOf(i.dueAt, now)
    return b === 'today' || b === 'overdue'
  }).length
  const scheduledCount = open.filter((i) => i.dueAt).length
  const inboxCount = open.filter((i) => i.category === 'Inbox').length
  const catCount = (c) => open.filter((i) => i.category === c).length

  const collections = categories.filter((c) => c !== 'Inbox')

  const pick = (v) => {
    onSelect(v)
    onClose?.()
  }

  const Row = ({ id, icon, label, count }) => (
    <button
      className={`nav-item ${active === id ? 'active' : ''}`}
      onClick={() => pick(id)}
    >
      <span className="nav-icon">{icon}</span>
      <span className="nav-label">{label}</span>
      {count > 0 && <span className="nav-count">{count}</span>}
    </button>
  )

  return (
    <aside className="sidebar">
      <div className="nav-group">
        <div className="nav-heading">Views</div>
        <Row id="Today" icon={<SunIcon />} label="Today" count={todayCount} />
        <Row id="Scheduled" icon={<CalIcon />} label="Scheduled" count={scheduledCount} />
        <Row id="Inbox" icon={<InboxIcon />} label="Inbox" count={inboxCount} />
      </div>

      <div className="nav-group">
        <div className="nav-heading">Collections</div>
        {collections.map((c) => (
          <Row
            key={c}
            id={c}
            icon={<span className="nav-dot" style={{ background: colorFor(c) }} />}
            label={c}
            count={catCount(c)}
          />
        ))}
      </div>

      {pushConfigured && (
        <div className="nav-footer">
          <div className="nav-heading"><BellIcon /> Reminders</div>
          {pushPermission === 'denied' ? (
            <p className="reminders-hint muted small">
              Notifications are blocked. Allow them for this site in your browser
              settings, then turn reminders on.
            </p>
          ) : pushEnabled ? (
            <>
              <button className="cal-status connected" onClick={onDisablePush} disabled={pushBusy} title="Turn off reminders on this device">
                <span className="cal-dot" /> Reminders on
              </button>
              <label className="lead-row small">
                Remind me
                <select className="lead-select" value={leadMin} onChange={(e) => onLeadChange(Number(e.target.value))}>
                  {LEAD_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>
            </>
          ) : (
            <button className="cal-status" onClick={onEnablePush} disabled={pushBusy}>
              <span className="cal-dot off" /> {pushBusy ? 'Enabling…' : 'Enable reminders'}
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
