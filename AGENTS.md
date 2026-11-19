# Working in this repository

Read [CONTRIBUTING.md](CONTRIBUTING.md) first. Before you say a change is done, run:

```sh
npm test
npm run coverage
npm run lint
python3 scripts/check_public_tree.py
```

- Examples and test data are invented. Use `example.com` and made-up names; never copy a real
  file, page, path or text from your own machine.
- Tests do not use the network and do not read the real home folder.
- Commit each working step with a short message in the imperative. Do not use `--no-verify`.
