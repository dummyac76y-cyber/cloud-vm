/**
 * Every eLMS route here needs to be confirmed against a real signed-in
 * account. What is verified so far:
 *
 *   /  -> public landing page, never requires a session
 *   /home -> the signed-in dashboard; redirects anonymous visitors to
 *            /site/not_logged_in?from=%2Fhome&log_in_required=true
 *
 * The remaining paths are best guesses and can be overridden per deployment
 * without a code change, once you have confirmed them via /api/raw.
 */
export const PATHS = {
  dashboard: process.env.STI_DASHBOARD_PATH ?? '/home',
  courses: process.env.STI_COURSES_PATH ?? '/courses',
  assignments: process.env.STI_ASSIGNMENTS_PATH ?? '/assignments',
  announcements: process.env.STI_ANNOUNCEMENTS_PATH ?? '/announcements',
} as const;

export function pathsSummary(): Record<string, string> {
  return { ...PATHS };
}