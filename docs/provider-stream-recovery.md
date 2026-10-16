# Provider completion and retry policy

## Objective and design

A provider connection ending must not silently complete a partial answer or a
tool draft. Temporary request failures should recover within explicit limits,
without repeating delivered actions or potentially charging hosted credits twice.

The design was informed by OpenCode commit
`f09eee5002b8495bff5629bad7907a36767ab39a`, particularly its structured finish
handling and bounded, classified retry policy:

- https://github.com/anomalyco/opencode/blob/f09eee5002b8495bff5629bad7907a36767ab39a/packages/core/src/session/runner/step.ts
- https://github.com/anomalyco/opencode/blob/f09eee5002b8495bff5629bad7907a36767ab39a/packages/core/src/session/runner/retry.ts

Implementation order:

1. Normalize provider termination independently from the text it generated.
2. Apply one retry policy outside provider adapters.
3. Preserve already delivered tool results in the existing run checkpoint.
4. Show an accurate outcome and a recovery action in the existing UI.
5. Verify transport, tool-delivery, cancellation and provider-route fixtures.

## Completion

The latest provider outcome is saved on the assistant message. Outcomes distinguish
completed answers, tool calls, output limits, interruptions, incomplete requests,
refusals and provider failures. Only normalized reason codes are retained.

Chat Completions finish reasons, Responses terminal events, Messages stop reasons
and Gemini interaction status events are normalized. EOF and `[DONE]` alone do not
attest successful completion. Malformed streamed JSON and unfinished tool drafts
are not accepted as completed work. SSE readers are cancelled/released on exit.

Provider interruption, incomplete output and token limits preserve the current
checkpoint and pause with Resume available. If tools were already delivered, the
coordinator drains their existing execution and saves those results before pausing.
It does not dispatch the same tool again as part of provider recovery. Undelivered
drafts and unapproved calls are marked as not executed. Remote uncertain delivery
still requires the existing Kali job reconciliation.

A valid model finish does not establish that the user's task is complete. The
existing bounded unfinished-action heuristic remains separate; it also recognizes
the observed trailing “Extracting ...:” announcement. It is not a general semantic
proof that every promise was fulfilled.

## Retries

- At most two automatic retries per model request, after the original attempt.
- Exponential delay starts around one second, then two seconds, with 20% jitter.
- Retry eligible HTTP 408/429/500/502/503/504 responses, explicit classified stream
  capacity errors, recognized fetch transport failures, or empty missing-finish
  responses. Authentication, billing, permission and validation failures do not retry.
- Honor valid Retry-After values up to 30 seconds. Longer cooldowns are returned
  to the operator rather than shortened. No new request begins during that delay.
- Once an attempt reports text, reasoning, replacements, tool drafts/calls,
  provider context, search activity, usage, credits or refusal, it is not retried.
  A recoverable partial response is paused for an explicit Resume instead.
- Stop interrupts backoff immediately. Retries use the same cancellation signal.
- The idle-timeout watchdog also pauses after partial progress instead of starting
  another automatic model continuation. Existing recovery for a request that never
  produced progress remains bounded.
- Gemini SDK retries are disabled for interaction requests so they cannot multiply
  the outer retry allowance.
- The existing activity row shows the attempt number and delay during backoff.

The limits apply to the application's requests. An upstream proxy may implement
its own retry policy that this client cannot count or control.

## Hosted gateway compatibility

Hosted-credit requests do not automatically retry: a missing response can follow
a successful charge. Server-side idempotency is required before enabling that.

The gateway source now returns `finishReason`, but this source change is not a
deployment. Previously deployed gateways returning atomic JSON without that field
remain supported and are explicitly recorded as `legacy_gateway_response`.
That legacy response confirms RPC completion, not the model's termination reason.
The stronger hosted finish check takes effect after the gateway update is deployed.

## Validation

Fixtures cover missing/unknown finish reasons, output limits, malformed SSE,
incomplete tool arguments, protocol routes, response labels, transient failures,
Retry-After, retry exhaustion, Stop during backoff, hosted-request non-retry,
and retained delivered tool results with a resumable checkpoint.

These checks use mocked providers and isolated local stores. They do not send
target requests, rotate credentials, replay remote commands, or interrupt active
investigations. Live provider verification remains necessary after installing the
new desktop build; no claim is made that every provider outage is recoverable.
