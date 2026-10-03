import './globals.css';
import Link from 'next/link';
import { gateEnabled, isUnlocked } from '@/lib/auth';

export const metadata = {
  title: 'STI eLMS',
  description: 'Personal read-only dashboard for elms.sti.edu',
};

export const dynamic = 'force-dynamic';

function Unlock() {
  return (
    <main>
      <h1>This instance is locked</h1>
      <div className="card">
        <p className="muted">
          Set <code>APP_PASSWORD</code> on the deployment, then enter it below. This keeps other people
          from using your copy of the app.
        </p>
        <form action="/api/gate" method="post">
          <label htmlFor="gate">App password</label>
          <input id="gate" name="password" type="password" autoComplete="current-password" required />
          <button type="submit">Unlock</button>
        </form>
      </div>
    </main>
  );
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const locked = gateEnabled() && !(await isUnlocked());

  return (
    <html lang="en">
      <body>
        {!locked && (
          <header>
            <Link href="/">STI eLMS</Link>
            <nav>
              <Link href="/session">Session</Link>
              <Link href="/api/raw?path=/courses">DOM inspector</Link>
            </nav>
          </header>
        )}
        {locked ? <Unlock /> : children}
      </body>
    </html>
  );
}