import { describe, expect, it } from 'vitest';
import { ACCENTS, DEFAULT_APPEARANCE, SURFACES, appearanceVars, contrast, normaliseAppearance, type Scheme } from './appearance';

describe('theme studio presets', () => {
  it('computes WCAG contrast like the reference values', () => {
    expect(contrast('#000000', '#ffffff')).toBeCloseTo(21, 0);
    expect(contrast('#777777', '#ffffff')).toBeCloseTo(4.48, 1);
  });

  for (const a of ACCENTS) for (const scheme of ['dark', 'light'] as Scheme[]) {
    it(`${a.label} stays readable in ${scheme}`, () => {
      const t = a[scheme];
      // Accent used as link / label text on every surface, and button text on accent fills.
      for (const bg of SURFACES[scheme]) {
        expect(contrast(t.accent, bg), `${t.accent} on ${bg}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(t.strong, bg), `${t.strong} on ${bg}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(t.ink, t.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.ink, t.strong)).toBeGreaterThanOrEqual(4.5);
    });
  }

  it('falls back to defaults for unknown or missing values', () => {
    expect(normaliseAppearance(null)).toEqual(DEFAULT_APPEARANCE);
    expect(normaliseAppearance({ accent: 'neon', textSize: 'large', corners: 3, extra: 'x' })).toEqual({ accent: 'ember', textSize: 'large', corners: 'soft' });
  });

  it('produces the CSS variables for a scheme', () => {
    const v = appearanceVars({ accent: 'jade', textSize: 'larger', corners: 'crisp' }, 'light');
    expect(v).toMatchObject({ '--accent': '#22603f', '--radius-sm': '4px', 'font-size': '125%' });
    expect(appearanceVars(DEFAULT_APPEARANCE, 'dark')['--accent']).toBe('#f38c48');
  });
});
