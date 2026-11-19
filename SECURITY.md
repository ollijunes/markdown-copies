# Security

## Report a vulnerability

Use [GitHub private vulnerability reporting](https://github.com/ollijunes/markdown-copies/security/advisories/new).
Describe the problem with a small synthetic page and include the affected
version.

## What the tool does

- Reads the `.html` files in the build folder you name and writes only
  inside that folder: a `.md` file next to each page, the page itself,
  `llms.txt` and `robots.txt`.
- Does not follow symbolic links when it walks the folder.
- Changes each page with two insertions, a `<link>` in the head and one
  paragraph in the article. Everything else stays byte for byte. The
  inserted address and text are HTML-escaped.
- Never overwrites a Markdown file it did not generate. A generated file
  carries the line `generator: "markdown-copies"` in its front matter.
- Skips pages marked `noindex`, so a page you kept out of search engines
  does not get a second public address.
- Makes no network requests and runs no code from the pages. Scripts,
  styles, iframes and forms are removed before the conversion.

## What it does not do

- It does not decide what is public. Every page that matches `include` and
  is not `noindex` gets a copy and a line in `llms.txt`. A page protected
  only by an unlinked address becomes easy to find. Set `include` and
  `exclude` with that in mind.
- It does not clean the text. A draft note, a hidden element or a comment
  box inside the article element ends up in the copy unless you list it in
  `remove`. Read a few copies before you publish.
- The Markdown is made from your own HTML and is as trustworthy as that
  HTML. If your pages show text written by visitors, the copies do too.

## Repository hygiene

This repository contains no real site content. The examples and the pages
the tests build are synthetic. CI scans the full Git history with Gitleaks
and with `scripts/check_public_tree.py`, which looks for private network
addresses, home-directory paths, email addresses outside example domains
and private files. Automated scans support a manual review; they do not
prove that nothing private slipped in.
