# ClawMiner Skills Runtime (CLI)

This package is a **script-first runtime** for ClawMiner.

- No OpenClaw plugin registration required.
- No `index.ts` tool registration layer.
- Use `skills` docs from `dist/skills`.
- Call tools directly through CLI (`clawminer call ...`) or `node dist/cli.js`.

## Install

```bash
pnpm install
pnpm run build
```

## Run

List available tool commands:

```bash
node dist/cli.js list
```

Call a tool:

```bash
node dist/cli.js call get_task_status --json '{"taskId":"1"}'
node dist/cli.js call check_event_resolution --json '{"eventId":"291778"}'
```

If installed globally, you can use:

```bash
clawminer list
clawminer call get_wallet_info --json '{}'
```

## Build Outputs

- `dist/tools/*` — executable JS tool modules
- `dist/contracts/*` — contract artifacts used by tools
- `dist/skills/*` — skill markdown docs for AI guidance

## Skills Layout

Source skills are now under:

```text
src/skills/
```

They are copied to `dist/skills/` on build.

