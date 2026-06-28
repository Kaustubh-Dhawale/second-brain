import { groupByBucket } from '../schedule/buckets.js'
import { formatTime } from '../schedule/parseDate.js'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// The quiet right-hand panel. Lists everything scheduled — the app's own dated
// items plus (when connected) real Google Calendar events — grouped by day.
export default function Agenda({
  items,
  externalEvents = [],
  calendarConfigured,
  calendarConnected,
  onConnect,
  onDisconnect,
  onToggleDone,
  busy,
}) {
  const now = Date.now()
  const today = new Date(now)

  const appEntries = items
    .filter((i) => i.dueAt && !i.done)
    .map((i) => ({
      key: i.id, title: i.text, dueAt: i.dueAt, hasTime: i.hasTime, external: false, id: i.id,
    }))

  const extEntries = externalEvents.map((e) => ({
    key: `ext-${e.id}`, title: e.title, dueAt: e.start, hasTime: e.hasTime, external: true,
  }))

  const all = [...appEntries, ...extEntries]
  const groups = groupByBucket(all, { scheduledOnly: true, now })

  return (
    <aside className="agenda">
      <div className="agenda-head">
        <h2>Agenda</h2>
        <span className="agenda-date">{MONTHS[today.getMonth()]} {today.getDate()}</span>
      </div>

      {all.length === 0 ? (
        <p className="agenda-empty">
          Nothing scheduled. Add a time as you type — “tomorrow 3pm”.
        </p>
      ) : (
        <div className="agenda-body">
          {groups.map((g) => (
            <div className="agenda-group" key={g.key}>
              <div className="agenda-label">{g.label}</div>
              {g.items.map((e) => (
                <div className={`agenda-item ${e.external ? 'external' : ''}`} key={e.key}>
                  <span className="agenda-time">
                    {e.hasTime ? formatTime(new Date(e.dueAt).getHours(), new Date(e.dueAt).getMinutes()).replace(' ', '') : 'all-day'}
                  </span>
                  {!e.external && onToggleDone ? (
                    <button className="agenda-check" onClick={() => onToggleDone(e.id, true)} title="Mark done" aria-label="Mark done" />
                  ) : (
                    <span className="agenda-bullet" aria-hidden="true" />
                  )}
                  <span className="agenda-title">{e.title}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      {calendarConfigured && (
        <div className="agenda-foot">
          {calendarConnected ? (
            <button className="cal-status connected" onClick={onDisconnect} disabled={busy} title="Disconnect Google Calendar">
              <span className="cal-dot" /> Synced to calendar
            </button>
          ) : (
            <button className="cal-status" onClick={onConnect} disabled={busy}>
              <span className="cal-dot off" /> {busy ? 'Connecting…' : 'Connect Google Calendar'}
            </button>
          )}
        </div>
      )}
    </aside>
  )
}
