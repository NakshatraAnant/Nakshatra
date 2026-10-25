import { mulberry32 } from './random';

export interface GraphNode { id: string; label: string; self: boolean; external: boolean }
export interface GraphEdge { id: string; source: string; target: string; kind: string; status: string }

export const BOND_COLORS: Record<string, string> = {
  friend: '#6fa8dc', romantic: '#c98a96', dating: '#c98a96', partner: '#e07a8a', spouse: '#e07a8a', sibling: '#7fb69a', parent_child: '#7fb69a',
  family: '#7fb69a', colleague: '#d9b26f', business: '#d9b26f', custom: '#b9adf0',
};

/** Deterministic force-directed layout (spring + repulsion), computed once per graph. */
export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], dims = 3): Map<string, [number, number, number]> {
  const rand = mulberry32(nodes.length * 97 + edges.length);
  const pos = new Map<string, number[]>();
  nodes.forEach((n, i) => pos.set(n.id, n.self ? [0, 0, 0] : [Math.cos(i * 2.4) * 3, Math.sin(i * 2.4) * 3, dims === 3 ? (rand() - 0.5) * 2 : 0]));
  for (let iter = 0; iter < 200; iter++) {
    const force = new Map<string, number[]>(nodes.map((n) => [n.id, [0, 0, 0]]));
    for (const a of nodes) for (const b of nodes) {
      if (a.id >= b.id) continue;
      const pa = pos.get(a.id)!;
      const pb = pos.get(b.id)!;
      const d = [pa[0] - pb[0], pa[1] - pb[1], pa[2] - pb[2]];
      const dist = Math.max(0.3, Math.hypot(...d));
      const rep = 2.2 / (dist * dist);
      for (let k = 0; k < 3; k++) { force.get(a.id)![k] += (d[k] / dist) * rep; force.get(b.id)![k] -= (d[k] / dist) * rep; }
    }
    for (const e of edges) {
      const pa = pos.get(e.source);
      const pb = pos.get(e.target);
      if (!pa || !pb) continue;
      const d = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
      const dist = Math.max(0.01, Math.hypot(...d));
      const spring = (dist - 2.6) * 0.06;
      for (let k = 0; k < 3; k++) { force.get(e.source)![k] += (d[k] / dist) * spring; force.get(e.target)![k] -= (d[k] / dist) * spring; }
    }
    for (const n of nodes) {
      if (n.self) continue;
      const p = pos.get(n.id)!;
      const f = force.get(n.id)!;
      for (let k = 0; k < dims; k++) p[k] += Math.max(-0.3, Math.min(0.3, f[k]));
    }
  }
  return new Map([...pos].map(([k, v]) => [k, [v[0], v[1], v[2]] as [number, number, number]]));
}

