import { useEffect, useRef, useState } from 'react'
import { classifyByRules } from '../classifier/rulesTier.js'
import { isAiAvailable } from '../ai.js'
import { extractUrl } from '../data/store.js'
import { prepareFile, humanSize } from '../files.js'

// The single capture point. Type/paste anything, attach files, hit Enter (or
// the button), and it's auto-filed. Shows a live (rules-only) prediction.
export default function CaptureBar({ onCapture, autoFocus }) {
  const [text, setText] = useState('')
  const [prediction, setPrediction] = useState(null)
  const [pending, setPending] = useState([]) // prepared attachments
  const [preparing, setPreparing] = useState(false)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const taRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (autoFocus && taRef.current) taRef.current.focus()
  }, [autoFocus])

  // Live preview using ONLY the offline rules — instant, free, no AI call.
  useEffect(() => {
    const trimmed = text.trim()
    if (!trimmed) {
      setPrediction(null)
      return
    }
    const url = extractUrl(trimmed)
    setPrediction(classifyByRules({ text: trimmed, url }))
  }, [text])

  const aiWillSort = isAiAvailable && prediction && prediction.confidence < 0.5

  const onPickFiles = async (e) => {
    const files = Array.from(e.target.files || [])
    e.target.value = '' // allow re-picking the same file
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
      await onCapture(text.trim(), pending)
      setText('')
      setPending([])
      setPrediction(null)
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
    <div className="capture">
      <textarea
        ref={taRef}
        className="capture-input"
        placeholder="Capture anything… a task, a link, an idea, or attach a file"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        rows={2}
      />

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
              <button className="pending-x" onClick={() => removePending(i)} aria-label="Remove">
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {error && <p className="error small">{error}</p>}

      <div className="capture-row">
        <div className="capture-left">
          <button
            className="attach-btn"
            onClick={() => fileRef.current?.click()}
            title="Attach a file or photo"
            aria-label="Attach a file or photo"
            disabled={preparing}
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
          <span className="prediction">
            {preparing ? (
              <span className="muted small">Preparing file…</span>
            ) : prediction ? (
              aiWillSort ? (
                <span className="muted small">✨ AI will sort this when you save</span>
              ) : (
                <>
                  → <strong>{prediction.category}</strong>
                  <span className="muted small"> · {prediction.reason}</span>
                </>
              )
            ) : pending.length ? (
              <span className="muted small">✨ AI will file this when you save</span>
            ) : (
              <span className="muted small">Enter to save · 📎 to attach</span>
            )}
          </span>
        </div>
        <button className="primary" onClick={save} disabled={!canSave}>
          {busy ? '…' : 'Capture'}
        </button>
      </div>
    </div>
  )
}
