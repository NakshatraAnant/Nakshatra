/** Layout for the game hub (three/hub.tsx and its flat fallback): one ring, grouped by category. */
export interface HubGame { key: string; name: string; category: string; color: string; live: number }

export const HUB_RADIUS = 4.2;
const TAU = Math.PI * 2;

export function hubAngles(games: HubGame[]): number[] {
  // A small gap between categories so groups read as groups.
  const cats = [...new Set(games.map((g) => g.category))];
  const gaps = cats.length > 1 ? cats.length : 0;
  const slots = games.length + gaps * 0.8;
  let pos = 0;
  let prev: string | null = null;
  return games.map((g) => {
    if (prev !== null && g.category !== prev) pos += 0.8;
    prev = g.category;
    const a = (pos / slots) * TAU;
    pos += 1;
    return a;
  });
}
