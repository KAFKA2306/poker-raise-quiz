# Private Repository Agent Contract

This repository is private. Keep development, verification, release, and cleanup operable with zero mandatory GitHub-hosted Actions spend.

## Zero-Cost Rule

- Do not add or require GitHub-hosted runners (`ubuntu-latest`, `windows-latest`, `macos-latest`, or equivalent) unless the user explicitly changes the cost contract.
- Run tests, lint, builds, data checks, and artifact generation locally or in the active agent environment using the repository's actual toolchain.
- A GitHub Actions Billing/spending-limit failure is an infrastructure condition, not source-code test evidence. Do not retry a billing-blocked hosted workflow as the normal recovery route.
- If self-hosted Actions are ever introduced, document the runner host, security boundary, and availability; self-hosting must not become an implicit completion dependency.

## Git / PR / Cleanup

- Use GitHub API/connector operations for Issue, PR, commit, merge, and repository-state work where available; these do not require a GitHub-hosted runner.
- Do not create a workflow solely to merge, close, or delete a branch.
- Prefer GitHub's native `Automatically delete head branches` setting for merged PR cleanup; otherwise use an available API/UI deletion path.
- Keep one canonical branch/PR for one outcome. Do not create duplicates to work around a rejected write.
- If a host-side safety system rejects a GitHub write, re-fetch current state and retry the exact canonical action once. If rejected again, preserve the single canonical workline and report the blocker.

## Verification

- Derive verification commands from the repository's current README, package/build files, and executable configuration rather than inventing CI-only checks.
- Record exactly which checks ran and their results. A check that did not run is not PASS.
- Merge only when the requested contract is provable without depending on paid hosted CI.

## Completion

Before reporting completion, verify relevant source state, tests/builds actually executed, PR/main state, and cleanup. Do not treat billing-gated hosted CI as a completion requirement for this private repository.
