import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import astroMarkdownCopies from '../src/astro.js';
import { main } from '../src/cli.js';
import { markdownCopies } from '../src/index.js';
import { buildLlmsTxt, MARKER } from '../src/llms.js';
import { globToRegExp, matchesAny } from '../src/paths.js';
import { makeSite, page, SITE } from '../support/site.js';

const run = promisify(execFile);
const bin = fileURLToPath(new URL('../bin/markdown-copies.js', import.meta.url));

function twoLanguages() {
  return {
    'blog/rye/index.html': page(),
    'blog/oats/index.html': page({ title: 'Oat [porridge]', description: '' }).replace(
      '2026-10-28T08:00:00Z',
      '2026-11-02',
    ),
    'fi/blogi/ruis/index.html': page({ lang: 'fi', title: 'Ruisleipä', description: 'Ohje.' }),
    'sv/rag/index.html': page({ lang: 'sv', title: 'Rågbröd', description: 'Recept.' }),
  };
}

test('llms.txt keeps the hand-written header and lists copies by language, newest first', async () => {
  const header = '# Example\n\n> A bakery blog.\n\n## About\n\n- [Contact](https://example.com/contact/)\n';
  const site = await makeSite({ ...twoLanguages(), 'llms.txt': header });
  const result = await markdownCopies({ dir: site.dir, site: SITE });
  assert.equal(result.llmsFile, 'llms.txt');
  const expected = [
    header.trimEnd(),
    MARKER,
    '## Articles (English)\n\n' +
      '- [Oat (porridge)](https://example.com/blog/oats/index.md): 2026-11-02\n' +
      '- [How to bake rye bread](https://example.com/blog/rye/index.md): 2026-10-28. A plain recipe with a two-day sour starter.',
    '## Artikkelit (suomeksi)\n\n- [Ruisleipä](https://example.com/fi/blogi/ruis/index.md): 2026-10-28. Ohje.',
    '## Articles (sv)\n\n- [Rågbröd](https://example.com/sv/rag/index.md): 2026-10-28. Recept.',
  ].join('\n\n');
  assert.equal(await site.read('llms.txt'), `${expected}\n`);

  await markdownCopies({ dir: site.dir, site: SITE, llmsHeadings: { sv: 'Artiklar (svenska)' } });
  const again = await site.read('llms.txt');
  assert.equal(again.split(MARKER).length, 2, 'a second run does not repeat the lists');
  assert.match(again, /## Artiklar \(svenska\)/);
});

test('llms.txt without a header starts with the host name; a header file can live elsewhere', async () => {
  const site = await makeSite({ 'a/index.html': page() });
  await markdownCopies({ dir: site.dir, site: SITE });
  assert.ok((await site.read('llms.txt')).startsWith(`# example.com\n\n${MARKER}\n\n## Articles (English)`));

  const headerFile = path.join(site.dir, 'header.txt');
  await writeFile(headerFile, '# Bakery\n');
  await markdownCopies({ dir: site.dir, site: SITE, llmsHeader: headerFile });
  assert.ok((await site.read('llms.txt')).startsWith('# Bakery\n\n'));
});

test('llms.txt with no pages has no marker; no language gives a plain heading', () => {
  assert.equal(buildLlmsTxt({ header: '', pages: [], siteName: 'example.com' }), '# example.com\n');
  const text = buildLlmsTxt({
    pages: [{ language: '', date: '', title: 'T', description: '', markdownUrl: 'https://example.com/t.md' }],
    siteName: 'example.com',
  });
  assert.match(text, /## Articles\n\n- \[T\]\(https:\/\/example\.com\/t\.md\)\n$/);
});

test('robots.txt gets one mention of llms.txt; llms: false writes neither', async () => {
  const site = await makeSite({ 'a/index.html': page(), 'robots.txt': 'User-agent: *\nAllow: /\n' });
  await markdownCopies({ dir: site.dir, site: SITE });
  await markdownCopies({ dir: site.dir, site: SITE });
  assert.equal(
    await site.read('robots.txt'),
    'User-agent: *\nAllow: /\n\n# LLMs: https://example.com/llms.txt\n',
  );

  const off = await makeSite({ 'a/index.html': page(), 'robots.txt': 'User-agent: *\n' });
  const result = await markdownCopies({ dir: off.dir, site: SITE, llms: false });
  assert.equal(result.llmsFile, '');
  assert.equal(await off.exists('llms.txt'), false);
  assert.equal(await off.read('robots.txt'), 'User-agent: *\n');
  assert.doesNotMatch(await off.read('a/index.md'), /\nindex:/);

  const quiet = await makeSite({ 'a/index.html': page(), 'robots.txt': 'User-agent: *\n' });
  await markdownCopies({ dir: quiet.dir, site: SITE, robots: false });
  assert.equal(await quiet.read('robots.txt'), 'User-agent: *\n');
});

test('globs', () => {
  assert.ok(globToRegExp('/blog/*').test('/blog/rye'));
  assert.ok(!globToRegExp('/blog/*').test('/blog/2026/rye'));
  assert.ok(globToRegExp('/blog/**').test('/blog/2026/rye/'));
  assert.ok(!globToRegExp('/a.b').test('/aXb'));
  assert.ok(matchesAny('/blog/rye/', ['/blog/rye']));
  assert.ok(matchesAny('/blog/rye', ['/blog/rye/']));
  assert.ok(matchesAny('/', ['/']));
  assert.ok(!matchesAny('/about/', ['/blog/**']));
});

test('cli: writes, reports, dry run, help and version', async () => {
  const site = await makeSite({ ...twoLanguages(), 'robots.txt': 'User-agent: *\n' });
  const lines = [];
  const print = (line) => lines.push(line);
  assert.equal(
    await main(
      [site.dir, '--site', SITE, '--include', '/blog/**', '--remove', 'table', '--dry-run'],
      print,
    ),
    0,
  );
  assert.deepEqual(lines, [
    'would write blog/oats/index.md',
    'would write blog/rye/index.md',
    'would write llms.txt (2 pages)',
  ]);
  assert.equal(await site.exists('blog/rye/index.md'), false);

  lines.length = 0;
  const args = [site.dir, '--site', SITE, '--include', '/blog/**', '--remove', 'table'];
  assert.equal(await main([...args, '--no-link', '--no-robots', '--link-before', 'h1'], print), 0);
  assert.equal(lines.at(-1), 'wrote llms.txt (2 pages)');
  const copy = await site.read('blog/rye/index.md');
  assert.doesNotMatch(copy, /Hours|Next/, 'own removals add to the defaults');
  assert.doesNotMatch(await site.read('blog/rye/index.html'), /markdown-copy/);
  assert.equal(await site.read('robots.txt'), 'User-agent: *\n');

  lines.length = 0;
  assert.equal(await main([site.dir, '--site', SITE, '--no-llms', '--content', 'main'], print), 0);
  assert.ok(!lines.some((line) => line.includes('llms.txt')));

  lines.length = 0;
  assert.equal(await main(['--help'], print), 0);
  assert.match(lines[0], /--site URL/);
  assert.equal(await main([], print), 1);
  lines.length = 0;
  assert.equal(await main(['--version'], print), 0);
  assert.match(lines[0], /^markdown-copies \d+\.\d+\.\d+$/);
});

test('cli: the installed command runs and reports errors with exit code 1', async () => {
  const site = await makeSite({ 'a/index.html': page(), 'b/index.html': '<html></html>' });
  const { stdout } = await run(process.execPath, [bin, site.dir, '--site', SITE]);
  assert.match(stdout, /wrote a\/index\.md\nskipped b\/index\.html: no element matches article, main\n/);
  await assert.rejects(run(process.execPath, [bin, site.dir]), (error) => {
    assert.equal(error.code, 1);
    assert.match(error.stderr, /`site` is required/);
    return true;
  });
});

test('astro integration: takes site and base from the config and runs after the build', async () => {
  const site = await makeSite({ 'blog/rye/index.html': page(), 'old/index.html': '<html></html>' });
  const integration = astroMarkdownCopies({ include: ['/**'] });
  assert.equal(integration.name, 'markdown-copies');
  const messages = [];
  const logger = { info: (text) => messages.push(text), debug: (text) => messages.push(text) };
  integration.hooks['astro:config:done']({ config: { site: SITE, base: '/docs' } });
  await integration.hooks['astro:build:done']({ dir: pathToFileURL(`${site.dir}/`), logger });
  assert.match(await site.read('blog/rye/index.md'), /url: "https:\/\/example\.com\/docs\/blog\/rye\/"/);
  assert.deepEqual(messages, [
    '1 Markdown copies, llms.txt, 1 pages skipped',
    'skipped old/index.html: no element matches article, main',
  ]);

  const own = astroMarkdownCopies({ site: 'https://example.org', llms: false });
  own.hooks['astro:config:done']({ config: { site: SITE, base: '/' } });
  const quiet = await makeSite({ 'a/index.html': page() });
  await own.hooks['astro:build:done']({ dir: pathToFileURL(`${quiet.dir}/`), logger });
  assert.match(await quiet.read('a/index.md'), /url: "https:\/\/example\.org\/a\/"/);
  assert.equal(messages.at(-1), '1 Markdown copies');

  const missing = astroMarkdownCopies();
  missing.hooks['astro:config:done']({ config: { base: '/' } });
  await assert.rejects(
    missing.hooks['astro:build:done']({ dir: pathToFileURL(`${site.dir}/`), logger }),
    /set `site` in astro\.config\.mjs/,
  );
});
