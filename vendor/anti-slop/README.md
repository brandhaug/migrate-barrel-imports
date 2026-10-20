# Anti-slop lint plugin

`plugin.mjs` and `license.md` are unchanged copies from
`ultracite@8.0.1/config/oxlint/anti-slop/`.

The repository uses this standalone bundle, not the Ultracite CLI. Keeping the
bundle here removes the CLI's vulnerable `fast-glob -> micromatch -> braces`
dependency chain while preserving the existing lint rules.

To update, copy both files from the chosen Ultracite package and run the repository
lint check. Keep the bundle excluded from formatting, linting, and dead-code
analysis so those tools do not rewrite or analyze third-party code.
