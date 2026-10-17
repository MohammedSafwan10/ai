# Privora Security workspace

Status: Security workspace, agent routing, remote jobs, findings, and evidence UI
implemented and verified through the chat loop and live Muse Spark/Kali fixtures.
Packaged connection checks, evidence previews and native file saving passed.
The usable Windows portable build is verified; installer distribution and
representative assessment acceptance remain separate.
Date: 13 October 2026.

14 October 2026 update: desktop browser screenshots, evidence capture and PDF
reading are available for research; live subagent transcripts and coordination
events are implemented; reliable foreground compaction preserves task state and
evidence references. The latest compaction verification passed 650 tests (7
skipped), TypeScript and Windows packaging. Live validation of every provider
and representative assessments remain separate.

Privora Security extends the existing desktop app into a security research
workspace. It keeps the Build chat interface and connects the agent to testing
environments, tools, files and evidence. Web assessment is one workflow among
repository review, application analysis, network assessment and investigation.

## Agreed direction

- Build within Privora Desktop, using its TypeScript runtime and React/Electron UI.
- Keep Build workspaces unchanged and make Security an explicit workspace type.
- Reuse chat, model adapters, streaming, tool activity, approvals, recovery and storage.
- Add environment connectors, security task context and findings with evidence.
- No mandatory Docker, Rust rewrite, second agent runtime or standalone Dex app.
- First testing environment: Kali ARM64 VM on the user's M4 MacBook Air with 16 GB RAM.
- The operator supplied a running VM and authorized runner deployment and
  workspace integration. Models remain in Privora; Kali runs remote tools.

## Documents

- [Architecture and execution contracts](ARCHITECTURE.md)
- [Interface and streaming behavior](UI_AND_STREAMING.md)
- [Delivery stages and verification](DELIVERY.md)
- [Kali tool operations and expert workflow](KALI_OPERATIONS.md)
- [Reliable context compaction and recovery](../reliable-compaction.md)

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

## Current behavior and next checks

Create a separate Security project from the sidebar shield button, import a
private connection profile, check access, and set its objective and scope.
Existing chats, model selection, reasoning, Plan Mode, and access controls are
reused. The chat header opens jobs, output, Stop, findings, and evidence on demand.
Project-scoped PC file tools are available for local reports and files. Separate
evidence tools list verified PC copies and recycle explicitly requested collections.
Arbitrary host paths, host terminals, computer controls and browser form actions
remain blocked in Security projects. Built-in browser search, navigation and page-reading tools
are available for public research, including screenshots, evidence capture, and
PDF reading; their traffic originates on the desktop host.
Target commands and browser-automation scripts run in the assigned Kali environment.
The SSH connector is registered only for that environment. The agent may install
needed tools autonomously under the operator's authorization, verifying
passwordless sudo and installed versions rather than assuming privileges.

Verify the packaged chat-to-Kali loop and representative lab assessments before
claiming full product readiness. Physical network loss, Mac sleep, VM restart,
remote GUI/browser control, interactive PTY sessions, and hardware-dependent tools
remain separate acceptance work or future capabilities. See DELIVERY.md for the
tested foundation and outstanding checks.
