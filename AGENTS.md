# AGENTS.md

## Repository Expectations

- This is an Electron + React desktop app built with `electron-vite` and packaged with `electron-builder`.
- Keep renderer code behind the preload bridge. Do not import Electron APIs directly into `src/renderer`.
- Prefer small, focused changes that preserve the existing UI patterns unless the task explicitly asks for a redesign.

## Before Finishing Changes

- Run the TypeScript checks:
  - `npm run typecheck`
- If you changed lint-relevant code, also run:
  - `npm run lint`
- When changing packaging, updater, preload, or IPC code, make sure both main-process and renderer changes stay in sync.

## Updater And Release Workflow

- The app uses `electron-updater`.
- Auto-updates are intended to work only in packaged builds, not in `npm run dev`.
- Updates are delivered through GitHub Releases for:
  - `shivenp14/ducklink-food-finder`
- The updater UI lives in Settings and supports:
  - `Check for Updates`
  - `Download Update`
  - `Restart to Update`

## Shipping A New App Version

1. Make the code changes.
2. Bump the app version:
   - `npm version patch`
   - Use `minor` or `major` instead when appropriate.
3. Export a GitHub token with permission to create releases and upload assets:
   - `export GH_TOKEN=...`
4. Publish the macOS release:
   - `npm run dist:mac:publish`

This publish step is expected to upload the release artifacts and updater metadata needed by `electron-updater`, including the macOS `.dmg`, `.zip`, and release metadata files.

## Packaging Notes

- macOS targets should continue to include both:
  - `dmg`
  - `zip`
- If you change `build.publish` or updater configuration, keep the runtime updater service and release instructions aligned.

## File Areas

- `src/main` contains Electron main-process code, services, and IPC handlers.
- `src/preload` contains the safe renderer bridge.
- `src/renderer` contains the React UI.
- `docs/` contains implementation notes and project documentation.

## Documentation Expectations

- If you change the release or update workflow, update `README.md`.
- If you change public behavior in a non-obvious way, document it in `docs/` or `README.md` as appropriate.

<!-- agent-workflow:begin -->
# Agent Operating Policy

For substantial software tasks, act as the coordinating agent.

Own:
- the user's objective and acceptance criteria;
- decomposition and dependency ordering;
- delegation and worker scope;
- integration decisions;
- review and final verification.

Do not accumulate broad repository exploration, long logs, or implementation
transcripts in the coordinating context when that work can be delegated to an
isolated subagent.

## Work Directly When Appropriate

Handle work directly when it is small, obvious, and unlikely to create
significant context.

Examples include:
- a targeted lookup;
- a simple grep or file read;
- a trivial one-file edit;
- a small correction to already-understood work.

Do not spawn a subagent merely to avoid a cheap operation.

## Orchestrate Substantial Work

For substantial implementation, broad repository exploration, noisy debugging,
multi-file changes, separable workstreams, or independent review, use the
`orchestrate` skill.

Implementation should normally be performed by implementation subagents when
the change is substantial enough to justify delegation.

The coordinating agent should manage the work rather than duplicate the
worker's implementation process.

Prefer:
- isolated subagents for context-heavy work;
- bounded ownership;
- concise result summaries;
- objective verification results;
- fresh-context review for important changes.

Parallelize only genuinely independent work.

Never assign overlapping write ownership to concurrent subagents.

## Worker Selection

Use the repository's Codex custom agents according to their execution boundary:

- `explorer` for read-only repository investigation;
- `implementer` for bounded implementation, testing, and debugging;
- `reviewer` for independent read-only review.

Use the default subagent reasoning effort for normal delegated work.

Escalate a worker to the highest available reasoning effort only when the
orchestration or retry policy indicates that deeper reasoning is justified.

Do not create fictional specialist personas when a bounded task can be assigned
to one of these generic workers.

## Context Discipline

Retrieve detailed source context only when needed for coordination or
integration.

Do not copy large source files, logs, test output, diffs, or worker transcripts
into the coordinating context.

Workers should return only durable information needed for the next decision.

Prefer repository paths, symbols, task-state entries, and concise summaries
over copied implementation context.

For substantial multi-step tasks, use compact durable state according to the
orchestration skill rather than retaining execution history in conversation.

## Review and Verification

Do not mark substantial work complete solely because a subagent reports
success.

Use independent review when the orchestration policy calls for it.

Use evidence-based verification against the acceptance criteria before
completion.

A passing worker report is useful state, not proof by itself.

## Completion

Before completing substantial work, confirm:
- the acceptance criteria;
- relevant verification results;
- integration state;
- substantive review findings;
- genuine remaining risks or limitations.

Keep the final user-facing result concise and focused on outcomes.
<!-- agent-workflow:end -->
