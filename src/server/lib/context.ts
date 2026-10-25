import type { FastifyBaseLogger } from 'fastify';
import type { AppConfig } from '../config';
import type { DB, Executor } from '../db/client';
import { analyticsEvents, auditLogs } from '../db/schema';

export interface Ctx {
  db: DB;
  config: AppConfig;
  log: FastifyBaseLogger;
}

const SENSITIVE_KEYS = /pass|token|secret|birth|dob|time|lat|lon|place|body|message|email|phone|address|card/i;

/** Strips sensitive keys so analytics never stores birth data, message bodies or contact details. */
export function sanitizeProps(props: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(props)) {
    if (SENSITIVE_KEYS.test(k)) continue;
    if (typeof v === 'string') out[k] = v.slice(0, 80);
    else if (typeof v === 'number' || typeof v === 'boolean') out[k] = v;
  }
  return out;
}

/**
 * Documented event taxonomy. `meaningful` events count toward Weekly Meaningful
 * Cosmic Users (WMCU); passive opens are not tracked as meaningful.
 */
export const EVENT_TAXONOMY: Record<string, { meaningful: boolean; description: string }> = {
  signup_started: { meaningful: false, description: 'Signup form submitted (before verification).' },
  signup_completed: { meaningful: false, description: 'Account created.' },
  cosmic_id_completed: { meaningful: true, description: 'Birth profile saved and Cosmic ID generated.' },
  chart_calculated: { meaningful: true, description: 'A chart was calculated.' },
  chart_explored: { meaningful: true, description: 'User opened a chart detail panel.' },
  briefing_viewed: { meaningful: false, description: 'Daily briefing loaded.' },
  insight_saved: { meaningful: true, description: 'Interpretation saved to history.' },
  reflection_written: { meaningful: true, description: 'Reflection or intention saved.' },
  ritual_completed: { meaningful: true, description: 'Daily ritual marked complete.' },
  profile_shared: { meaningful: true, description: 'Share link/card generated.' },
  bond_created: { meaningful: true, description: 'Bond created.' },
  bond_invitation_sent: { meaningful: true, description: 'Bond invitation sent.' },
  invitation_accepted: { meaningful: true, description: 'Bond invitation accepted.' },
  compatibility_viewed: { meaningful: true, description: 'Compatibility report opened.' },
  post_created: { meaningful: true, description: 'Post published.' },
  comment_created: { meaningful: true, description: 'Comment published.' },
  message_sent: { meaningful: true, description: 'Message sent (no content recorded).' },
  lesson_completed: { meaningful: true, description: 'Lesson completed.' },
  quiz_passed: { meaningful: true, description: 'Quiz passed.' },
  course_enrolled: { meaningful: true, description: 'Course enrollment.' },
  challenge_completed: { meaningful: true, description: 'Challenge completed.' },
  achievement_unlocked: { meaningful: false, description: 'Achievement awarded.' },
  dating_profile_created: { meaningful: true, description: 'Dating profile created.' },
  dating_match_created: { meaningful: true, description: 'Mutual dating match.' },
  mm_connect_requested: { meaningful: true, description: 'Matchmaking connect request.' },
  subscription_started: { meaningful: true, description: 'Subscription activated.' },
  subscription_renewed: { meaningful: false, description: 'Subscription renewed.' },
  booking_created: { meaningful: true, description: 'Expert booking created.' },
  consultation_completed: { meaningful: true, description: 'Consultation completed.' },
  checkout_started: { meaningful: false, description: 'Checkout initiated.' },
  product_ordered: { meaningful: true, description: 'Order paid.' },
  wedding_project_created: { meaningful: true, description: 'Wedding project created.' },
  wedding_inquiry_created: { meaningful: true, description: 'Vendor inquiry created.' },
  landing_viewed: { meaningful: false, description: 'Public landing page viewed (anonymous, no identifiers).' },
  cosmic_id_previewed: { meaningful: false, description: 'Account-free Cosmic ID calculated (anonymous; only whether a birth time was given).' },
  cosmic_id_card_downloaded: { meaningful: false, description: 'Share card downloaded from the account-free preview (anonymous).' },
  cosmic_id_preview_signup_clicked: { meaningful: false, description: 'Save-my-Cosmic-ID clicked on the preview (anonymous).' },
  cosmic_id_shared: { meaningful: true, description: 'Signed-in user downloaded or shared a Cosmic ID card.' },
  personality_preview_completed: { meaningful: false, description: 'Account-free personality preview scored (anonymous; nothing stored).' },
  assessment_completed: { meaningful: true, description: 'Personality assessment completed and saved.' },
  first_meaningful_action: { meaningful: true, description: 'First qualifying social action by a member (Thought Drop, ritual answer, game round or circle join).' },
  circle_created: { meaningful: true, description: 'Circle created.' },
  circle_invite_created: { meaningful: false, description: 'Circle invite link created.' },
  circle_invite_accepted: { meaningful: true, description: 'Circle invite accepted (new member joined).' },
  circle_activated: { meaningful: true, description: 'Circle reached three contributing members.' },
  game_started: { meaningful: true, description: 'Game session started.' },
  game_round_played: { meaningful: true, description: 'Player submitted in a game round (no content recorded).' },
  game_completed: { meaningful: true, description: 'Game session completed.' },
  ritual_responded: { meaningful: true, description: 'Social ritual answered (no answer content recorded).' },
  referral_approved: { meaningful: false, description: 'Referral approved after activation.' },
  offer_viewed: { meaningful: false, description: 'Paid offer page viewed.' },
  block_applied: { meaningful: false, description: 'User blocked or muted someone.' },
  report_submitted: { meaningful: false, description: 'Content or profile reported.' },
  account_deleted: { meaningful: false, description: 'Account deleted.' },
  client_error: { meaningful: false, description: 'Client-side error report.' },
};

export async function track(db: Executor, userId: string | null, name: keyof typeof EVENT_TAXONOMY, props: Record<string, unknown> = {}) {
  const def = EVENT_TAXONOMY[name];
  await db.insert(analyticsEvents).values({ userId, name, props: sanitizeProps(props), meaningful: def?.meaningful ?? false });
}

export async function audit(db: Executor, entry: { actorId: string | null; action: string; targetType?: string; targetId?: string; meta?: Record<string, unknown>; ip?: string }) {
  await db.insert(auditLogs).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId,
    meta: sanitizeAuditMeta(entry.meta ?? {}),
    ip: entry.ip,
  });
}

function sanitizeAuditMeta(meta: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) out[k] = /pass|token|secret/i.test(k) ? '[redacted]' : v;
  return out;
}
