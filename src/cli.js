import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import { DEFAULT_REMOVE, markdownCopies } from './index.js';

const HELP = `markdown-copies <build folder> --site https://example.com [options]

Writes a Markdown copy next to every page, links to it from the page
and lists the copies in llms.txt.

  --site URL            the site's address (required)
  --base PATH           path the site is served under (default /)
  --include GLOB        pages that get a copy, by URL path; repeatable (default /**)
  --exclude GLOB        pages that do not; repeatable (default /404)
  --content SELECTOR    element that holds the text; repeatable (default article, then main)
  --remove SELECTOR     elements left out of the copy; repeatable, adds to the defaults
  --link-before SEL     put the visible link before this element instead of at the end
  --no-link             no visible link on the page
  --no-llms             do not write llms.txt
  --llms-header FILE    hand-written start of llms.txt (default: the existing llms.txt)
  --no-robots           do not mention llms.txt in robots.txt
  --dry-run             change nothing, list what would be written
  --version, --help
`;

export async function main(argv, print = console.log) {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      site: { type: 'string' },
      base: { type: 'string' },
      include: { type: 'string', multiple: true },
      exclude: { type: 'string', multiple: true },
      content: { type: 'string', multiple: true },
      remove: { type: 'string', multiple: true },
      'link-before': { type: 'string' },
      'no-link': { type: 'boolean' },
      'no-llms': { type: 'boolean' },
      'llms-header': { type: 'string' },
      'no-robots': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
      version: { type: 'boolean' },
      help: { type: 'boolean' },
    },
  });
  if (values.help) {
    print(HELP);
    return 0;
  }
  if (values.version) {
    const manifest = new URL('../package.json', import.meta.url);
    print(`markdown-copies ${JSON.parse(readFileSync(manifest, 'utf8')).version}`);
    return 0;
  }
  if (positionals.length !== 1) {
    print(HELP);
    return 1;
  }
  const result = await markdownCopies({
    dir: positionals[0],
    site: values.site,
    base: values.base,
    include: values.include,
    exclude: values.exclude,
    content: values.content,
    remove: values.remove ? [...DEFAULT_REMOVE, ...values.remove] : undefined,
    linkBefore: values['link-before'],
    link: values['no-link'] ? false : undefined,
    llms: values['no-llms'] ? false : undefined,
    llmsHeader: values['llms-header'],
    robots: values['no-robots'] ? false : undefined,
    dryRun: values['dry-run'],
  });
  const verb = values['dry-run'] ? 'would write' : 'wrote';
  for (const page of result.pages) print(`${verb} ${page.markdownFile}`);
  for (const { file, reason } of result.skipped) print(`skipped ${file}: ${reason}`);
  if (result.llmsFile) print(`${verb} ${result.llmsFile} (${result.pages.length} pages)`);
  return 0;
}
