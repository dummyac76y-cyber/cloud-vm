import * as cheerio from 'cheerio';

/**
 * Pulls in-app routes out of authenticated markup.
 *
 * The eLMS has no public API and no sitemap, so the most reliable way to learn
 * real routes is to read the navigation the app renders once you are signed in.
 * This turns that into a list you can click or promote into an env override.
 */

const APP_PREFIXES = ['/site/', '/course', '/assignment', '/announcement', '/calendar', '/user', '/grade', '/submission', '/discussion', '/enrollment'];

const normalise = (href: string): string | null => {
  const clean = href.trim();
  if (!clean.startsWith('/') || clean.startsWith('//')) return null;
  const [path] = clean.split(/[?#]/);
  if (!path || path === '/') return null;
  if (path.startsWith('/stylesheets') || path.startsWith('/images') || path.startsWith('/files') || path.startsWith('/javascript')) {
    return null;
  }
  if (!APP_PREFIXES.some((prefix) => path.startsWith(prefix))) return null;
  return path;
};

export type DiscoveredPath = { path: string; label: string; hits: number };

export function discoverPaths(html: string): DiscoveredPath[] {
  const $ = cheerio.load(html);
  const found = new Map<string, DiscoveredPath>();

  $('a[href]').each((_, el) => {
    const $el = $(el);
    const path = normalise($el.attr('href') ?? '');
    if (!path) return;

    const label = ($el.attr('title') || $el.text()).replace(/\s+/g, ' ').trim().slice(0, 80);
    const entry = found.get(path);
    if (entry) {
      entry.hits += 1;
      if (!entry.label && label) entry.label = label;
    } else {
      found.set(path, { path, label, hits: 1 });
    }
  });

  return [...found.values()].sort((a, b) => b.hits - a.hits);
}