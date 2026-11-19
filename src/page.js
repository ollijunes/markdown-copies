import { NodeHtmlMarkdown } from 'node-html-markdown';
import { parse } from 'node-html-parser';

export const LINK_CLASS = 'markdown-copy';

const converter = new NodeHtmlMarkdown({ bulletMarker: '-', keepDataImages: false });

/**
 * Read what the copy needs from a built page.
 * Returns { skip: reason } for pages that should not get a copy.
 */
export function readPage(html, options) {
  const root = parse(html, { comment: true });
  const robots = attribute(root, 'meta[name="robots"]', 'content').toLowerCase();
  if (/\bnoindex\b/.test(robots)) return { skip: 'noindex' };
  if (root.querySelector('meta[http-equiv="refresh" i]')) return { skip: 'redirect page' };

  const content = firstMatch(root, options.content);
  if (!content) return { skip: `no element matches ${options.content.join(', ')}` };

  const heading = content.querySelector('h1') ?? root.querySelector('h1');
  const title =
    clean(heading?.text) ||
    clean(attribute(root, 'meta[property="og:title"]', 'content')) ||
    clean(root.querySelector('title')?.text);
  if (!title) return { skip: 'no title' };

  const alternates = {};
  for (const link of root.querySelectorAll('link[rel="alternate"][hreflang]')) {
    const language = (link.getAttribute('hreflang') ?? '').toLowerCase();
    const href = link.getAttribute('href');
    if (href && language && language !== 'x-default') alternates[language] = href;
  }

  const before = options.linkBefore ? root.querySelector(options.linkBefore) : null;
  return {
    title,
    description: clean(attribute(root, 'meta[name="description"]', 'content')),
    language: (root.querySelector('html')?.getAttribute('lang') ?? '').toLowerCase(),
    canonical: attribute(root, 'link[rel="canonical"]', 'href'),
    date: publishedDate(root, content),
    alternates,
    contentHtml: content.outerHTML,
    hasHeading: Boolean(content.querySelector('h1')),
    hasHeadLink: Boolean(root.querySelector('link[type="text/markdown"]')),
    hasVisibleLink: Boolean(root.querySelector(`.${LINK_CLASS}`)),
    // Offsets into the original text, so the page is edited without being re-serialised.
    insertAt: before ? before.range[0] : html.lastIndexOf('</', content.range[1] - 1),
  };
}

/** The article text as Markdown, with absolute links and without page furniture. */
export function toMarkdown(page, pageUrl, remove) {
  const root = parse(page.contentHtml, { comment: false });
  for (const selector of remove) {
    for (const element of root.querySelectorAll(selector)) element.remove();
  }
  for (const [selector, name] of [
    ['a[href]', 'href'],
    ['img[src]', 'src'],
  ]) {
    for (const element of root.querySelectorAll(selector)) {
      const resolved = resolve(element.getAttribute(name), pageUrl);
      if (resolved) element.setAttribute(name, resolved);
    }
  }
  for (const image of root.querySelectorAll('img')) image.removeAttribute('srcset');
  const body = converter.translate(root.toString()).trim();
  return page.hasHeading ? body : `# ${page.title}\n\n${body}`;
}

export function frontMatter(fields) {
  const lines = ['---'];
  for (const [key, value] of Object.entries(fields)) {
    // A JSON string is also a valid double-quoted YAML scalar.
    if (value) lines.push(`${key}: ${JSON.stringify(value)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

/** Add the head link and the visible link to the page text. */
export function addLinks(html, page, { markdownUrl, markdownPath, linkText }) {
  const insertions = [];
  if (!page.hasHeadLink) {
    const head = html.search(/<\/head\s*>/i);
    if (head !== -1) {
      const tag = `<link rel="alternate" type="text/markdown" href="${escapeHtml(markdownUrl)}">`;
      insertions.push([head, tag]);
    }
  }
  if (linkText && !page.hasVisibleLink && page.insertAt > 0) {
    const tag =
      `<p class="${LINK_CLASS}"><a href="${escapeHtml(markdownPath)}" type="text/markdown">` +
      `${escapeHtml(linkText)}</a></p>`;
    insertions.push([page.insertAt, tag]);
  }
  let result = html;
  for (const [position, text] of insertions.sort((a, b) => b[0] - a[0])) {
    result = result.slice(0, position) + text + result.slice(position);
  }
  return result;
}

function firstMatch(root, selectors) {
  for (const selector of selectors) {
    const element = root.querySelector(selector);
    if (element) return element;
  }
  return null;
}

function attribute(root, selector, name) {
  return root.querySelector(selector)?.getAttribute(name) ?? '';
}

function clean(text) {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

function publishedDate(root, content) {
  const candidates = [
    attribute(root, 'meta[property="article:published_time"]', 'content'),
    content.querySelector('time[datetime]')?.getAttribute('datetime') ?? '',
  ];
  for (const script of root.querySelectorAll('script[type="application/ld+json"]')) {
    const match = /"datePublished"\s*:\s*"([^"]+)"/.exec(script.text);
    if (match) candidates.push(match[1]);
  }
  for (const candidate of candidates) {
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(candidate.trim());
    if (match) return match[1];
  }
  return '';
}

function resolve(value, base) {
  if (!value) return '';
  try {
    return new URL(value, base).href;
  } catch {
    return '';
  }
}

export function escapeHtml(text) {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}
