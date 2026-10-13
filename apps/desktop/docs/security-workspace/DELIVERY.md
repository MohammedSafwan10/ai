# Delivery and verification plan

## Stage 0 — Baseline and contracts

Inspect current runtime and tests before editing. Measure normal chat startup,
idle memory, input responsiveness, first-token timing and long-chat rendering.
Separate provider latency from app and remote-job overhead. Record host/hardware
and workloads; do not promise universal speed or memory numbers.

Resolve initial connection method, runner lifecycle, network boundaries and exact
model capabilities. Review existing schema before proposing additive migrations.

## Stage 1 — One remote execution slice

Implemented and verified against the operator's Kali ARM64 VM. The desktop
OpenSSH connector supports capabilities, idempotent submit/lookup, inspect,
sequenced output, confirmed cancellation and bounded artifact retrieval. Runner
source is packaged in resources/kali; it uses existing Python without pip/npm
dependencies. Deployment was authorized separately by the operator.

Verification:
- Twelve connector contract tests run with the ordinary desktop test suite.
- Eleven Python runner tests run on Linux, including concurrent duplicate
  submissions, TERM-ignoring children, queued cancellation, crash/unknown state,
  output limits, Unicode, artifact boundaries, timeout and exit failures.
- Five opt-in desktop tests execute through real SSH, covering live output,
  session reconnection, request deduplication, Stop/next job, timeout, exit codes,
  and artifact integrity.

Run the opt-in suite by setting PRIVORA_KALI_TEST_PROFILE to a private JSON
KaliEnvironment profile and running:

    npm test -- --maxWorkers=1 tests/kaliConnector.live.test.ts

The profile must reference a deployed runner version and verified single-host
pin file. Never commit machine profiles, authentication secrets or private keys.
CI skips the live suite unless explicitly configured. Linux runner tests accept
the deployed runner source path as their first argument.

This validates SSH session reconnect, not Mac sleep, VM reboot, or a physical
network outage. A source build does not automatically update installed desktops.

Connect to a manually configured Kali ARM64 VM. Discover capabilities; submit a
harmless diagnostic job; stream stdout/stderr; inspect exit state; cancel a long
job; reconnect; retrieve a sample artifact. Keep this behind an explicit opt-in
without changing normal chat routing.

The operator's VM uses 4 GB RAM, 4 virtual CPUs and a 40 GB dynamic virtual disk.
Keep 4 GB as the initial CLI baseline and limit concurrent heavy workloads; model
weights are not loaded in Kali. Increase RAM based on workload measurements for
large analysis tasks or future GUI applications. This is not a guarantee that all
Kali tools fit. Tools needing another architecture/hardware remain limitations.

## Stage 2 — Security workspace integration

Implemented in source: additive workspace type, environment assignment,
objective/scope, private profile import/check IPC, Kali model-tool routing and
chat setup/status/details UI. Existing models, reasoning, permissions and Plan
controls remain in use. Host-tool fallback is blocked at the executor boundary.

Durable job IDs, bounded output, cancellation, reconnect and startup reconciliation
are integrated with SQLite and the existing activity pipeline. On-demand details
show unknown jobs, Stop controls, output Copy, and app-owned evidence files.
The complete chat loop passed against real SSH: command streaming, confirmed
Stop followed by another message, Unicode artifact import and evidence-linked
findings. A live Muse Spark run through OpenCode Go also completed these fixture
steps. That check exposed duplicated Responses completion events; canonical
call-ID tracking now prevents double execution in Go and CLIProxy.
Packaged connection checks and text evidence previews have been exercised.
The packaged native Save dialog wrote the expected UTF-8 fixture to disk and
reported completion. The final desktop suite passed 482 tests, including the
real-SSH checks; TypeScript, the Windows package and production dependency audit
passed (zero reported production vulnerabilities). The portable build is usable;
installer distribution and representative assessment acceptance remain separate.

## Stage 3 — Findings and one complete assessment

Evidence-linked finding storage, model tools, and details UI are implemented.
Verified-state saves require reproduction and completed jobs from the current
workspace. Artifact retrieval verifies remote content integrity and imports it
into existing attachment storage for preview/download.

Pending assessment acceptance: a reproducible static APK lab task and repository
security review, with known expected findings and false-positive checks. State
which runtime/device checks remain unperformed. Report generation and dedicated
retest workflows remain future work; stored evidence alone does not prove an
assessment was correct.

## Stage 4 — Expand based on demonstrated need

Add network lab workflows, optional specialists, a browser inside the remote
environment, Android test devices and Windows test environments. Introduce Rust
only for a specific low-level requirement or measured bottleneck. Do not begin
with custom hypervisors, eBPF drivers, scanners or a universal plugin platform.

## Acceptance checks

| Area | Required evidence |
| --- | --- |
| Normal chat | Existing workflows, models, history and approvals retain behavior |
| Routing | Security job cannot silently execute on Windows after disconnect |
| Connection | Host identity verified; credentials absent from renderer/log output |
| Capabilities | Missing tools and ARM incompatibility are reported honestly |
| Jobs | Idempotent submission and no duplicate execution after uncertain delivery |
| Stop | Parent/child processes terminate; actual final state reaches UI |
| Reconnect | Ordered output catches up without loss/duplication or unsafe replay |
| Files | Traversal/symlink escape blocked; transfers bounded; originals preserved |
| Context | Untrusted tool/document text cannot grant execution permissions |
| Findings | Claims have evidence; unverified results remain unverified |
| Performance | Large output and long histories keep bounded previews and responsive input |
| Recovery | App restart reconciles outstanding jobs instead of declaring them finished |

Use focused unit/contract tests, isolated runner integration tests and UI checks.
Verify representative end-to-end workflows in a controlled lab. Do not test
against production targets as part of implementation verification.

## Deferred decisions

- The first environment uses LAN SSH through an operator-managed Mac forward.
  Private overlay networking remains optional for connections across networks.
- Automatic runner installation/update and VM start/shutdown control.
- Remote GUI/browser and managed interactive PTY adapters. Current jobs capture
  noninteractive stdout/stderr; SSH access alone is not desktop control.
- Tool-specific privilege policies and independently enforced network scope.
- Budget aggregation across parent and specialist agents.
- Device and Windows execution adapters.

Remote jobs persist across SSH transport loss. The desktop reconciles known job
IDs and displays unknown until state is confirmed; it must not replay a possibly
mutating command automatically. Physical outage/reboot acceptance remains pending.
The integration does not prove every Kali tool or security task is supported.
