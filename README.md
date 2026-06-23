# 🧠 Second Brain

A local-first, offline-capable note-capture PWA. One capture point that
auto-files everything into **Work, Personal, Fitness, Projects, Reference,
Errands** (with an **Inbox** for anything uncertain). Built with React + Vite,
backed by Firebase Firestore with offline persistence, and locked to your own
account with Firebase Auth.

Works in any browser (so it runs on the work Windows PC with no install),
installs as an app on the MacBook and iPhone, and keeps working with no signal —
captures save to a local IndexedDB-backed cache and sync when you reconnect.

## Two modes (the important bit)

The app runs in one of two modes automatically, depending on whether you've
added Firebase config:

- **Local mode (default, zero setup).** With no Firebase config, the app stores
  everything in this browser's IndexedDB and just works — no account, no
  sign-in, no internet needed. Perfect for trying it immediately or using it on
  a single device. Notes live only on that device.
- **Cloud mode (optional upgrade).** Add your Firebase config (steps below) and
  the app switches to Firestore: you sign in, your data is locked to your
  account, and it syncs across your PC, Mac, and iPhone — still fully
  offline-capable.

You don't change any code to switch — just add the config file and restart.
**To simply use it now, skip to "Run it" and ignore the Firebase steps.**

---

## How it works (architecture)

- **Store:** Firestore with `persistentLocalCache` (IndexedDB under the hood).
  Every read/write hits the local cache first and syncs to the cloud
  automatically. This is the offline-first behaviour, and the reason Firebase
  was chosen.
- **Auth:** Firebase Email/Password. All data lives under
  `users/{your-uid}/items` and the security rules forbid anyone else from
  reading it.
- **Auto-filing:** one swappable classifier (`src/classifier/`). Today only the
  offline **rules tier** runs (URL patterns + keywords). A disabled **LLM tier**
  stub is wired behind the same interface — enable it later without touching the
  rest of the app (see below).
- **Projects** items get extra structured fields (difficulty, problem solved,
  target date), mirroring the old Notion idea pages.
- **PWA:** installable, offline app shell via `vite-plugin-pwa`. Home-screen
  shortcuts jump straight to Errands / Inbox / Quick Capture.

```
src/
  firebase.js            Firebase init + offline persistence + config guard
  categories.js          The fixed category set
  auth.js                Email/password wrappers + friendly error messages
  data/items.js          All Firestore reads/writes (the only data entry point)
  classifier/
    index.js             Public classify() — runs tiers in order
    rulesTier.js         Offline rules (active)
    llmTier.js           Future LLM tier (disabled stub)
  hooks/                 useAuth, useItems
  components/            CaptureBar, CategoryTabs, ItemList, ItemCard,
                         ProjectFields, SyncStatus, AuthScreen, SetupScreen
```

---

## Optional: turn on cloud sync (needs your Google login)

Skip this entirely if you just want to use the app on one device. Do it when you
want your notes to sync across the work PC, MacBook, and iPhone.

1. **Create the Firebase project.** Go to
   [console.firebase.google.com](https://console.firebase.google.com) →
   **Add project**. The free **Spark** tier is plenty for solo use. (A Google
   subscription does *not* connect to Firebase billing — Firebase bills
   separately, and Spark stays free here.)
2. **Enable Firestore.** Build → **Firestore Database** → **Create database** →
   start in **production mode** (the security rules in this repo lock it down).
3. **Enable Email/Password auth.** Build → **Authentication** → **Get started**
   → **Sign-in method** → enable **Email/Password**.
4. **Register a Web app.** Project settings (gear icon) → **General** → *Your
   apps* → **Web** (`</>`). Copy the `firebaseConfig` values.
5. **Add your config locally.** Copy `.env.example` to `.env` and paste the
   values:

   ```bash
   cp .env.example .env
   # then edit .env
   ```

---

## Run it (on the MacBook)

Requires Node.js 18+.

```bash
npm install
npm run dev          # local dev at http://localhost:5173
npm run host         # same, but reachable from your iPhone on the same Wi-Fi
```

In local mode it opens straight to the app — start capturing right away. In
cloud mode, create your account on the sign-in screen the first time.

---

## Deploy (Firebase Hosting, free tier)

```bash
npm install -g firebase-tools     # one time
firebase login                    # one time
```

Set your project id in `.firebaserc` (replace the placeholder), then:

```bash
firebase deploy --only firestore:rules   # push the security rules (do this once)
npm run deploy                            # builds + deploys hosting
```

This gives you a URL like `https://<project-id>.web.app`. Open that on the
work PC (browser only — nothing to install) and on the iPhone, then **Add to
Home Screen** to install the PWA.

Later, to use your own domain: Hosting → **Add custom domain** →
`brain.kaustubhdhawale.com` and follow the DNS steps.

---

## Using it

- **Capture:** type or paste anything in the box and press **Enter**
  (Shift+Enter for a newline). The predicted category shows live before you
  save. Paste a link and it auto-detects the URL.
- **Re-file:** every item has a category dropdown — change it and it's marked
  "manual" so the classifier won't override your choice.
- **Projects:** open **Details** on a Projects item to set difficulty, the
  problem it solves, and a target date.
- **Done:** tick the checkbox; completed items collapse into a "Done" group.

---

## Auto-filing rules (current offline tier)

| Signal | Goes to |
|---|---|
| YouTube/Vimeo/`video`/`watch` URLs | Reference |
| `.pdf`, Google Docs, arxiv, `/paper` | Reference |
| Text mentions video / pdf | Reference |
| `call`, `buy`, `pick up`, `email`, `remind`, `book`, `pay`, `return`… | Errands |
| `idea`, `concept`, `what if` | Projects |
| nothing matched | Inbox |

Tune these in `src/classifier/rulesTier.js`.

### Enabling the LLM tier later

1. Implement `classifyByLLM()` in `src/classifier/llmTier.js` (call your model
   or a Cloud Function — keep all network code inside that file).
2. Set `USE_LLM_TIER = true` in `src/classifier/index.js`.

The rest of the app depends only on `classify()`, so nothing else changes. If
the LLM tier errors or returns low confidence, the app falls back to the rules
result automatically.

---

## Importing your old captures

See **[MIGRATION.md](./MIGRATION.md)** for the strategy to bring over Excel,
the WhatsApp self-thread, Google Tasks, and Notion. (Strategy only — importers
aren't built yet.)
