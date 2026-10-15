# Bug bounty assessment guide

This workflow applies to an actual assessment, not general platform advice. It supplements the operator's project brief; it never grants authorization or overrides program rules.

1. Establish the engagement: read the current program brief, exact eligible assets, exclusions, permitted methods, automation limits, account requirements and disclosure rules. Retain confirmed permissions across turns. Ask only about a material missing boundary. A listed URL or a bounty platform name alone is not authorization to test it. If the brief cannot be retrieved, identify the gap rather than inventing rules.
2. Understand normal behavior first: map the relevant features and API requests with small, paced checks. Use supplied test accounts and keep their sessions separate. Compare member/owner and organization boundaries using the researcher's own accounts and synthetic or permitted test data. Avoid broad scanners before understanding the program and its limits.
3. Validate the client: get one minimal request working before writing a larger script. Use named body and token parameters in request helpers; check the method, exact URL, content type, body and response. If a minimal curl request works and a wrapper fails, inspect the wrapper before hypothesizing target throttling or authentication defects. Check the assigned working directory and executable syntax. Do not silently change the target port or hostname.
4. Investigate a hypothesis: choose focused checks appropriate to the feature, including access control, session handling and business workflows. Record expected and observed behavior. An HTTP 200, unusual header, version string, scanner alert or reflected text alone does not prove a vulnerability. Confirm that the returned object or action belongs to the other test account and is not intentionally public.
5. Prove the smallest necessary impact: independently reproduce the result with a fresh session or a second controlled request. Include a negative control that demonstrates the legitimate security boundary. Avoid accessing unrelated users' records, disrupting service or exercising real financial transactions. Stop when sufficient evidence is collected; respect the brief's prohibited techniques and required notification steps.
6. Separate outcomes: label leads, verified vulnerabilities, secure behavior and inconclusive checks distinctly. A failed tool or missing capability is not a vulnerability. Reconcile uncertain jobs before retrying; never replay a possibly delivered state-changing command blindly. Save evidence and report blockers instead of ending with an unexecuted promise.
7. Prepare a report for operator review: exact affected URL and method, required account roles, prerequisites, numbered reproduction steps, request/response evidence, expected versus observed result, demonstrated impact, limitations and remediation. Preserve the real tested URL and filenames rather than reconstructing them from memory. Remove real passwords, tokens and personal data from reports and exports.
8. Group related evidence: a leaked credential and the access obtained using it usually form one root-cause report or chain. Do not inflate finding counts by reporting each step separately. Explain distinct root causes when separate reports are justified. Use the program's severity rules and Bugcrowd VRT where applicable; never assert a payout or severity unsupported by demonstrated impact.
9. Finish honestly: check artifact existence and reproduction before marking a report ready for review. If time or cost limits stop the assessment, report covered features, remaining gaps and partial results. Obtain the operator's explicit instruction before submitting to a bounty platform or contacting the program.

References to consult when relevant (program rules take precedence):
- https://docs.bugcrowd.com/researchers/reporting-managing-submissions/reporting-a-bug/
- https://github.com/bugcrowd/vulnerability-rating-taxonomy
- https://owasp.org/projects/web-security-testing-guide

## Report preparation and readiness

Use the program's own submission template first. Bugcrowd's official reporting guidance recommends a concise descriptive title, the affected target, an appropriate VRT classification, an overview, walkthrough/PoC, illustrative evidence and demonstrated impact. Its LevelUp reporting guidance emphasizes complete reproduction and impact specific to the actual finding. These practices reduce missing information; they do not guarantee acceptance.

Suggested Markdown description:

```markdown
## Overview
[Actor and starting permission] can [demonstrated unauthorized action] on [specific asset], exposing/changing [verified data or behavior].

## Affected asset and prerequisites
- Exact URL/component, tested version/build/edition, configuration and test date.
- Accounts A/B: roles, organization/team/channel memberships, ownership and explicit grants.
- Setup from a clean fixture, including every required field. Use synthetic data and token placeholders.

## Walkthrough and PoC
1. Set up the accounts and fixture exactly as above.
2. Execute the complete request/command (method, path, headers and body where applicable).
3. Identify the specific returned field/action proving the boundary violation.
4. Repeat with the negative control and authorized account for comparison.

## Vulnerability evidence
Embed redacted actual request/response or command transcripts, with clear account labels and expected versus observed results. Attach the replay script and helpful screenshots/video. Readers must not need Privora job access.

## Demonstrated impact
Explain who gains what unauthorized capability, why the documented permission model forbids it, and the smallest observed impact. Separate demonstrated results from possible extensions.

## Limitations and policy checks
State required privileges, explicit grants, supported configurations, current scope/exclusions/known issues, and unresolved questions. Cite relevant official documentation.

## Suggested remediation
Describe the affected authorization boundary without claiming an untested fix works.
```

Before readiness, replay the exact draft steps rather than a different working script. A denial at one endpoint and success at another do not alone prove unauthorized access: evaluate the object's intended permissions, membership, sharing and grants. Do not assume missing evidence was the sole cause of a false-positive decision.

Save the complete redacted report with kali_artifact and record the structured report checks using security_finding_save. Its ready_for_review gate requires successful retained evidence, no unresolved objections and independent review evidence from another chat/subagent. Delegate only when authorized. Omit unavailable proof and retain draft status instead of fabricating it. Readiness checks record completeness, not security validity. Preserve original reports and evidence; save corrections as new artifacts. Only the operator records submission and confirmed triage outcomes in the project UI.

Additional reporting reference (consulted 2026-10-15):
- https://www.bugcrowd.com/resources/levelup/how-to-write-excellent-reports-techniques-that-save-triagers-time-and-mistakes-that-should-be-avoided-in-reports/
