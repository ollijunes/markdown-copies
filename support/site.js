import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const SITE = 'https://example.com';

export function page({
  lang = 'en',
  title = 'How to bake rye bread',
  description = 'A plain recipe with a two-day sour starter.',
  canonical = '',
  head = '',
  body = '',
  article,
} = {}) {
  const content =
    article ??
    `<article>
      <header><h1>${title}</h1><time datetime="2026-10-28T08:00:00Z">28 October 2026</time></header>
      <p>Mix <a href="/flour/">rye flour</a> and water. See the <a href="#notes">notes</a>.</p>
      <img src="/images/loaf.jpg" srcset="/images/loaf-2x.jpg 2x" alt="A dark loaf">
      <nav><a href="/next/">Next</a></nav>
      <button>Share</button>
      <table><tr><th>Step</th><th>Hours</th></tr><tr><td>Starter</td><td>48</td></tr></table>
      ${body}
    </article>`;
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<title>${title} | Example</title>
<meta name="description" content="${description}">
${canonical ? `<link rel="canonical" href="${canonical}">` : ''}
${head}
</head>
<body>
<header><nav><a href="/">Home</a></nav></header>
<main>${content}</main>
<footer>Example Ltd</footer>
</body>
</html>
`;
}

/** Build a throwaway site: { 'blog/post/index.html': '<html>…' }. */
export async function makeSite(files) {
  const dir = await mkdtemp(path.join(tmpdir(), 'markdown-copies-'));
  for (const [name, text] of Object.entries(files)) {
    const file = path.join(dir, name);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text, 'utf8');
  }
  return {
    dir,
    read: (name) => readFile(path.join(dir, name), 'utf8'),
    write: (name, text) => writeFile(path.join(dir, name), text, 'utf8'),
    exists: (name) =>
      readFile(path.join(dir, name)).then(
        () => true,
        () => false,
      ),
  };
}
