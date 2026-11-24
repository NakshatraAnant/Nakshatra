import { sql, type SQL } from 'drizzle-orm';
import * as s from '../db/schema';

/**
 * Event privacy. An event attached to a circle or to a private group is visible only to that group's
 * active members (and its host). Public community-group events and events without a group are visible
 * to every signed-in member. The same rule gates listing, search, detail, RSVP and attendance.
 */
export function eventVisibleSql(viewerId: string): SQL {
  return sql`(${s.events.groupId} is null
    or ${s.events.hostId} = ${viewerId}
    or exists (select 1 from groups g where g.id = ${s.events.groupId} and g.kind <> 'circle' and g.visibility = 'public' and g.archived_at is null)
    or exists (select 1 from group_members gm where gm.group_id = ${s.events.groupId} and gm.user_id = ${viewerId} and gm.status = 'active'))`;
}
