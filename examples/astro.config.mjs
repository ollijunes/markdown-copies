// An Astro blog in English and Finnish with an author box under each article.
import { defineConfig } from 'astro/config';
import markdownCopies from 'markdown-copies/astro';

export default defineConfig({
  site: 'https://example.com',
  integrations: [
    markdownCopies({
      include: ['/blog/**', '/fi/blogi/**'],
      exclude: ['/blog', '/fi/blogi', '/blog/tag/**'],
      remove: ['nav', 'footer', 'aside', 'form', 'button', 'script', 'style', '.share', '.related'],
      linkBefore: '.author-box',
      llmsHeadings: { en: 'Articles (English)', fi: 'Artikkelit (suomeksi)' },
    }),
  ],
});
