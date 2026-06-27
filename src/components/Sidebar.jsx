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

// Persistent navigation. VIEWS are schedule-driven smart views; COLLECTIONS are
// the user's categories (built-in + any AI-created), each with a live count.
export default function Sidebar({ active, onSelect, items, categories, onClose }) {
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

  const Row = ({ id, icon, label, count, dot }) => (
    <button
      className={`nav-item ${active === id ? 'active' : ''}`}
      onClick={() => pick(id)}
      style={dot ? { '--cat': dot } : undefined}
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
            dot={colorFor(c)}
          />
        ))}
      </div>
    </aside>
  )
}
