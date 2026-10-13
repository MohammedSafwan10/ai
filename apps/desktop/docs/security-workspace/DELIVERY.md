# Delivery and verification plan

## Stage 0 — Baseline and contracts

Inspect current runtime and tests before editing. Measure normal chat startup,
idle memory, input responsiveness, first-token timing and long-chat rendering.
Separate provider latency from app and remote-job overhead. Record host/hardware
and workloads; do not promise universal speed or memory numbers.

Resolve initial connection method, runner lifecycle, network boundaries and exact
model capabilities. Review existing schema before proposing additive migrations.

## Stage 1 — One remote execution slice

Connect to a manually configured Kali ARM64 VM. Discover capabilities; submit a
harmless diagnostic job; stream stdout/stderr; inspect exit state; cancel a long
job; reconnect; retrieve a sample artifact. Keep this behind an explicit opt-in
without changing normal chat routing.

Starting VM planning allocation: 4 GB RAM, 4 virtual CPUs and a 40 GB virtual disk.
These are adjustable estimates, not measured requirements. Verify available disk
and memory before installation. Prefer virtualization of ARM64 over emulating x86.
Tools needing another architecture/hardware remain capability limitations.

## Stage 2 — Security workspace integration

Add workspace type, environment assignment, project objective/scope and protected
connection configuration. Reuse chat/tool timeline and existing model adapters.
Prevent local fallback through tests at the executor boundary, not just prompts.

## Stage 3 — Findings and one complete assessment

Add evidence-linked finding lifecycle and a reproducible static APK assessment.
State explicitly which runtime/device checks remain unperformed. Add a repository
security review to verify the design is not URL-specific. Produce reports from
persisted evidence and verification records.

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

- LAN-only SSH versus private overlay networking across different networks.
- Packaging and updating the runner, and support for VM start/shutdown control.
- Job behavior on app exit and transport loss.
- Tool-specific privilege policies and independently enforced network scope.
- Budget aggregation across parent and specialist agents.
- Device and Windows execution adapters.

These decisions must be made in their relevant stage; they do not block documenting
the product direction. A first connector is not proof that every Kali tool or
every security task is supported.
