# Production audit, 24 November 2026

Scope: server core, sign-in, privacy, posts, circles, messages, games, payments, scheduler, uploads, web session handling and deployment were read line by line. Every API route (300+) was also sent hostile input automatically. Astrology engine, bonds, dating, matchmaking, experts, learning, weddings, ads, partners and organisations were covered only by that hostile-input run and the existing tests.

Regression tests: `tests/integration/production-audit.test.ts` and `tests/integration/robustness.test.ts`.

## Fixed

### Privacy
| Problem | Fix |
|---|---|
| Circle moderators could see who was behind a pen-name post | Dashboard and log show the pen name only, no account |
| Expired stories and temporary posts still appeared in search | Filtered |
| Tier-only channel posts were readable through the group endpoint | Same channel rules as the feed |
| Blocked people's posts showed in circle and group feeds | Filtered both ways |
| Private groups' events and join links were visible to non-members | Members only; links only for people who said they are coming |
| A member could attach a public post to any circle by id | Group is stored only for group posts by members |
| Uploaded photos kept GPS position | Location and other metadata removed; photo orientation kept |
| Account deletion left past data exports, old profile values, stored emails, staff roles and mood check-ins | Deleted |
| Data exports and undeliverable emails were kept forever | Removed after 7 days |
| Logs held one-time links, searches and query parameters | Redacted |
| API answers could be cached by browsers | `no-store` by default |
| Signing in as someone else could show the previous person's cached data | Cache cleared on sign-in |

### Security and money
| Problem | Fix |
|---|---|
| Two simultaneous approvals could refund twice | Claimed atomically |
| Simultaneous requests could exceed the refundable balance | Payment row locked |
| Repeating a refund request failed instead of returning the first | Checked first |
| Razorpay: one declined attempt cancelled the order, so a successful retry was refunded | Order stays open until it expires |
| A payment of the wrong amount would have been fulfilled | Refused and audited |
| Cancelling an order could race with its payment | Guarded |
| Refunding a membership left it active | Access ends on full refund |
| Two tickets for one event could both be charged | The second is refunded, the place kept |
| Other reset links stayed valid after a password change | Cancelled |
| Moderators could suspend admins through a report | Blocked |
| `/\host` links counted as same-site after sign-in | Refused |

### Reliability
| Problem | Fix |
|---|---|
| A dropped idle database connection could end the process | Handled |
| Requests waited forever when the database was unreachable | 10-second limit |
| Health check said OK with the database down | 503 |
| One failing scheduled job stopped the rest; passes could overlap | Isolated; no overlap; clean shutdown |
| Blocking or muting an account that no longer exists, empty edits, bad cursors and NUL characters caused server errors | 4xx answers |
| Old tabs broke after a deploy | Missing files are 404 and the page reloads once |
| Server unreachable looked like being signed out | Retry screen |
| After one offline moment, saving stayed broken until a reload | Security token is fetched again |
| `$&` in a display name corrupted link previews | Fixed |
| Production could start with links pointing at localhost | `APP_ORIGIN` (or Render's URL) is required |

### Everyday bugs
- The third photo or voice post without text in a day was refused as a repeat.
- Messaging someone you already had a conversation with dropped the message.
- A game stalled when its host left.
- A full event refused its own guests; reminders ignored a changed RSVP.
- `?unread=false` was treated as true; `%` in search matched everything; quiet hours accepted 99:99; emails with a stray space were refused.
- Collaborative Drops shared one rate limit between all members.

## Not fixed: needs an owner decision
1. **"Connections" visibility.** Following a public profile makes the follower a "connection" straight away, which opens connection-only fields and skips message requests. This is the documented rule, but it is weaker than the name suggests. Requiring a mutual follow would change visible behaviour.
2. **`drizzle-kit` advisories** (4, moderate, development tool only). npm's only fix is a breaking change. Production dependencies have none.

## Needs the owner
Supabase database, SMTP account, domain, Razorpay keys, legal review, an independent penetration test, and a run of the suite on real PostgreSQL (`TEST_DATABASE_URL`). Tests here use embedded PostgreSQL, which cannot prove behaviour under real concurrency.

## Deployment note
`APP_SECRET` encrypts journals and two-step secrets. Changing or losing it makes them unreadable, so keep a copy outside Render.
