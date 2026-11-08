# OnBrand Round 2 evaluation

## Automated deterministic regression set

Run `npm run test`. The current set has ten deterministic checks grouped around these expected behaviors:

| Evaluation case | Expected result |
| --- | --- |
| Seeded review baseline | Supported claims, a contradicted claim and an equal-authority conflict are surfaced |
| Evidence omission | Claim is labelled `NO_APPROVED_EVIDENCE`; explanation says unverified, not false |
| Prompt injection in submitted copy | Claim is labelled `NEEDS_HUMAN` and blocks approval |
| Contradictory sources | Higher-authority active evidence takes precedence; lower authority does not create a tie |
| Source version precedence | A newer version wins when authority and effective date match |
| Finite validity periods | Equal-precedence sources still conflict when both are within their effective dates |
| Finding offsets | Each reported span maps back to the exact claim text in the reviewed draft |
| Suggested revision | Candidate is accepted only after a fresh complete review and cannot pass if it remains blocking |
| Knowledge snapshot change | Changing an approved fact changes the report snapshot and invalidates a prior decision |
| HTML accessibility sample | Missing image alternative, heading jump, vague link, missing document language and low inline contrast are found |

**Latest run:** 10/10 automated checks passed on the synthetic seed dataset on 8 Nov 2026. These are builder-authored regression checks, not an independently labelled benchmark and not a claim of real-world accuracy.

## Manual workflow observations

- Review produced claim-level supported, source-conflict and contradicted statuses with source quotes.
- A risky suggestion was rechecked, applied as a new draft version and reported as supported.
- Review comments could be added and resolved.
- Approval remained disabled while a blocking conflict remained.
- Prompt-injection text was reported as `NEEDS_HUMAN` and treated as untrusted content.
- The demo title, navigation and workspace identify the product as **OnBrand**; Sample Foods is labelled synthetic client data.
- The deployed preview returned a seven-claim report: five supported claims, one same-authority source conflict and one contradicted policy claim. The two high-severity findings remain unresolved and block approval.
- A temporary public preview is available at [OnBrand](https://indices-cradle-thirty-quarter.trycloudflare.com). It stops when the tunnel or demo host stops and is not a production deployment.

## Targets for a larger labelled set

These are targets for future benchmark data, not current measured results:

| Measure | Target |
| --- | ---: |
| Exact citation/source quote validity | 100% |
| Finding span alignment | 100% |
| Seeded expected status agreement | 100% |
| False automatic approvals on seeded blocking cases | 0 |
| Human-review routing for prompt-injection cases | 100% |
| Reviewer agreement with evidence statuses on a labelled domain set | ≥90% |

Before claiming benchmark accuracy, assemble a domain-labelled set with approved source snapshots, draft claims, expected statuses and adjudicated conflict outcomes; report per-status precision/recall and false-approval rate. Review cases that miss targets and update rules/retrieval before release.

The planned 20-draft development set, the B0 single-model baseline, independent labels, tenant-isolation tests and model fault-injection results are not yet complete. The ten checks above verify deterministic prototype behaviors only. No user-interview or reviewer-study results are claimed.

## Boundaries

Tenant-isolation tests, authenticated role enforcement, concurrent multi-user persistence, provider-failure simulation and production-scale latency remain unverified because the current demo has no connected database, verified identity provider or model key. The UI role switch and localStorage are demonstration features, not production security controls. Add those tests when the corresponding server-side services are connected.
