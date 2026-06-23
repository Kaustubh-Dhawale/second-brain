// Shown when Firebase config is missing. Walks through the one-time manual
// setup you have to do yourself (it needs your Google login).
export default function SetupScreen() {
  return (
    <div className="screen center">
      <div className="card setup">
        <div className="brand-stack">
          <span className="logo lg" aria-hidden="true">b</span>
          <h1>Second Brain</h1>
        </div>
        <p className="muted">
          Almost there. This app needs a Firebase project to sign you in and sync
          across your devices. This is a one-time manual step (it requires your
          Google login).
        </p>
        <ol className="steps">
          <li>
            Go to <code>console.firebase.google.com</code> and create a project
            (Spark / free tier is enough).
          </li>
          <li>
            In <strong>Build → Firestore Database</strong>, click{' '}
            <strong>Create database</strong> (production mode).
          </li>
          <li>
            In <strong>Build → Authentication → Sign-in method</strong>, enable{' '}
            <strong>Email/Password</strong>.
          </li>
          <li>
            In <strong>Project settings → General → Your apps</strong>, add a{' '}
            <strong>Web app</strong> and copy the config values.
          </li>
          <li>
            In this project, copy <code>.env.example</code> to <code>.env</code>{' '}
            and paste the values, then restart <code>npm run dev</code>.
          </li>
        </ol>
        <p className="muted small">
          Full walkthrough is in <code>README.md</code>.
        </p>
      </div>
    </div>
  )
}
