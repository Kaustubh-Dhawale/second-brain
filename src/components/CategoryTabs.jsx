import { colorFor } from '../categories.js'

// Category navigation with live counts. "All" shows everything; the rest are the
// built-in categories plus any AI-created ones already in use.
export default function CategoryTabs({ active, onSelect, items, categories }) {
  const openCount = (cat) =>
    items.filter((i) => !i.done && (cat === 'All' || i.category === cat)).length

  const tabs = ['All', ...categories]

  return (
    <nav className="tabs">
      {tabs.map((cat) => {
        const count = openCount(cat)
        const style =
          cat !== 'All' && active !== cat ? { '--cat': colorFor(cat) } : undefined
        return (
          <button
            key={cat}
            className={`tab ${active === cat ? 'active' : ''} ${cat !== 'All' ? 'tab-cat' : ''}`}
            style={style}
            onClick={() => onSelect(cat)}
          >
            {cat !== 'All' && active !== cat && <span className="tab-dot" />}
            {cat}
            {count > 0 && <span className="badge">{count}</span>}
          </button>
        )
      })}
    </nav>
  )
}
