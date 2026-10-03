import * as cheerio from 'cheerio';

const clean = (s?: string | null): string => (s ?? '').replace(/\s+/g, ' ').trim();

export type Course = { id: string; title: string; href: string };
export type Assignment = { id: string; title: string; due: string; href: string };

/**
 * The eLMS renders server-side HTML with no public JSON API, so these selectors
 * are the fragile part of the app. Verify each one against the real markup via
 * /api/raw?path=... and adjust here when STI upgrades.
 */

export function parseCourses(html: string): Course[] {
  const $ = cheerio.load(html);
  const found = new Map<string, Course>();

  $('a[href*="/course"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') ?? '';
    const id = /\/courses?\/(\d+)/.exec(href)?.[1];
    if (!id || found.has(id)) return;

    const title =
      clean($el.attr('title')) ||
      clean($el.find('.course-title, .card-title, h3, h4, .name').first().text()) ||
      clean($el.text());
    if (!title || /^(course|courses|subject|subjects)$/i.test(title)) return;

    found.set(id, { id, title, href });
  });

  return [...found.values()];
}

export function parseAssignments(html: string): Assignment[] {
  const $ = cheerio.load(html);
  const found = new Map<string, Assignment>();

  $('a[href*="/assignment"], a[href*="/submission"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') ?? '';
    const id = /(?:assignment|submission)s?\/(\d+)/.exec(href)?.[1];
    if (!id || found.has(id)) return;

    const title =
      clean($el.attr('title')) ||
      clean($el.find('.assignment-title, .title, h3, h4').first().text()) ||
      clean($el.text());
    if (!title) return;

    found.set(id, { id, title, due: clean($el.attr('data-due-at') || $el.attr('data-missing-submission')), href });
  });

  return [...found.values()];
}

export type Notice = { title: string; href: string; date: string };

export function parseAnnouncements(html: string): Notice[] {
  const $ = cheerio.load(html);
  const found = new Map<string, Notice>();

  $('a[href*="/announcement"], a[href*="/discussion"]').each((_, el) => {
    const $el = $(el);
    const href = $el.attr('href') ?? '';
    const key = href || clean($el.text());
    if (found.has(key)) return;

    const title = clean($el.attr('title')) || clean($el.find('.title, h3, h4').first().text()) || clean($el.text());
    if (!title) return;

    found.set(key, { title, href, date: clean($el.attr('data-posted-at') || $el.closest('li, tr').find('time').first().attr('datetime')) });
  });

  return [...found.values()].slice(0, 25);
}

/** Lists likely-grade rows without assuming STI's internal markup. */
export function parseGrades(html: string): { label: string; value: string }[] {
  const $ = cheerio.load(html);
  const rows: { label: string; value: string }[] = [];

  $('tr').each((_, el) => {
    const cells = $(el).find('td').map((__, td) => clean($(td).text())).get();
    if (cells.length < 2) return;
    const looksNumeric = cells.some((c) => /\d{1,3}(\.\d+)?\s*(\/\s*\d{1,3})?$/.test(c));
    if (!looksNumeric) return;
    rows.push({ label: cells[0], value: cells.slice(1).join(' · ') });
  });

  return rows.slice(0, 50);
}