# Security workspace architecture

Status: proposed. This document defines intended contracts, not implemented APIs.

## Existing foundation

Privora Desktop uses Electron, React, TypeScript, Vite and Electron Forge.
SQLite metadata and artifact files provide local persistence. The main process
owns agent execution and tools; the context-isolated preload exposes validated
IPC to the renderer. Existing modules include turn coordination, provider
streaming, terminal sessions, browser/computer tools, approvals and recovery.

The first implementation keeps those boundaries. No separate provider loop is
introduced for Security workspaces. Rust is optional future work for a measured
bottleneck or a specific native capability.

## Proposed topology

```mermaid
flowchart TB
    User[Task and attached context] --> UI[Existing Privora chat]
    UI --> IPC[Validated Electron IPC]
    IPC --> Runtime[Existing agent runtime]
    Runtime --> Context[Project objective, scope and history]
    Runtime --> Model[OpenCode Go model adapter]
    Model --> Runtime
    Runtime --> Policy[Tool routing and execution policy]
    Policy --> Local[Trusted local workspace adapter]
    Policy --> Connector[Remote environment connector]
    Connector --> SSH[Authenticated SSH transport]
    SSH --> Runner[Job runner inside Kali VM]
    Runner --> Tools[Installed tools and task files]
    Runner --> Events[Job state and sequenced output]
    Local --> Events
    Events --> Runtime
    Events --> UI
    Events --> Store[SQLite metadata and artifact files]
    Store --> Context
    Store --> Findings[Findings and verification evidence]
    Findings --> UI
```

Future adapters may connect Windows test environments, browsers inside the test
environment, Android devices/emulators and dedicated Linux machines. Local
Privora browser/computer tools operate on the host today: do not silently treat
them as remote VM tools.

## Agent behavior

Loop: understand objective → discover capabilities → plan → execute → inspect
evidence → adjust → verify → report.

The prompt is assembled from base Privora instructions, Security workspace
instructions, current environment capabilities and optional specialist roles.
The model proposes actions; execution policy enforces their allowed environment
and permissions. Plan Mode remains non-mutating.

The user selects the main model. Proposed specialist defaults are DeepSeek
V4.1 Flash for coordination/research, GLM 5.3 Flash for security analysis and
Muse Spark 1.3 Contributor for coding. Roles remain configurable; delegation is
optional and does not require all models on every turn. Privora's existing
Reviewer Swarm is a distinct feature, not silently repurposed as security delegation.

Reuse the existing OpenCode Go adapter. Verify exact model IDs, tool support,
routes and reasoning levels before exposing defaults. Never infer every model's
capabilities from its family name or force unsupported `none` reasoning.

## Environment boundary

Every execution job identifies its environment. Security work initially uses
the selected remote environment; there is no automatic fallback to local Windows
execution. Local attachment import, artifact preview and metadata storage remain
explicit app operations. Model-facing local file/terminal/browser/computer access
must follow declared permissions independently of remote access.

Use SSH with pinned/verified host identity and protected credential references.
Do not expose the runner publicly or disable host verification. Start with one
environment and one transport, avoiding a general plugin platform initially.

The Kali VM has no default shares of personal host folders. Transfer approved
project files into a project-specific directory. Use a regular execution user;
privileged setup is separate. Bound jobs, process output, disk use and duration.
Network egress restrictions must be enforced outside untrusted job control where
practical. NAT, a prompt, or a hostname allowlist alone is not scope enforcement.
Account for redirects, DNS changes, IPv6 and infrastructure dependencies in the
scope design before promising network containment.

Remote tool output, filenames and documents are untrusted data. They cannot
authorize commands, expand scope or change application permissions. Redact secrets
before logs and model context; keep API credentials on Privora's side.

## Runner and connector contracts

The runner can initially use TypeScript/Node. Deploy a versioned runner explicitly;
do not pretend the VM has zero dependencies. Define a version handshake and an
environment capability inventory before submitting jobs.

Minimum operations:

- Discover tools, OS/architecture and supported execution capabilities.
- Submit a job with a client-generated idempotency key, argv, cwd and timeout.
- Inspect job state and read output after a sequence cursor.
- Cancel the process group and report confirmed termination.
- Transfer and retrieve bounded artifacts within the project directory.

Prefer structured argv; explicit shell jobs require their own policy. Validate
paths against traversal and symlink escape. An SSH disconnect is not proof that
a process stopped. Retain job IDs and reconnect for state reconciliation. Decide
per job whether it survives transport loss; show unknown state until confirmed.
Never automatically replay a possibly mutating job after uncertain delivery.

Job states: queued, running, stop_requested, succeeded, failed, cancelled,
timed_out. Environment connectivity and unknown job state are separate fields.
Persist ordered events for reconnect; live delivery alone is not the source of truth.

## Proposed data model

| Record | Core fields |
| --- | --- |
| Workspace | id, type: development/security, name |
| Project context | workspaceId, objective, scope, allowedEnvironmentIds |
| Environment | id, name, OS, architecture, transport, credentialRef, capabilities, connectionState |
| Run | id, threadId, project context snapshot, model, plan, status, budget, timestamps |
| Job | id, runId, environmentId, idempotencyKey, argv/shell specification, cwd, timeout, state, exitCode |
| Event | id, sequence, runId/jobId, type, timestamp, payload or artifactRef |
| Artifact | id, jobId, relative storage path, mediaType, size, hash, redaction status |
| Finding | id, workspaceId, claim, affected asset, severity rationale, state, evidenceRefs, reproduction, retestRefs |
| Secret reference | id pointing to protected secret storage; no plaintext secret in ordinary records |

Use additive migrations after inspecting existing tables. Reuse thread, run, tool
and artifact identifiers where their meaning matches; avoid duplicate chat/event
stores. Keep large output outside SQLite payloads and renderer IPC snapshots.

Finding states: candidate → observed → verified → reportable, plus rejected/stale.
Verification records the actual environment, procedure, result and limitations.
Tool exit success or an AI assertion alone does not establish a vulnerability.
