# Contributing

Bug fixes are welcome, most of all pages that convert badly. Send the
smallest HTML that shows the problem, with invented content.

```sh
npm ci
npm test
npm run coverage
npm run lint
gitleaks git --redact --no-banner .
python3 scripts/check_public_tree.py
```

## Rules

- No real site content, not even in a temporary commit. Tests build their
  pages with `support/site.js` and use `example.com`.
- The page is edited by insertion only. Do not parse and re-serialise the
  HTML: that changes markup the site owner did not ask to change.
- A new option needs a real site that cannot be handled without it.
- Keep the dependencies to the HTML parser and the Markdown converter.
- Link text and headings for another language are welcome when a native
  speaker wrote them.

Use a public-safe Git author address. Report vulnerabilities through
[SECURITY.md](SECURITY.md), not a public issue.
