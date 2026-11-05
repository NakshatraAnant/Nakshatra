/** What a member is open to on Discover → People. Self-chosen; never inferred from their answers. */
export const CONNECTION_INTENTS = [
  { key: 'friends', label: 'New friends' },
  { key: 'game_partners', label: 'Game partners' },
  { key: 'deep_talks', label: 'Deep conversations' },
  { key: 'circle_members', label: 'Joining a circle' },
  { key: 'study_buddies', label: 'Study or work buddies' },
  { key: 'creative', label: 'Creative collaboration' },
] as const;
export type ConnectionIntent = (typeof CONNECTION_INTENTS)[number]['key'];
export const INTENT_KEYS = CONNECTION_INTENTS.map((i) => i.key) as [ConnectionIntent, ...ConnectionIntent[]];
export const MAX_INTENTS = 3;
