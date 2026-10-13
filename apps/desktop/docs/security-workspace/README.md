# Privora Security workspace plan

Status: proposed design; implementation has not started.
Date: 13 October 2026.

Privora Security extends the existing desktop app into a security research
workspace. It keeps the normal chat interface and connects the agent to testing
environments, tools, files and evidence. Web assessment is one workflow among
repository review, application analysis, network assessment and investigation.

## Agreed direction

- Build within Privora Desktop, using its TypeScript runtime and React/Electron UI.
- Keep normal workspaces unchanged and make Security an explicit workspace type.
- Reuse chat, model adapters, streaming, tool activity, approvals, recovery and storage.
- Add environment connectors, security task context and findings with evidence.
- No mandatory Docker, Rust rewrite, second agent runtime or standalone Dex app.
- First testing environment: Kali ARM64 VM on the user's M4 MacBook Air with 16 GB RAM.
- Do not install or configure the VM as part of writing this plan.

## Documents

- [Architecture and execution contracts](ARCHITECTURE.md)
- [Interface and streaming behavior](UI_AND_STREAMING.md)
- [Delivery stages and verification](DELIVERY.md)
- [Kali tool operations and expert workflow](KALI_OPERATIONS.md)

## Product boundaries

Capability depends on connected tools, permissions, architecture and hardware.
The app must explain missing capabilities rather than claim it can do everything.
A VM provides an execution boundary; it does not make traffic invisible. No
undetectability guarantee or stealth feature is part of this plan.

Performance targets require measurements. Neither TypeScript nor Rust alone
determines model latency, tool duration or complete application memory use.

## References to study

- PentAGI: specialist delegation, bounded tool loops and persistent task context.
- Strix: combined source/runtime assessments and reproducible validation.
- numasec: operation state, runbooks, evidence and finding lifecycle.
- Interpreter Workstation: separation of interface and execution backend.
- HexStrike: selected tool adapter patterns, subject to code review.

These are design references, not dependencies or instructions to import their
code. Review licenses before copying implementation. Rewrite security prompts
for real environment capabilities; do not copy blanket preauthorization or
Docker assumptions.

## Next step

Review this plan, then implement the connection/job vertical slice described in
DELIVERY.md when authorized. No model probes, package installs, schema migrations,
VM setup or deployment are authorized by this document itself.
