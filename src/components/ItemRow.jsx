import { useEffect, useRef, useState } from 'react'
import { CATEGORIES, colorFor, normalizeCategory } from '../categories.js'
import { prepareFile } from '../files.js'
import { scheduleTag } from '../schedule/parseDate.js'
import ProjectFields from './ProjectFields.jsx'

// A note is shown as a TASK (checkbox) when it has a due date or is an errand;
// otherwise it's a NOTE (colored dot). This keeps plain captures simple.
const isTaskItem = (item) => Boolean(item.dueAt) || item.category === 'Errands'

const RECURRENCE_OPTS = [
  ['', 'Does not repeat'],
  ['daily', 'Every day'],
  ['weekdays', 'Every weekday'],
  ['weekly', 'Every week'],
]

// Format an epoch for a <input type="datetime-local"> (local time).
function toLocalInput(ms) {
  if (!ms) return ''
  const d = new Date(ms)
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// One quiet row. Compact by default; actions and editing controls appear on
// hover / when the details drawer is opened.
export default function ItemRow({
  item,
  categories = CATEGORIES,
  onToggleDone,
  onChangeCategory,
  onSaveProject,
  onEditText,
  onDelete,
  onAttach,
  onRemoveAttachment,
  onApproveCategory,
  onDismissSuggestion,
  onOpenFile,
  onSchedule,
}) {
  const [open, setOpen] = useState(false) // details drawer
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const [error, setError] = useState(null)
  const [creatingCat, setCreatingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const inputRef = useRef(null)
  const fileRef = useRef(null)

  const isProject = item.category === 'Projects'
  const isTask = isTaskItem(item)
  const attachments = item.attachments || []
  const tag = scheduleTag(item.dueAt, item.hasTime, item.recurrence)

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  const startEdit = () => {
    setDraft(item.text)
    setEditing(true)
  }
  const commit = () => {
    const next = draft.trim()
    if (next && next !== item.text) onEditText(item.id, next)
    setEditing(false)
  }
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      setEditing(false)
    }
  }

  const handleCatChange = (e) => {
    const v = e.target.value
    if (v === '__new__') {
      setNewCatName('')
      setCreatingCat(true)
      return
    }
    onChangeCategory(item.id, v, item.project)
  }
  const submitNewCat = () => {
    const c = normalizeCategory(newCatName)
    if (c) onChangeCategory(item.id, c, item.project)
    setCreatingCat(false)
    setNewCatName('')
  }

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setError(null)
    try {
      const prepared = []
      for (const file of files) {
        try {
          prepared.push(await prepareFile(file))
        } catch (err) {
          setError(err.message || `Couldn't add ${file.name}.`)
        }
      }
      if (prepared.length) await onAttach(item.id, prepared)
    } finally {
      /* no-op */
    }
  }

  const onDateChange = (e) => {
    const v = e.target.value
    if (!v) {
      onSchedule(item.id, { dueAt: null, hasTime: false, recurrence: null })
      return
    }
    const ms = new Date(v).getTime()
    onSchedule(item.id, { dueAt: ms, hasTime: true, recurrence: item.recurrence || null })
  }
  const onRecurrenceChange = (e) => {
    const rec = e.target.value || null
    onSchedule(item.id, { dueAt: item.dueAt, hasTime: item.hasTime, recurrence: rec })
  }
  const clearDate = () =>
    onSchedule(item.id, { dueAt: null, hasTime: false, recurrence: null })

  return (
    <li className={`row ${item.done ? 'done' : ''} ${isTask ? 'is-task' : 'is-note'} ${open ? 'open' : ''}`}>
      <div className="row-line">
        <div className="row-lead">
          {isTask ? (
            <input
              type="checkbox"
              className="row-check"
              checked={!!item.done}
              onChange={(e) => onToggleDone(item.id, e.target.checked)}
              aria-label="Mark done"
            />
          ) : (
            <span className="row-dot" style={{ background: colorFor(item.category) }} aria-hidden="true" />
          )}
        </div>

        <div className="row-main">
          {editing ? (
            <textarea
              ref={inputRef}
              className="edit-input"
              value={draft}
              rows={2}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
            />
          ) : (
            <div className="row-text" onDoubleClick={startEdit}>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer">{item.text || item.url}</a>
              ) : (
                <span>{item.text}</span>
              )}
            </div>
          )}

          {item.context && !editing && <div className="row-context">{item.context}</div>}

          {attachments.length > 0 && (
            <div className="attachments">
              {attachments.map((att) => (
                <div className="attachment" key={att.fileId}>
                  <button className="attachment-open" onClick={() => onOpenFile(item, att)} title={`Open ${att.name}`}>
                    {att.thumb ? (
                      <img src={att.thumb} alt="" className="attachment-thumb" />
                    ) : (
                      <span className="attachment-file"><span aria-hidden="true">📄</span> {att.name}</span>
                    )}
                  </button>
                  <button className="attachment-x" onClick={() => onRemoveAttachment(item.id, att)} aria-label={`Remove ${att.name}`} title="Remove">✕</button>
                </div>
              ))}
            </div>
          )}

          {item.suggestedCategory && (
            <div className="suggest">
              <span className="suggest-text">✨ New category — file under <strong>{item.suggestedCategory}</strong>?</span>
              <span className="suggest-actions">
                <button className="suggest-yes" onClick={() => onApproveCategory(item.id, item.suggestedCategory)}>Yes</button>
                <button className="suggest-no" onClick={() => onDismissSuggestion(item.id)}>No</button>
              </span>
            </div>
          )}

          {error && <p className="error small">{error}</p>}
        </div>

        <div className="row-meta">
          {item.recurrence && <span className="recur-ico" title="Repeats">↻</span>}
          {tag && (
            <span className={`time-tag ${item.dueAt && item.dueAt < Date.now() && !item.done && !item.recurrence ? 'overdue' : ''}`}>{tag}</span>
          )}
          {item.classification?.tier === 'llm' && (
            <span className="ai-tag" title={item.classification?.reason || ''}>✨</span>
          )}
          <button
            className={`cat-chip chip-${item.category.toLowerCase()}`}
            style={{ '--cat': colorFor(item.category) }}
            onClick={() => setOpen((v) => !v)}
            title="Edit category & schedule"
          >
            {item.category}
          </button>
        </div>

        <div className="row-actions">
          <button className="icon-btn" onClick={startEdit} title="Edit" aria-label="Edit">✎</button>
          <button className="icon-btn" onClick={() => fileRef.current?.click()} title="Attach" aria-label="Attach">📎</button>
          <button className="icon-btn" onClick={() => setOpen((v) => !v)} title="Details" aria-label="Details">⋯</button>
          <button className="icon-btn danger" onClick={() => onDelete(item.id, attachments)} title="Delete" aria-label="Delete">✕</button>
          <input ref={fileRef} type="file" accept="image/*,application/pdf,.pdf,.doc,.docx,.txt" multiple hidden onChange={onPickFiles} />
        </div>
      </div>

      {open && (
        <div className="row-drawer">
          <div className="drawer-field">
            <label>Category</label>
            {creatingCat ? (
              <div className="newcat">
                <input className="newcat-input" autoFocus value={newCatName} placeholder="New category name"
                  onChange={(e) => setNewCatName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') { e.preventDefault(); submitNewCat() }
                    else if (e.key === 'Escape') setCreatingCat(false)
                  }} />
                <button className="newcat-add" onClick={submitNewCat}>Add</button>
                <button className="newcat-cancel" onClick={() => setCreatingCat(false)} aria-label="Cancel">✕</button>
              </div>
            ) : (
              <select className="drawer-select" value={item.category} onChange={handleCatChange}>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
                <option disabled>──────────</option>
                <option value="__new__">+ New category…</option>
              </select>
            )}
          </div>

          <div className="drawer-field">
            <label>When</label>
            <div className="drawer-when">
              <input type="datetime-local" className="drawer-select" value={toLocalInput(item.dueAt)} onChange={onDateChange} />
              {item.dueAt && (
                <button className="link small" onClick={clearDate}>Clear</button>
              )}
            </div>
          </div>

          <div className="drawer-field">
            <label>Repeat</label>
            <select className="drawer-select" value={item.recurrence || ''} onChange={onRecurrenceChange} disabled={!item.dueAt}>
              {RECURRENCE_OPTS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>

          {isProject && (
            <div className="drawer-field full">
              <ProjectFields project={item.project} onSave={(fields) => onSaveProject(item.id, fields)} />
            </div>
          )}
        </div>
      )}
    </li>
  )
}
