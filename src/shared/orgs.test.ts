import { describe, expect, it } from 'vitest';
import { emailOnDomain, teamComposition } from './orgs';

const v = (e: number) => ({ energy: e, compass: 0, voice: 0.5, tempo: -0.5, horizon: 0 });

describe('organisations', () => {
  it('shows nothing below five opted-in members', () => {
    expect(teamComposition([v(1), v(0.5), v(0), v(-0.5)])).toBeNull();
  });

  it('reports only averages and spread', () => {
    const t = teamComposition([v(1), v(1), v(1), v(1), v(1)])!;
    const energy = t.find((d) => d.dimension === 'energy')!;
    expect(energy).toMatchObject({ average: 1, spread: 'aligned', lean: 'Leans spark' });
    const mixed = teamComposition([v(1), v(-1), v(1), v(-1), v(0)])!.find((d) => d.dimension === 'energy')!;
    expect(mixed).toMatchObject({ average: 0, spread: 'wide' });
    expect(mixed.lean).toMatch(/^Balanced/);
    expect(JSON.stringify(t)).not.toMatch(/userId|archetype/);
  });

  it('matches email domains including subdomains', () => {
    expect(emailOnDomain('a@acme.com', 'acme.com')).toBe(true);
    expect(emailOnDomain('a@mail.acme.com', 'acme.com')).toBe(true);
    expect(emailOnDomain('a@notacme.com', 'acme.com')).toBe(false);
    expect(emailOnDomain('a@gmail.com', null)).toBe(true);
  });
});
