/**
 * Collaborative Drops: one Thought Drop written by up to four people. The owner writes the opening and invites
 * people they are connected with; each person who accepts adds one line; the owner publishes. Limits are chosen so
 * the finished drop always fits a normal Thought Drop (500 characters) and goes through the normal posting path.
 */
export const COLLAB_RULES = { openingMax: 160, lineMax: 80, maxCollaborators: 3, maxOpenDrafts: 5 } as const;
export type CollabStatus = 'draft' | 'published' | 'cancelled';
export type CollabMemberStatus = 'invited' | 'accepted' | 'declined' | 'removed';

/** The finished text: opening, each accepted line that has words, then a credit naming who wrote with the owner. */
export function composeCollab(opening: string, lines: { name: string; text: string }[]): string {
  const written = lines.filter((l) => l.text.trim());
  const names = written.map((l) => l.name.trim().slice(0, 20));
  const credit = names.length ? `— with ${names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`}` : '';
  return [opening.trim(), ...written.map((l) => l.text.trim()), credit].filter(Boolean).join('\n');
}
