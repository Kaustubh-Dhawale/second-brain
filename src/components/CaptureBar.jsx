import { useEffect, useMemo, useRef, useState } from 'react'
import { classifyByRules } from '../classifier/rulesTier.js'
import { isAiAvailable } from '../ai.js'
import { extractUrl } from '../data/store.js'
import { prepareFile, humanSize } from '../files.js'
import { parseSchedule, stripSchedule } from '../schedule/parseDate.js'

// Escape text for safe injection into the highlight backdrop.
const esc = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

// The single capture point. Type/paste anything; as you type, a natural-language
// date ("Friday 3pm", "every weekday 9am") lights up inline and offers to file
// it onto the Agenda. No date → it just saves as a plain note. Attach files too.
export default function CaptureBar({ onCapture, autoFocus }) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState([]) // prepared attachments
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const taRef = useRef(null)
  const backdropRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (autoFocus && taRef.current) taRef.current.focus()
  }, [autoFocus])

  // Live schedule detection (offline, instant).
  const schedule = useMemo(() => parseSchedule(text), [text])

  // Live category preview for plain notes (rules only — no AI call).
  const prediction = useMemo(() => {
    const trimmed = text.trim()
    if (!trimmed) return null
    const url = extractUrl(trimmed)
    return classifyByRules({ text: trimmed, url })
  }, [text])

  const aiWillSort = isAiAvailable && prediction && prediction.confidence < 0.5

  // Highlighted backdrop HTML: wrap the detected date phrase in a <mark>.
  const backdropHtml = useMemo(() => {
    if (!schedule?.match) return esc(text)
    const { index, length } = schedule.match
    return (
      esc(text.slice(0, index)) +
      '<mark class="date-token">' +
      esc(text.slice(index, index + length)) +
      '</mark>' +
      esc(text.slice(index + length))
    )
  }, [text, schedule])

  // Keep the backdrop scroll in sync with the textarea.
  const syncScroll = () => {
    if (backdropRef.current && taRef.current) {
      backdropRef.current.scrollTop = taRef.current.scrollTop
    }
  }

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (!files.length) return
    setError(null)
    setPreparing(true)
    try {
      for (const file of files) {
        try {
          const prepared = await prepareFile(file)
          setPending((p) => [...p, prepared])
        } catch (err) {
          setError(err.message || `Couldn't add ${file.name}.`)
        }
      }
    } finally {
      setPreparing(false)
    }
  }

  const removePending = (i) => setPending((p) => p.filter((_, idx) => idx !== i))

  const canSave = (text.trim() || pending.length > 0) && !busy && !preparing

  const save = async () => {
    if (!canSave) return
    setBusy(true)
    try {
      const sched = schedule
        ? { dueAt: schedule.dueAt, hasTime: schedule.hasTime, recurrence: schedule.recurrence }
        : null
      // When a date is detected, drop the date phrase from the saved title.
      const title = schedule ? stripSchedule(text, schedule.match) : text.trim()
      await onCapture(title, pending, sched)
      setText('')
      setPending([])
      setError(null)
      taRef.current?.focus()
    } finally {
      setBusy(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      save()
    }
  }

  return (
    <div className={`capture ${schedule ? 'has-date' : ''}`}>
      <div className="capture-input-wrap">
        <div className="capture-backdrop" ref={backdropRef} aria-hidden="true"
          dangerouslySetInnerHTML={{ __html: backdropHtml + '\n' }} />
        <textarea
          ref={taRef}
          className="capture-input"
          placeholder="Capture anything… try “email Sarah the deck Friday 3pm”"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          onScroll={syncScroll}
          rows={2}
          spellCheck="false"
        />
      </div>

      {pending.length > 0 && (
        <div className="pending-files">
          {pending.map((f, i) => (
            <div className="pending-file" key={i}>
              {f.thumb ? (
                <img src={f.thumb} alt="" className="pending-thumb" />
              ) : (
                <span className="pending-icon" aria-hidden="true">📄</span>
              )}
              <span className="pending-name" title={f.name}>{f.name}</span>
              <span className="muted small">{humanSize(f.size)}</span>
              <button className="pending-x" onClick={() => removePending(i)} aria-label="Remove">✕</button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="error small">{error}</p>}

      {schedule ? (
        // --- Detection banner (inline-chip confirm) --------------------------
        <div className="detect-row">
          <span className="date-chip">
            <span className="date-chip-ico" aria-hidden="true">◷</span>
            {schedule.label}
          </span>
          <span className="detect-text">
            detected — saves to <strong>Agenda</strong>
          </span>
          <span className="detect-hint">⏎ to capture</span>
          <button className="primary capture-btn" onClick={save} disabled={!canSave}>
            {busy ? '…' : 'Capture'}
          </button>
        </div>
      ) : (
        // --- Plain note row --------------------------------------------------
        <div className="capture-row">
          <div className="capture-left">
            <button
              className="attach-btn"
              onClick={() => fileRef.current?.click()}
              title="Attach a file or photo"
              aria-label="Attach a file or photo"
              disabled={preparing}
            >📎</button>
            <span className="prediction">
              {preparing ? (
                <span className="muted small">Preparing file…</span>
              ) : prediction ? (
                aiWillSort ? (
                  <span className="muted small">✨ AI will sort this when you save</span>
                ) : (
                  <span className="muted small">→ {prediction.category}</span>
                )
              ) : pending.length ? (
                <span className="muted small">✨ AI will file this when you save</span>
              ) : (
                <span className="muted small">Add a time to schedule it · 📎 to attach</span>
              )}
            </span>
          </div>
          <button className="primary capture-btn" onClick={save} disabled={!canSave}>
            {busy ? '…' : 'Capture'}
          </button>
        </div>
      )}

      <input
        ref={fileRef}
        type="file"
        accept="image/*,application/pdf,.pdf,.doc,.docx,.txt"
        multiple
        hidden
        onChange={onPickFiles}
      />
    </div>
  )
}
