import ItemRow from './ItemRow.jsx'
import { groupByBucket } from '../schedule/buckets.js'

// Renders open items — grouped into time buckets (Today / This week / …) for
// the schedule-driven views, or as a flat list for a single collection — then a
// collapsed "Done" group.
export default function ItemList({
  items,
  handlers,
  loading,
  categories,
  groupMode = 'bucket',
  emptyHint = 'Nothing here yet. Capture something above.',
}) {
  if (loading) return <p className="muted center-text">Loading…</p>

  const open = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)

  if (open.length === 0 && done.length === 0)
    return <p className="muted center-text">{emptyHint}</p>

  const groups =
    groupMode === 'bucket'
      ? groupByBucket(open)
      : open.length
        ? [{ key: 'all', label: null, items: open }]
        : []

  return (
    <>
      {groups.map((g) => (
        <section className="stream-group" key={g.key}>
          {g.label && <div className="stream-label">{g.label}</div>}
          <ul className="rows">
            {g.items.map((item) => (
              <ItemRow key={item.id} item={item} categories={categories} {...handlers} />
            ))}
          </ul>
        </section>
      ))}

      {done.length > 0 && (
        <details className="done-group">
          <summary>Done ({done.length})</summary>
          <ul className="rows">
            {done.map((item) => (
              <ItemRow key={item.id} item={item} categories={categories} {...handlers} />
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
