# Working on Second Brain from GitHub (any device, nothing local)

This project lives in a **private GitHub repo**. The live app is hosted on
Firebase (`https://nd-brain-5b93f.web.app`). You can edit and ship from any
device's browser — no local setup.

## First-time push (one time only)

The code was committed for you locally. To send it to GitHub, run these once in
the project folder on the Mac (replace the URL with your repo's URL):

```bash
git remote add origin https://github.com/<your-username>/second-brain.git
git branch -M main
git push -u origin main
```

After this succeeds, you can delete the local folder — everything lives on
GitHub + Firebase now.

## Editing from any device (GitHub Codespaces)

1. On GitHub, open the repo → green **Code** button → **Codespaces** →
   **Create codespace on main**. This opens VS Code in your browser.
2. In the Codespace terminal, the first time:
   ```bash
   npm install
   ```
3. To preview while editing: `npm run dev` (Codespaces gives you a forwarded URL).
4. To publish your changes to the live site: `npm run deploy`
   (run `firebase login` once first; it opens a browser auth flow).

Edit files, then commit from the Codespace's Source Control panel. Done from
phone, tablet, or any computer.

## Optional: auto-deploy on every commit

A workflow is already included at `.github/workflows/deploy.yml`. To turn it on,
add the Firebase deploy credential as a repo secret. Easiest way — run once from
a Codespace or the Mac:

```bash
npm install -g firebase-tools   # if not already
firebase init hosting:github
```

When it asks, point it at this repo. It creates a service account and stores the
`FIREBASE_SERVICE_ACCOUNT` secret in GitHub automatically. After that, every
`git push` to `main` deploys the live site by itself — no commands needed.

## Notes

- `.env` holds only the Firebase **web** config (safe to commit; not a secret —
  it already ships in the public app, and the repo is private).
- Never commit service-account JSON keys or tokens — those belong in GitHub
  Secrets only.
