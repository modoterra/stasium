# CLI Binary Smoke Verification

Use this checklist after `bun run build` to verify the standalone `stasium` binary command surface.

- `dist/stasium --help` prints root usage and exits successfully.
- `dist/stasium --version` prints the installed Stasium version and exits successfully.
- `dist/stasium nope` exits non-zero and suggests `stasium --help`.
- `dist/stasium validate` does not open the Workspace and exits based on Manifest validity.
- `dist/stasium status` does not open the Workspace and prints known Managed Process state.
- `dist/stasium logs <managed-process-name>` does not open the Workspace and prints durable Process Output or a clear unavailable-output message.

The root `dist/stasium` command remains interactive and should be manually verified in a terminal when changing Workspace startup behavior.
