import { useEffect, useRef, useState } from 'react'
import { CATEGORIES, colorFor, normalizeCategory } from '../categories.js'
import { prepareFile, humanSize } from '../files.js'
import ProjectFields from './ProjectFields.jsx'

// A single captured item: done toggle, text/link, AI context, attachments,
// category chip, suggestion prompt, inline edit, attach, delete, project fields.
export default function ItemCard({
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
}) {
  const [expanded, setExpanded] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.text)
  const [error, setError] = useState(null)
  const [attaching, setAttaching] = useState(false)
  const [creatingCat, setCreatingCat] = useState(false)
  const [newCatName, setNewCatName] = useState('')
  const inputRef = useRef(null)
  const fileRef = useRef(null)
  const isProject = item.category === 'Projects'
  const attachments = item.attachments || []

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
    setAttaching(true)
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
      setAttaching(false)
    }
  }

  return (
    <li className={`item ${item.done ? 'done' : ''}`}>
      <div className="item-main">
        <input
          type="checkbox"
          className="check"
          checked={!!item.done}
          onChange={(e) => onToggleDone(item.id, e.target.checked)}
          aria-label="Mark done"
        />

        <div className="item-body">
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
            <div className="item-text" onDoubleClick={startEdit}>
              {item.url ? (
                <a href={item.url} target="_blank" rel="noopener noreferrer">
                  {item.text || item.url}
                </a>
              ) : (
                <span>{item.text}</span>
              )}
            </div>
          )}

          {item.context && !editing && (
            <div className="context">{item.context}</div>
          )}

          {attachments.length > 0 && (
            <div className="attachments">
              {attachments.map((att) => (
                <div className="attachment" key={att.fileId}>
                  <button
                    className="attachment-open"
                    onClick={() => onOpenFile(item, att)}
                    title={`Open ${att.name}`}
                  >
                    {att.thumb ? (
                      <img src={att.thumb} alt="" className="attachment-thumb" />
                    ) : (
                      <span className="attachment-file">
                        <span aria-hidden="true">📄</span> {att.name}
                      </span>
                    )}
                  </button>
                  <button
                    className="attachment-x"
                    onClick={() => onRemoveAttachment(item.id, att)}
                    aria-label={`Remove ${att.name}`}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {error && <p className="error small">{error}</p>}

          <div className="item-meta">
            <select
              className="chip"
              style={{ '--cat': colorFor(item.category) }}
              value={item.category}
              onChange={handleCatChange}
              title={
                item.classification?.auto
                  ? `Auto-filed (${item.classification?.reason || ''})`
                  : 'Set manually'
              }
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option disabled>──────────</option>
              <option value="__new__">+ New category…</option>
            </select>

            {item.classification?.tier === 'llm' && (
              <span className="ai-tag" title={item.classification?.reason || ''}>
                ✨ AI
              </span>
            )}
            {item.classification?.auto === false && (
              <span className="muted small">manual</span>
            )}

            {isProject && (
              <button className="link small" onClick={() => setExpanded((v) => !v)}>
                {expanded ? 'Hide details' : 'Details'}
              </button>
            )}
          </div>

          {creatingCat && (
            <div className="newcat">
              <input
                className="newcat-input"
                autoFocus
                value={newCatName}
                placeholder="New category name"
                onChange={(e) => setNewCatName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitNewCat()
                  } else if (e.key === 'Escape') {
                    setCreatingCat(false)
                  }
                }}
              />
              <button className="newcat-add" onClick={submitNewCat}>Add</button>
              <button
                className="newcat-cancel"
                onClick={() => setCreatingCat(false)}
                aria-label="Cancel"
              >
                ✕
              </button>
            </div>
          )}

          {item.suggestedCategory && (
            <div className="suggest">
              <span className="suggest-text">
                ✨ New category — file under{' '}
                <strong>{item.suggestedCategory}</strong>?
              </span>
              <span className="suggest-actions">
                <button
                  className="suggest-yes"
                  onClick={() => onApproveCategory(item.id, item.suggestedCategory)}
                >
                  Yes
                </button>
                <button
                  className="suggest-no"
                  onClick={() => onDismissSuggestion(item.id)}
                >
                  No
                </button>
              </span>
            </div>
          )}

          {isProject && expanded && (
            <ProjectFields
              project={item.project}
              onSave={(fields) => onSaveProject(item.id, fields)}
            />
          )}
        </div>

        <div className="item-actions">
          <button
            className="icon-btn"
            onClick={() => fileRef.current?.click()}
            aria-label="Attach file"
            title="Attach file"
            disabled={attaching}
          >
            📎
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*,application/pdf,.pdf,.doc,.docx,.txt"
            multiple
            hidden
            onChange={onPickFiles}
          />
          <button className="icon-btn" onClick={startEdit} aria-label="Edit" title="Edit">
            ✎
          </button>
          <button
            className="icon-btn danger"
            onClick={() => onDelete(item.id, attachments)}
            aria-label="Delete"
            title="Delete"
          >
            ✕
          </button>
        </div>
      </div>
    </li>
  )
}
