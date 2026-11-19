import assert from 'node:assert/strict';
import { symlink } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';

import { markdownCopies } from '../src/index.js';
import { makeSite, page, SITE } from '../support/site.js';

test('writes a copy with front matter, absolute links and no page furniture', async () => {
  const site = await makeSite({ 'blog/rye/index.html': page() });
  const result = await markdownCopies({ dir: site.dir, site: SITE });

  assert.equal(result.pages.length, 1);
  assert.equal(result.pages[0].markdownUrl, 'https://example.com/blog/rye/index.md');
  const copy = await site.read('blog/rye/index.md');
  assert.ok(
    copy.startsWith(
      [
        '---',
        'title: "How to bake rye bread"',
        'url: "https://example.com/blog/rye/"',
        'description: "A plain recipe with a two-day sour starter."',
        'language: "en"',
        'date: "2026-10-28"',
        'index: "https://example.com/llms.txt"',
        'generator: "markdown-copies"',
        '---',
        '',
        '# How to bake rye bread',
      ].join('\n'),
    ),
    copy,
  );
  assert.match(copy, /\[rye flour\]\(https:\/\/example\.com\/flour\/\)/);
  assert.match(copy, /\[notes\]\(https:\/\/example\.com\/blog\/rye\/#notes\)/);
  assert.match(copy, /!\[A dark loaf\]\(https:\/\/example\.com\/images\/loaf\.jpg\)/);
  assert.match(copy, /\| Step\s+\| Hours\s+\|/);
  assert.doesNotMatch(copy, /Next|Share|Home|Example Ltd|loaf-2x/);
  assert.ok(copy.endsWith('\n'));
});

test('adds the head link and the visible link, once', async () => {
  const site = await makeSite({ 'blog/rye/index.html': page() });
  await markdownCopies({ dir: site.dir, site: SITE });
  const first = await site.read('blog/rye/index.html');

  assert.match(
    first,
    /<link rel="alternate" type="text\/markdown" href="https:\/\/example\.com\/blog\/rye\/index\.md"><\/head>/,
  );
  assert.match(
    first,
    /<p class="markdown-copy"><a href="\/blog\/rye\/index\.md" type="text\/markdown">This page as a Markdown file<\/a><\/p><\/article>/,
  );

  const copyBefore = await site.read('blog/rye/index.md');
  await markdownCopies({ dir: site.dir, site: SITE });
  assert.equal(await site.read('blog/rye/index.html'), first, 'a second run changes nothing');
  assert.equal(await site.read('blog/rye/index.md'), copyBefore);
  assert.doesNotMatch(copyBefore, /Markdown file/, 'the copy does not link to itself');
});

test('everything outside the two insertions stays byte for byte', async () => {
  const original = page({ body: '<p>Odd   spacing &amp; <b>unclosed' });
  const site = await makeSite({ 'a/index.html': original });
  await markdownCopies({ dir: site.dir, site: SITE });
  const changed = await site.read('a/index.html');
  const restored = changed
    .replace(/<link rel="alternate" type="text\/markdown"[^>]*>/, '')
    .replace(/<p class="markdown-copy">.*?<\/p>/, '');
  assert.equal(restored, original);
});

test('finnish page gets finnish link text and the translation points at the other copy', async () => {
  const head = (self) =>
    `<link rel="alternate" hreflang="en" href="https://example.com/blog/rye/">
     <link rel="alternate" hreflang="fi" href="https://example.com/fi/blogi/ruis/">
     <link rel="alternate" hreflang="sv" href="https://example.com/sv/rag/">
     <link rel="alternate" hreflang="x-default" href="${self}">`;
  const site = await makeSite({
    'blog/rye/index.html': page({ head: head('https://example.com/blog/rye/') }),
    'fi/blogi/ruis/index.html': page({
      lang: 'fi',
      title: 'Näin leivot ruisleivän',
      description: 'Ohje ja kahden päivän juuri.',
      head: head('https://example.com/blog/rye/'),
    }),
  });
  await markdownCopies({ dir: site.dir, site: SITE });

  const english = await site.read('blog/rye/index.md');
  assert.match(english, /alternate_fi: "https:\/\/example\.com\/fi\/blogi\/ruis\/index\.md"/);
  assert.match(english, /alternate_sv: "https:\/\/example\.com\/sv\/rag\/"/, 'no copy: link the page');
  assert.doesNotMatch(english, /alternate_en|alternate_x/);
  const finnish = await site.read('fi/blogi/ruis/index.html');
  assert.match(finnish, />Tämä sivu Markdown-tiedostona<\/a>/);
});

test('include and exclude choose pages by URL path', async () => {
  const site = await makeSite({
    'index.html': page(),
    'blog/index.html': page(),
    'blog/rye/index.html': page(),
    'blog/drafts/x/index.html': page(),
    'about/index.html': page(),
    '404.html': page(),
  });
  const result = await markdownCopies({
    dir: site.dir,
    site: SITE,
    include: ['/blog/**'],
    exclude: ['/blog', '/blog/drafts/**'],
  });
  assert.deepEqual(
    result.pages.map((entry) => entry.markdownFile),
    ['blog/rye/index.md'],
  );
  assert.equal(await site.exists('index.md'), false);
  assert.equal(await site.exists('about/index.md'), false);
});

test('pages without a trailing slash get name.md', async () => {
  const site = await makeSite({ 'blog/rye.html': page(), '404.html': page() });
  const result = await markdownCopies({ dir: site.dir, site: SITE });
  assert.deepEqual(
    result.pages.map((entry) => [entry.url, entry.markdownUrl]),
    [['https://example.com/blog/rye', 'https://example.com/blog/rye.md']],
  );
  assert.match(await site.read('blog/rye.html'), /href="\/blog\/rye\.md" type="text\/markdown"/);
});

test('noindex pages, redirects and pages without text are skipped and left alone', async () => {
  const noindex = page({ head: '<meta name="robots" content="NOINDEX, follow">' });
  const redirect = page({ head: '<meta http-equiv="Refresh" content="0;url=/new/">' });
  const empty = '<html><head><title>x</title></head><body><div>no main</div></body></html>';
  const untitled = '<html><head></head><body><main><p>text</p></main></body></html>';
  const site = await makeSite({
    'a/index.html': noindex,
    'b/index.html': redirect,
    'c/index.html': empty,
    'd/index.html': untitled,
  });
  const result = await markdownCopies({ dir: site.dir, site: SITE });
  assert.equal(result.pages.length, 0);
  assert.deepEqual(
    result.skipped.map((entry) => entry.reason),
    ['noindex', 'redirect page', 'no element matches article, main', 'no title'],
  );
  assert.equal(await site.read('a/index.html'), noindex);
  assert.equal(await site.exists('a/index.md'), false);
});

test('the canonical link wins and the title falls back when the text has no h1', async () => {
  const site = await makeSite({
    'p/index.html': page({
      canonical: 'https://www.example.com/p',
      article: '<article><p>Just text.</p></article>',
      head: '<meta property="article:published_time" content="2026-01-02T03:04:05+02:00">',
    }),
  });
  await markdownCopies({ dir: site.dir, site: SITE });
  const copy = await site.read('p/index.md');
  assert.match(copy, /url: "https:\/\/www\.example\.com\/p"/);
  assert.match(copy, /date: "2026-01-02"/);
  assert.match(copy, /\n# How to bake rye bread \| Example\n\nJust text\./);
});

test('a duplicate whose canonical link names another page gets no copy', async () => {
  const site = await makeSite({
    'rye/index.html': page({ canonical: 'https://example.com/rye/index.html' }),
    'rye-print/index.html': page({ canonical: 'https://example.com/rye/' }),
    'oats.html': page({ canonical: '/oats.html' }),
  });
  const result = await markdownCopies({ dir: site.dir, site: SITE });
  assert.deepEqual(
    result.pages.map((entry) => entry.markdownFile),
    ['oats.md', 'rye/index.md'],
  );
  assert.deepEqual(result.skipped, [
    { file: 'rye-print/index.html', reason: 'canonical link points to another page' },
  ]);
});

test('date from JSON-LD, title from og:title', async () => {
  const site = await makeSite({
    'p/index.html': `<html lang="en-GB"><head>
      <meta property="og:title" content="Og   title">
      <script type="application/ld+json">{"@type":"Article","datePublished": "2025-12-24"}</script>
      </head><body><main><p>Text.</p></main></body></html>`,
  });
  const result = await markdownCopies({ dir: site.dir, site: SITE });
  assert.equal(result.pages[0].title, 'Og title');
  assert.equal(result.pages[0].date, '2025-12-24');
  assert.equal(result.pages[0].language, 'en-gb');
});

test('titles and descriptions cannot break the front matter', async () => {
  const site = await makeSite({
    'p/index.html': page({ title: 'Colons: &quot;quotes&quot; and # signs', description: 'a: b' }),
  });
  await markdownCopies({ dir: site.dir, site: SITE });
  const copy = await site.read('p/index.md');
  assert.match(copy, /title: "Colons: \\"quotes\\" and # signs"/);
  assert.match(copy, /description: "a: b"/);
});

test('a Markdown file the author wrote is never overwritten', async () => {
  const site = await makeSite({
    'docs/index.html': page(),
    'docs/index.md': '# Hand-written\n',
  });
  const result = await markdownCopies({ dir: site.dir, site: SITE });
  assert.equal(await site.read('docs/index.md'), '# Hand-written\n');
  assert.deepEqual(result.skipped, [
    { file: 'docs/index.html', reason: 'docs/index.md exists and was not generated' },
  ]);
  assert.doesNotMatch(await site.read('docs/index.html'), /text\/markdown/);
});

test('a copy from an earlier build is still ours after the canonical address changes', async () => {
  const site = await makeSite({ 'docs/index.html': page({ canonical: 'https://example.com/docs/' }) });
  await markdownCopies({ dir: site.dir, site: SITE });
  await site.write('docs/index.html', page({ canonical: 'https://www.example.com/docs/' }));
  const result = await markdownCopies({ dir: site.dir, site: SITE });
  assert.equal(result.skipped.length, 0);
  assert.match(await site.read('docs/index.md'), /url: "https:\/\/www\.example\.com\/docs\/"/);
});

test('a copy from before the generator line is recognised by its url', async () => {
  const old = '---\ntitle: "Old"\nurl: "https://example.com/docs/"\n---\n\nOld text.\n';
  const site = await makeSite({ 'docs/index.html': page(), 'docs/index.md': old });
  const result = await markdownCopies({ dir: site.dir, site: SITE });
  assert.equal(result.skipped.length, 0);
  assert.doesNotMatch(await site.read('docs/index.md'), /Old text/);
});

test('a translation link without the trailing slash still finds the other copy', async () => {
  const head = '<link rel="alternate" hreflang="fi" href="https://example.com/fi/ruis">';
  const site = await makeSite({
    'blog/rye/index.html': page({ head }),
    'fi/ruis/index.html': page({ lang: 'fi', title: 'Ruisleipä' }),
  });
  await markdownCopies({ dir: site.dir, site: SITE });
  assert.match(await site.read('blog/rye/index.md'), /alternate_fi: "https:\/\/example\.com\/fi\/ruis\/index\.md"/);
});

test('options: no link, link before an element, own text, extra removals, base path', async () => {
  const body = '<div class="author">By Alex Example</div><div class="ad">Buy now</div>';
  const site = await makeSite({ 'blog/rye/index.html': page({ body }) });
  await markdownCopies({
    dir: site.dir,
    site: 'https://example.com/ignored/path',
    base: '/docs',
    linkBefore: '.author',
    linkText: { en: 'Markdown' },
    remove: ['.ad', 'nav'],
  });
  const html = await site.read('blog/rye/index.html');
  assert.match(
    html,
    /<p class="markdown-copy"><a href="\/docs\/blog\/rye\/index\.md" type="text\/markdown">Markdown<\/a><\/p><div class="author">/,
  );
  const copy = await site.read('blog/rye/index.md');
  assert.match(copy, /url: "https:\/\/example\.com\/docs\/blog\/rye\/"/);
  assert.match(copy, /By Alex Example/);
  assert.doesNotMatch(copy, /Buy now/);

  const plain = await makeSite({ 'a/index.html': page() });
  await markdownCopies({ dir: plain.dir, site: SITE, link: false, content: 'main' });
  const untouched = await plain.read('a/index.html');
  assert.doesNotMatch(untouched, /markdown-copy/);
  assert.match(untouched, /rel="alternate" type="text\/markdown"/);
});

test('dry run writes nothing', async () => {
  const original = page();
  const site = await makeSite({ 'a/index.html': original, 'robots.txt': 'User-agent: *\n' });
  const result = await markdownCopies({ dir: site.dir, site: SITE, dryRun: true });
  assert.equal(result.pages.length, 1);
  assert.equal(await site.read('a/index.html'), original);
  assert.equal(await site.exists('a/index.md'), false);
  assert.equal(await site.exists('llms.txt'), false);
  assert.equal(await site.read('robots.txt'), 'User-agent: *\n');
});

test('symlinks in the build folder are not followed', async () => {
  const outside = await makeSite({ 'secret/index.html': page() });
  const site = await makeSite({ 'a/index.html': page() });
  await symlink(path.join(outside.dir, 'secret'), path.join(site.dir, 'linked'));
  const result = await markdownCopies({ dir: site.dir, site: SITE });
  assert.equal(result.pages.length, 1);
  assert.equal(await outside.exists('secret/index.md'), false);
});

test('bad options are refused with a clear message', async () => {
  await assert.rejects(markdownCopies({ site: SITE }), /`dir` \(the build folder\) is required/);
  await assert.rejects(markdownCopies({ dir: '.' }), /`site` is required/);
  await assert.rejects(markdownCopies({ dir: '.', site: 'example.com' }), /is not a URL/);
  await assert.rejects(markdownCopies({ dir: '.', site: 'ftp://example.com' }), /http:\/\/ or https:/);
  await assert.rejects(markdownCopies({ dir: '.', site: SITE, include: 5 }), /`include` must be a list/);
  await assert.rejects(markdownCopies(), /`dir`/);
});
