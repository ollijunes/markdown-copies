import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { buildLlmsTxt } from './llms.js';
import { addLinks, frontMatter, LINK_CLASS, readPage, toMarkdown } from './page.js';
import { absoluteUrl, findHtmlFiles, locate, matchesAny } from './paths.js';

const GENERATOR = 'markdown-copies';

const LINK_TEXT = {
  en: 'This page as a Markdown file',
  fi: 'Tämä sivu Markdown-tiedostona',
};

export const DEFAULT_REMOVE = [
  'nav',
  'footer',
  'aside',
  'form',
  'button',
  'script',
  'style',
  'noscript',
  'iframe',
];

const DEFAULTS = {
  base: '/',
  include: ['/**'],
  exclude: ['/404', '/404/**'],
  content: ['article', 'main'],
  remove: DEFAULT_REMOVE,
  link: true,
  linkText: {},
  linkBefore: '',
  llms: true,
  llmsHeader: '',
  llmsHeadings: {},
  robots: true,
  dryRun: false,
};

/**
 * Write a Markdown copy next to every matching page in a build folder,
 * link to it from the page, and list the copies in llms.txt.
 */
export async function markdownCopies(userOptions) {
  const options = normalise(userOptions);
  const files = await findHtmlFiles(options.dir);
  const candidates = [];
  const skipped = [];

  for (const file of files) {
    const { urlPath, markdownFile } = locate(file);
    if (!matchesAny(urlPath, options.include) || matchesAny(urlPath, options.exclude)) continue;
    const html = await readFile(path.join(options.dir, file), 'utf8');
    const page = readPage(html, options);
    if (page.skip) {
      skipped.push({ file, reason: page.skip });
      continue;
    }
    const own = absoluteUrl(options.site, options.base, urlPath);
    const url = page.canonical ? new URL(page.canonical, options.site).href : own;
    if (!samePage(url, own)) {
      // A duplicate that names another page as the original gets no copy of its own.
      skipped.push({ file, reason: 'canonical link points to another page' });
      continue;
    }
    candidates.push({
      file,
      html,
      page,
      url,
      markdownFile,
      markdownUrl: absoluteUrl(options.site, options.base, markdownFile),
      markdownPath: new URL(absoluteUrl(options.site, options.base, markdownFile)).pathname,
    });
  }

  // A translation is linked as its Markdown copy when it has one, otherwise as the page.
  const bare = (url) => url.replace(/\/$/, '');
  const copyOf = new Map(candidates.map((entry) => [bare(entry.url), entry.markdownUrl]));
  const indexUrl = absoluteUrl(options.site, options.base, 'llms.txt');
  const pages = [];

  for (const entry of candidates) {
    const { page } = entry;
    const target = path.join(options.dir, entry.markdownFile);
    if (!(await isOurs(target, entry.url))) {
      skipped.push({ file: entry.file, reason: `${entry.markdownFile} exists and was not generated` });
      continue;
    }
    const fields = {
      title: page.title,
      url: entry.url,
      description: page.description,
      language: page.language,
      date: page.date,
    };
    for (const [language, href] of Object.entries(page.alternates)) {
      if (language === page.language) continue;
      const other = new URL(href, entry.url).href;
      fields[`alternate_${language.replace(/[^a-z0-9]+/g, '_')}`] = copyOf.get(bare(other)) ?? other;
    }
    if (options.llms) fields.index = indexUrl;
    fields.generator = GENERATOR;

    const remove = [...options.remove, `.${LINK_CLASS}`];
    const markdown = `${frontMatter(fields)}\n\n${toMarkdown(page, entry.url, remove)}\n`;
    const language = page.language.split('-')[0];
    const linkText = options.link
      ? (options.linkText[language] ?? LINK_TEXT[language] ?? LINK_TEXT.en)
      : '';
    const html = addLinks(entry.html, page, { ...entry, linkText });

    if (!options.dryRun) {
      await writeFile(target, markdown, 'utf8');
      if (html !== entry.html) await writeFile(path.join(options.dir, entry.file), html, 'utf8');
    }
    pages.push({
      file: entry.file,
      markdownFile: entry.markdownFile,
      url: entry.url,
      markdownUrl: entry.markdownUrl,
      title: page.title,
      description: page.description,
      language: page.language,
      date: page.date,
    });
  }

  let llmsFile = '';
  if (options.llms) {
    llmsFile = 'llms.txt';
    const existing = options.llmsHeader || path.join(options.dir, llmsFile);
    const text = buildLlmsTxt({
      header: await readIfExists(existing),
      pages,
      headings: options.llmsHeadings,
      siteName: new URL(options.site).hostname,
    });
    if (!options.dryRun) await writeFile(path.join(options.dir, llmsFile), text, 'utf8');
    if (options.robots && !options.dryRun) await mentionInRobots(options.dir, indexUrl);
  }
  return { pages, skipped, llmsFile };
}

export default markdownCopies;

function normalise(userOptions) {
  const options = { ...DEFAULTS, ...dropUndefined(userOptions ?? {}) };
  if (!options.dir) throw new Error('markdown-copies: `dir` (the build folder) is required.');
  if (!options.site) {
    throw new Error('markdown-copies: `site` is required, for example https://example.com');
  }
  let site;
  try {
    site = new URL(options.site);
  } catch {
    throw new Error(`markdown-copies: \`site\` is not a URL: ${options.site}`);
  }
  if (!['http:', 'https:'].includes(site.protocol)) {
    throw new Error('markdown-copies: `site` must start with http:// or https://');
  }
  for (const key of ['include', 'exclude', 'content', 'remove']) {
    if (typeof options[key] === 'string') options[key] = [options[key]];
    if (!Array.isArray(options[key])) throw new Error(`markdown-copies: \`${key}\` must be a list.`);
  }
  options.site = site.origin;
  options.dir = path.resolve(options.dir);
  return options;
}

/** The same address, whether written with a trailing slash, index.html or .html. */
function samePage(a, b) {
  const bare = (address) =>
    new URL(address).pathname.replace(/(\/index)?\.html$/i, '').replace(/\/$/, '');
  return bare(a) === bare(b);
}

function dropUndefined(object) {
  return Object.fromEntries(Object.entries(object).filter(([, value]) => value !== undefined));
}

async function readIfExists(file) {
  try {
    return await readFile(file, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return '';
    throw error;
  }
}

/** Never overwrite a Markdown file the site author put there. */
async function isOurs(file, url) {
  const existing = await readIfExists(file);
  if (!existing) return true;
  if (!existing.startsWith('---\n')) return false;
  const head = existing.slice(0, existing.indexOf('\n---\n', 3) + 1);
  // Copies carry a generator line; copies from before it are recognised by their url.
  return head.includes(`\ngenerator: "${GENERATOR}"\n`) || head.includes(`\nurl: ${JSON.stringify(url)}\n`);
}

async function mentionInRobots(dir, indexUrl) {
  const file = path.join(dir, 'robots.txt');
  const robots = await readIfExists(file);
  if (!robots || robots.includes('llms.txt')) return;
  await writeFile(file, `${robots.trimEnd()}\n\n# LLMs: ${indexUrl}\n`, 'utf8');
}
