import ItemCard from './ItemCard.jsx'

// Renders open items first, then a collapsed-feeling "Done" group.
export default function ItemList({ items, handlers, loading, categories }) {
  if (loading) return <p className="muted center-text">Loading…</p>
  if (items.length === 0)
    return <p className="muted center-text">Nothing here yet. Capture something above.</p>

  const open = items.filter((i) => !i.done)
  const done = items.filter((i) => i.done)

  return (
    <>
      <ul className="items">
        {open.map((item) => (
          <ItemCard key={item.id} item={item} categories={categories} {...handlers} />
        ))}
      </ul>

      {done.length > 0 && (
        <details className="done-group">
          <summary>Done ({done.length})</summary>
          <ul className="items">
            {done.map((item) => (
              <ItemCard key={item.id} item={item} categories={categories} {...handlers} />
            ))}
          </ul>
        </details>
      )}
    </>
  )
}
