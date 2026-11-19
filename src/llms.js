export const MARKER = '<!-- markdown-copies: the lists below are generated -->';

const HEADINGS = {
  en: 'Articles (English)',
  fi: 'Artikkelit (suomeksi)',
};

/**
 * llms.txt: a hand-written header followed by one list per language.
 * Each line follows llmstxt.org: `- [title](url): notes`.
 */
export function buildLlmsTxt({ header, pages, headings = {}, siteName }) {
  const kept = (header ?? '').split(MARKER)[0].trimEnd();
  const parts = [kept || `# ${siteName}`];
  if (pages.length) parts.push(MARKER);

  const byLanguage = new Map();
  for (const page of pages) {
    const key = page.language.split('-')[0];
    if (!byLanguage.has(key)) byLanguage.set(key, []);
    byLanguage.get(key).push(page);
  }
  for (const language of [...byLanguage.keys()].sort()) {
    const label =
      headings[language] ?? HEADINGS[language] ?? (language ? `Articles (${language})` : 'Articles');
    const lines = byLanguage
      .get(language)
      .sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title))
      .map((page) => {
        const notes = [page.date, page.description].filter(Boolean).join('. ');
        const title = page.title.replaceAll('[', '(').replaceAll(']', ')');
        return `- [${title}](${page.markdownUrl})${notes ? `: ${notes}` : ''}`;
      });
    parts.push(`## ${label}\n\n${lines.join('\n')}`);
  }
  return `${parts.join('\n\n')}\n`;
}
