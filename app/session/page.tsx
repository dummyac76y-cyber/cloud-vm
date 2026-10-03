'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Mode = 'password' | 'cookies';

export default function SessionPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>('password');
  const [userid, setUserid] = useState('');
  const [password, setPassword] = useState('');
  const [pasted, setPasted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch('/api/session', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(
          mode === 'password' ? { mode, userid, password } : { mode, cookies: pasted },
        ),
      });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? 'Could not sign in.');
        return;
      }
      router.push('/');
      router.refresh();
    } catch {
      setError('Network error. Is the server running?');
    } finally {
      setBusy(false);
    }
  }

  async function signOut() {
    await fetch('/api/session', { method: 'DELETE' });
    router.push('/');
    router.refresh();
  }

  return (
    <main>
      <h1>Connect your eLMS account</h1>

      <div className="hint">
        <strong>Most STI student accounts can only sign in through Microsoft Entra ID</strong>, which needs
        a real browser. If the password form is rejected, use the paste-cookies option: sign in at{' '}
        <code>elms.sti.edu</code>, open DevTools &rarr; Application &rarr; Cookies, and copy the grid rows
        below.
      </div>

      <div className="card">
        <div className="tabs">
          <button className="ghost" onClick={() => setMode('password')} disabled={mode === 'password'}>
            Password
          </button>
          <button className="ghost" onClick={() => setMode('cookies')} disabled={mode === 'cookies'}>
            Paste cookies
          </button>
        </div>

        <form onSubmit={submit}>
          {mode === 'password' ? (
            <>
              <label htmlFor="userid">Office365 username</label>
              <input
                id="userid"
                name="userid"
                value={userid}
                onChange={(e) => setUserid(e.target.value)}
                autoComplete="username"
                placeholder="delacruz.873612@campus.edu.ph"
              />
              <label htmlFor="password">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </>
          ) : (
            <>
              <label htmlFor="pasted">Cookies</label>
              <textarea
                id="pasted"
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="lms_session_v1=...  (or paste the whole DevTools grid)"
                spellCheck={false}
              />
              <p className="muted">
                Paste the raw grid straight from DevTools if you like. Anything not belonging to{' '}
                <code>elms.sti.edu</code> is discarded server-side, so Google and Microsoft cookies are never
                stored. <code>lms_session_v1</code> is the cookie that matters.
              </p>
            </>
          )}

          {error && <div className="error">{error}</div>}

          <button disabled={busy}>{busy ? 'Signing in…' : 'Connect'}</button>
        </form>
      </div>

      <button className="ghost" onClick={signOut}>
        Sign out
      </button>
    </main>
  );
}