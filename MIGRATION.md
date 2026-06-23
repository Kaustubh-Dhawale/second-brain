# Migration plan — consolidating your four current tools

This is a **strategy**, not code. No importers are built yet. The goal: get the
backlog out of Excel, the WhatsApp self-thread, Google Tasks, and Notion into
Second Brain **once**, cleanly, without polluting your categories.

## Guiding principles

1. **One source at a time.** Migrate, sanity-check the result, then move to the
   next source. Don't batch all four together — you'll lose track of what landed
   where.
2. **Import into Inbox by default, then sweep.** It's faster to bulk-import
   everything to Inbox and re-file from inside the app (where re-filing is one
   dropdown) than to perfect categorization during the import.
3. **Drop the dead weight.** Most of these tools hold completed/stale items.
   Migrate only what's still live. A backlog migration is a great moment to
   declare bankruptcy on old noise.
4. **Preserve the structured stuff.** Notion ideas carry difficulty / problem /
   target date — map those into the `project` fields rather than flattening them
   into plain text.

## The shared shape

Every imported row becomes one Firestore item under `users/{uid}/items`:

```js
{
  text, url|null, category, done,
  createdAt, updatedAt,                 // millis
  classification: { auto, confidence, tier, reason },
  project: { difficulty, problemSolved, targetDate } | null
}
```

The cleanest mechanical path for any source: export it to **CSV/JSON**, write a
small one-off Node script that reads it, runs each row through the existing
`classify()` (or forces a category), and writes via the existing
`addItem()` data layer. That reuses the live auto-filing and schema instead of
hand-rolling documents.

---

## Source 1 — Excel (work tasks)

**What's there:** one task per cell, struck-through when done.

**Plan:**
- Save the sheet as CSV. Each non-empty cell → one item.
- **Strikethrough = done.** Excel cell formatting is *not* in a plain CSV, so
  either (a) clear out struck-through rows before exporting (simplest), or
  (b) export with a script that reads the `.xlsx` formatting (e.g. `openpyxl`'s
  `cell.font.strike`) and sets `done: true`.
- Force `category: 'Work'` for all of them (don't auto-classify — you already
  know these are work).
- Keep only still-open tasks unless you want a done archive.

**Effort:** low. This is the most structured source.

---

## Source 2 — WhatsApp self-thread (links, phone numbers, PDFs, LinkedIn profiles)

**What's there:** quick links, phone numbers, PDFs, LinkedIn profiles to reach
out to — mixed, chronological.

**Plan:**
- Use WhatsApp's **Export chat** (without media) → produces a `.txt` with one
  timestamped line per message. Parse line-by-line.
- Run each line through `classify()`:
  - URLs (LinkedIn, articles, videos) → mostly **Reference** automatically.
  - "call …" / phone-number messages → **Errands** (consider adding a
    phone-number regex rule to the rules tier so bare numbers file to Errands).
  - Everything ambiguous → **Inbox**, sweep later.
- **Media (PDFs):** the text export only references attachments by filename, not
  the file. Options: export *with* media and upload PDFs to Firebase Storage
  (out of current scope, Storage isn't wired up), or just capture the filename
  as text now and keep the PDFs where they are. Recommended for now: capture the
  reference text, don't migrate binaries.
- **LinkedIn profiles to reach out to** are really errands — consider a keyword
  rule (`linkedin.com/in/` → Errands) if you want those actionable rather than
  filed as Reference.

**Effort:** medium. The parsing is easy; deciding what's still relevant is the
work. Expect to drop a lot.

---

## Source 3 — Google Tasks (errands)

**What's there:** errands, viewed via an iPhone widget.

**Plan:**
- Export via **Google Takeout** (Tasks → JSON), or just retype them — there are
  usually few enough that manual recapture is faster than scripting.
- Force `category: 'Errands'`. Map Google's `status: 'completed'` → `done: true`
  (or skip completed entirely).
- Google Tasks has due dates; Errands don't have a date field in the current
  schema. Either append the date to the text (`"Renew passport (by Jul 1)"`) or
  add a `dueDate` field later if errand dates matter to you.

**Effort:** low.

---

## Source 4 — Notion (product / business / 3D-printing ideas)

**What's there:** each idea is a page with **difficulty, problem solved, target
date** — which maps exactly onto the Projects `project` fields.

**Plan:**
- Export the Notion database as **CSV** (or Markdown+CSV). Each row = one idea.
- Force `category: 'Projects'` and map columns directly:
  - Notion *Difficulty* → `project.difficulty` (normalize to Easy/Medium/Hard)
  - Notion *Problem solved* → `project.problemSolved`
  - Notion *Target date* → `project.targetDate` (ISO `YYYY-MM-DD`)
  - Page title → `text`
- Long page bodies beyond those three fields: decide whether you need them. If
  yes, append to `text` or add a `notes` field later; if not, drop them.

**Effort:** medium — the field mapping is the careful part, but it's a small,
high-value dataset.

---

## Suggested order

1. **Notion** first — small, structured, high value, validates the `project`
   field mapping.
2. **Excel** — structured, clear category.
3. **Google Tasks** — small.
4. **WhatsApp** last — messiest, most to triage; do it when the app already
   feels real so you're motivated to sweep the Inbox.

## If/when you want the importers built

Each one is a ~30–60 line Node script using the existing `addItem()` /
`classify()`. Say the word and they can be written per-source against the
exported files.
