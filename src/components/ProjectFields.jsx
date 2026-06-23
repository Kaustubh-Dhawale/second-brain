import { useEffect, useState } from 'react'

const DIFFICULTIES = ['', 'Easy', 'Medium', 'Hard']

// Structured fields for Projects items — mirrors the old Notion idea pages:
// difficulty, problem solved, target date. Saves on blur.
export default function ProjectFields({ project, onSave }) {
  const [difficulty, setDifficulty] = useState(project?.difficulty || '')
  const [problemSolved, setProblemSolved] = useState(project?.problemSolved || '')
  const [targetDate, setTargetDate] = useState(project?.targetDate || '')

  // Keep local state in sync if the item updates from elsewhere (e.g. sync).
  useEffect(() => {
    setDifficulty(project?.difficulty || '')
    setProblemSolved(project?.problemSolved || '')
    setTargetDate(project?.targetDate || '')
  }, [project?.difficulty, project?.problemSolved, project?.targetDate])

  const save = () => onSave({ difficulty, problemSolved, targetDate })

  return (
    <div className="project-fields">
      <label>
        Difficulty
        <select
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value)}
          onBlur={save}
        >
          {DIFFICULTIES.map((d) => (
            <option key={d} value={d}>
              {d || '—'}
            </option>
          ))}
        </select>
      </label>

      <label>
        Target date
        <input
          type="date"
          value={targetDate}
          onChange={(e) => setTargetDate(e.target.value)}
          onBlur={save}
        />
      </label>

      <label className="full">
        Problem it solves
        <textarea
          rows={2}
          value={problemSolved}
          onChange={(e) => setProblemSolved(e.target.value)}
          onBlur={save}
          placeholder="What problem does this idea solve?"
        />
      </label>
    </div>
  )
}
