import Link from 'next/link';
import { loadJar } from '@/lib/session';
import { page, StiNotFound, StiSessionExpired } from '@/lib/sti';
import { PATHS } from '@/lib/paths';
import { discoverPaths, type DiscoveredPath } from '@/lib/discover';
import { parseCourses, type Course } from '@/lib/parse';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const jar = await loadJar();

  if (!jar) {
    return (
      <main>
        <h1>Not connected</h1>
        <div className="card">
          <p className="muted">Connect your STI eLMS account to load your courses.</p>
          <Link href="/session">
            <button>Connect account</button>
          </Link>
        </div>
      </main>
    );
  }

  let courses: Course[] = [];
  let routes: DiscoveredPath[] = [];
  let error: string | null = null;
  let notice: string | null = null;

  try {
    // The dashboard is the one page known to require a session, so it doubles
    // as the auth check and as the source of real in-app routes.
    const dash = await page(jar, PATHS.dashboard);
    routes = discoverPaths(dash.html).slice(0, 24);
    courses = parseCourses(dash.html);

    if (courses.length === 0) {
      const list = await page(jar, PATHS.courses);
      courses = parseCourses(list.html);

      if (courses.length === 0) {
        notice = `No course links found at ${PATHS.courses}. Confirm the real route below, then set STI_COURSES_PATH.`;
      }
    }
  } catch (err) {
    if (err instanceof StiSessionExpired) {
      error = err.message;
    } else if (err instanceof StiNotFound) {
      notice = `${PATHS.courses} does not exist on this eLMS. Pick the right route below, then set STI_COURSES_PATH.`;
    } else {
      error = 'Could not load the eLMS. Check the DOM inspector to see what came back.';
    }
  }

  return (
    <main>
      <div className="row">
        <h1>My courses</h1>
        <Link href="/session">
          <button className="ghost">Session</button>
        </Link>
      </div>

      {error && (
        <div className="error">
          {error} <Link href="/session">Reconnect</Link>
        </div>
      )}
      {notice && <div className="hint">{notice}</div>}

      <div className="grid">
        {courses.map((course) => (
          <div className="card" key={course.id}>
            <strong>{course.title}</strong>
            <div className="muted">course id {course.id}</div>
            <Link href={`/api/courses/${course.id}`}>
              <button className="ghost">Assignments JSON</button>
            </Link>
          </div>
        ))}
      </div>

      {routes.length > 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <h2>Routes found in your session</h2>
          <p className="muted">
            The eLMS has no API or sitemap, so these were read from your navigation. Confirm one via the{' '}
            <Link href={`/api/raw?path=${encodeURIComponent(PATHS.dashboard)}`}>DOM inspector</Link> before
            trusting the parsers.
          </p>
          <ul className="plain">
            {routes.map((route) => (
              <li key={route.path}>
                <code>{route.path}</code>
                {route.label ? ` — ${route.label}` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </main>
  );
}