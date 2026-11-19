import { fileURLToPath } from 'node:url';

import { markdownCopies } from './index.js';

/**
 * Astro integration. Runs after the build, on the HTML that Astro wrote.
 *
 *   import markdownCopies from 'markdown-copies/astro';
 *   export default defineConfig({
 *     site: 'https://example.com',
 *     integrations: [markdownCopies({ include: ['/blog/**'] })],
 *   });
 */
export default function astroMarkdownCopies(options = {}) {
  let site = options.site;
  let base = options.base;
  return {
    name: 'markdown-copies',
    hooks: {
      'astro:config:done': ({ config }) => {
        site ??= config.site;
        base ??= config.base;
      },
      'astro:build:done': async ({ dir, logger }) => {
        if (!site) {
          throw new Error(
            'markdown-copies: set `site` in astro.config.mjs. The copies need absolute URLs.',
          );
        }
        const result = await markdownCopies({ ...options, site, base, dir: fileURLToPath(dir) });
        logger.info(
          `${result.pages.length} Markdown copies` +
            (result.llmsFile ? `, ${result.llmsFile}` : '') +
            (result.skipped.length ? `, ${result.skipped.length} pages skipped` : ''),
        );
        for (const { file, reason } of result.skipped) logger.debug(`skipped ${file}: ${reason}`);
      },
    },
  };
}
