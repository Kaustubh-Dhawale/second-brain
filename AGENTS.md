# Working on Second Brain — AI handoff guide

This is a personal "second brain" note-capture app. The owner is **not a developer** — explain in plain language and give exact, copy-pasteable commands. Anything that needs the owner's Google or GitHub login must be done by the owner.

## What it is
An offline-capable PWA. The owner captures notes, links, and files in one box; they're auto-filed into categories.

## Where it lives
- **Code:** this repo, `Kaustubh-Dhawale/second-brain` (private). Edit from any device via a GitHub Codespace (Code button → Codespaces → Create codespace on main).
- **Live app:** https://nd-brain-5b93f.web.app (Firebase Hosting).

## Stack
- React + Vite, with `vite-plugin-pwa` (installable, offline app shell).
- Firebase, project id `nd-brain-5b93f`, **free Spark plan — keep it free, no billing**:
  - Firestore (data), Authentication (email/password), Hosting, and Firebase AI Logic + Gemini (`gemini-2.5-flash`) for smart filing.

## Architecture — key files
- `src/data/store.js` — chooses the backend: Firestore in the cloud (signed in), or IndexedDB (`localStore.js`) in local mode when Firebase isn't configured. The UI only ever imports from `store.js`.
- `src/data/items.js` — Firestore data layer. Notes live at `users/{uid}/items`; attached file bytes at `users/{uid}/items/{id}/files`.
- `src/classifier/` — fast offline keyword rules. Runs synchronously on capture so filing is instant.
- `src/ai.js` — Gemini enrichment, runs in the background after capture. Reads links (via the URL-context tool) and long text to add a one-line `context`, pick the best existing category, and suggest brand-new categories. Never blocks capture.
- `src/categories.js` — categories are **dynamic**: built-ins (Inbox, Work, Personal, Fitness, Projects, Reference, Errands) plus any AI- or user-created ones. `colorFor()` assigns colors.
- `src/components/` — UI (CaptureBar, CategoryTabs, ItemCard, ProjectFields, etc.). `src/index.css` — warm theme with automatic light/dark.

## Data & limits
- Attachments (PDFs/images) are stored as compressed base64 **inside Firestore**, ~1 MB per file max. Images are auto-compressed; larger files are rejected. (Firebase Cloud Storage needs the paid Blaze plan, which is intentionally avoided.)
- `.env` holds the Firebase **web** config and is committed on purpose — it is NOT secret (it ships in the public app bundle, and the repo is private). Never commit service-account keys or tokens.
- `firestore.rules` locks every note and file to its owner.

## Run / ship
```
npm install
npm run dev      # local preview
npm run build    # production build (always run before deploying)
npm run deploy   # build + deploy to Firebase Hosting (run `firebase login` once first)
```
Auto-deploy: `.github/workflows/deploy.yml` deploys on every push to `main` once the `FIREBASE_SERVICE_ACCOUNT` repo secret is set (create it with `firebase init hosting:github`).

## How to work here
- Keep the project on the free plan (no billing).
- Keep capture instant: rules classify synchronously, AI enrichment runs in the background.
- Run `npm run build` to confirm changes compile before deploying.
- Explain what you changed in plain terms, and flag anything that needs the owner's login.
