# Contributing to WattLoom

> 🇩🇪 [Deutsche Version](CONTRIBUTING.de.md)

WattLoom is a hobby project developed in spare time. Contributions are welcome,
but please keep expectations realistic: reviews and responses happen on a best-effort
basis, not guaranteed within any fixed timeframe.

## Reporting bugs

Please use [GitHub Issues](../../issues) with the "Bug" template. The more precise the
reproduction steps (operating system, Docker vs. manual install, affected page/API
endpoint), the faster the issue can be narrowed down.

## Feature requests

Also via GitHub Issues, using the "Feature Request" template. WattLoom is deliberately
designed as a single-user application for Strava export data (see `CLAUDE.md`) –
suggestions that require multi-user operation, auth, or a live Strava API connection
don't fit the architecture and will likely be rejected.

## Pull requests

- Small, focused PRs preferred – one PR, one change.
- Backend changes: please include matching tests (`pytest`, see `tests/`).
- Frontend changes: `cd frontend && npx tsc --noEmit -p tsconfig.app.json` must pass
  cleanly (not `tsconfig.json` directly – that checks nothing, see `CLAUDE.md`).
- Keep the existing code style (see `CLAUDE.md` for conventions: many small,
  focused functions, comments only where the WHY isn't obvious).
- Commit messages short and descriptive, no fixed schema enforced.

## Setting up a dev environment

See [README.md](README.md#installation--start) for the full guide
(backend/frontend manually or via Docker).

## License

By contributing, you agree that your code will be published under the project's
license (AGPL-3.0, see [LICENSE](LICENSE)).
