/**
 * Layout for the compatibility visualiser (three/bridges.tsx and its flat fallback). Each dimension is a bridge
 * from you (left) to the other person (right). Bridges fan out around the line between you in a fixed order, so
 * the picture never changes between visits; thickness and brightness come only from that dimension's score.
 */
export interface Bridge { key: string; label: string; score: number }

export interface PlacedBridge extends Bridge {
  /** 0…1, from the 0–100 score. */
  strength: number;
  width: number;
  from: [number, number, number];
  to: [number, number, number];
  control: [number, number, number];
  /** Fan angle around the line between you, in radians (0 = straight up). */
  fan: number;
}

export const BRIDGE_END = 2.6;
const HEIGHT = 2.5;

export function bridgeLayout(bridges: Bridge[]): PlacedBridge[] {
  const n = bridges.length;
  return bridges.map((b, i) => {
    const strength = Math.max(0, Math.min(100, b.score)) / 100;
    // Spread across ±70° above and below the line; one bridge goes straight over the top.
    const fan = n === 1 ? 0 : -1.22 + (2.44 * i) / (n - 1);
    return {
      ...b, strength, fan,
      width: 0.015 + 0.06 * strength,
      from: [-BRIDGE_END, 0, 0], to: [BRIDGE_END, 0, 0],
      // Every bridge gets its own height (seen from the front, mirrored angles would otherwise overlap).
      control: [0, HEIGHT * (n === 1 ? 1 : 0.35 + (0.85 * i) / (n - 1)), Math.sin(fan) * 1.6],
    };
  });
}

/** Plain-language strength for a 0–100 dimension score. */
export function bridgeWord(score: number): string {
  if (score >= 75) return 'a strong bridge';
  if (score >= 58) return 'a steady bridge';
  if (score >= 42) return 'a mixed bridge';
  if (score >= 25) return 'a stretch';
  return 'a real stretch';
}
