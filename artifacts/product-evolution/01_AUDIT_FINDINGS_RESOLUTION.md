# 01 — Audit Findings Resolution

Source: `artifacts/audit/13_PRIORITISED_RECOMMENDATIONS.md` and `18_SECURITY_FINDINGS_REGISTER.csv`. Evidence for every "tested" row is in `10_TEST_EXECUTION_RESULTS.md`.

## P0 (release blockers)

| ID | Resolution | Status |
|---|---|---|
| SEC-01 mute list unmasks pen names | New `pen_mutes` table; muting from a pen-name post stores the pen-name snapshot and is listed only by pen name with an opaque per-viewer HMAC reference (`DELETE /api/v1/pen-mutes/:ref`). Pen-name mutes hide only pen-name posts; real-name mutes hide only real-name posts, so muting can't be used to infer authorship. | Implemented & tested |
| SEC-02 own replies unmask author | `comments.as_pseudonym`; author replies in their own pen-name thread are serialised as `{ pseudonym, isPostAuthor }` everywhere (`serializeComments`), including the create response. | Implemented & tested |
| SEC-03 game author leak | `publicRound` drops `excludeId` when a round hides an author; `waitingOn` is false for every player in those rounds; only aggregate counts remain. Server still enforces the exclusion. Test asserts the author id is absent from the round outside the legitimate vote options. | Implemented & tested |
| SEC-04 private circle events | One SQL visibility rule (`services/events.ts`) applied to list, RSVP, search; host-only attendees unchanged. | Implemented & tested |
| SEC-08 legacy modules live | Central module registry + request-hook enforcement + launch scope (legacy off once per DB, reversible in Admin → Flags) + module-aware nav/page gates + catalogue filtered to identity offers. | Implemented & tested |
| QA-01 ineffective privacy tests | 15 new regression tests assert absence of id/handle/display name in non-author responses. | Implemented |

## P1

| ID | Resolution | Status |
|---|---|---|
| SEC-05 MFA | Setup refused while enabled; disable requires password + current code, revokes other sessions, audits failures, notifies. | Implemented & tested |
| SEC-06 pen-name visibility model | Post-level visibility policy; following mode excludes others' pen-name posts; search consistent. | Implemented & tested |
| SEC-07 plaintext tokens in outbox | Retention job blanks delivered SMTP bodies after 24 h, deletes dev-mailbox mail after 7 days, old tokens and sessions. | Implemented & tested |
| SEC-09 dev mailbox | Loopback-only. Correction: `docker-compose.yml` already binds `127.0.0.1:4000`, so the audit overstated exposure. | Implemented |
| PRD-01 navigation | Labs/legacy hidden by module state; search placeholder and cart updated; shop shows "Identity extras". | Implemented, browser-verified |
| PRD-02 unbuyable offers | Preview mode when payments are off: buy buttons disabled with explanation; cart hidden. | Implemented, browser-verified |
| DEF-01/02 gifts | `gift_claims` workflow (verified-email claim, auto-claim on verification, expiry, refunds, idempotent per order item); reports generated in a savepoint or later from Library. | Implemented & tested (simulator) |
| DEF-05 late payment | `cancelled → succeeded` allowed; order handler files an automatic refund request and notifies. | Implemented & tested (orders) |
| DEF-04 scoring | quality-v1 flags (straight-lined, near-centre, low-variance, patterned, inconsistent, incomplete); `inconclusive` confidence; UI guidance; inconclusive results not shareable. | Implemented & tested |
| DEP-04 SMTP | Needs a provider account. | Blocked (external) |
| DEP-07 CI | Not created (no remote CI platform configured; would be a new workflow file). | Deferred |
| DEP-12 legal | Rewritten for the current product, marked as draft for legal review. | Implemented; contact address missing |

## P2 / P3

| ID | Resolution | Status |
|---|---|---|
| PRD-03 share loop | Share link from preview and Studio, attribution, view/signup counts, revocation. | Implemented & tested |
| PRD-04 public posts | Fixed (see SEC-06). | Implemented & tested |
| PRD-05 analytics gaps | Added: `email_verified`, `identity_share_*`, `preview_signup_clicked` (defined; not yet emitted by UI), `quest_claimed`, `season_reward_claimed`, `vibe_checked_in`, `gift_claimed`, `game_rematch`. Still missing: UTM/acquisition source, assessment step drop-off, `offer_viewed` emission. | Partially implemented |
| PRD-06 re-engagement | No email digest/push. | Deferred |
| PRD-07 link previews | Server-rendered meta, absolute URLs, escaped. OG image size unchanged. | Implemented & tested (size deferred) |
| SEC-10 live URL gating | Covered by SEC-04 visibility. | Implemented |
| SEC-11 signup enumeration | Accepted risk, documented. | Deferred |
| SEC-12 pen-name relabel | Snapshot column. | Implemented & tested |
| SEC-13 deletion | Uploads/blobs/disk files deleted; analytics ids nulled; shares revoked; pen mutes deleted. | Implemented |
| DEF-03 referral cap | Held referrals skip the window. | Implemented (no dedicated test) |
| DEF-10 a11y names | `aria-label` added; original finding was a tool heuristic. | Implemented |
| TD-02/03/10 | Session skip for static (done); retention (done); boot-time migrations unchanged. | Partially implemented |
| TD-11 uploads in DB | Unchanged. | Deferred |
| SEC-17 npm advisories | Not upgraded. | Deferred |
