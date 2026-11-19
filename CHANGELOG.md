# Changelog

## 0.1.0

- A Markdown copy next to every matching page: front matter with title,
  canonical address, description, language, date, translations and the
  `llms.txt` address and a `generator` line that marks the file as
  generated; absolute links; navigation, footers, forms and
  buttons left out.
- A `<link rel="alternate" type="text/markdown">` in the head and a visible
  link at the end of the article, added by insertion so the rest of the
  page stays byte for byte.
- `llms.txt` built from the copies, by language and newest first, after a
  hand-written header. A mention in `robots.txt`.
- Astro integration (`markdown-copies/astro`), a command line tool for any
  build folder, and a JavaScript API.
- `noindex` pages, redirect pages, duplicates with a canonical link to
  another page and hand-written Markdown files are left alone. Symbolic links are not followed.
- Tests on Linux and macOS with Node 20, 22 and 24, and a privacy scan of
  the full history in CI.
