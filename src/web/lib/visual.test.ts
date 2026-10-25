import { describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { VISUAL_REGISTRY } from './visual-registry.generated';
import {
  ACHIEVEMENT_ART, ARCHETYPE_VISUALS, BRAND, CARD_STYLE_FRAMES, CIRCLE_COVERS, GAME_VISUALS, achievementArt, archetypeArt, cardStyleFrame,
  circleCover, circleSymbol, emptyArt, envArt, gameArt, levelBadge, postTypeIcon, uiIcon,
} from './visual';
import { PERSONA_ARCHETYPES } from '../../shared/personality';
import { GAMES } from '../../shared/play/engine';
import { ACHIEVEMENTS, COLLECTIBLES } from '../../shared/gamification';

const paths = new Set(Object.values(VISUAL_REGISTRY).map((e) => e[0]));
const ok = (p: string | null) => {
  expect(p, 'path').toBeTruthy();
  expect(paths.has(p!), `${p} is not in the asset manifest`).toBe(true);
  expect(existsSync(resolve(__dirname, '../../../public', p!.slice(1))), `${p} missing on disk`).toBe(true);
};

describe('visual asset mapping', () => {
  it('maps every real archetype to a distinct artwork slot with all seven parts', () => {
    const keys = PERSONA_ARCHETYPES.map((a) => a.key);
    expect(Object.keys(ARCHETYPE_VISUALS).sort()).toEqual([...keys].sort());
    expect(new Set(Object.values(ARCHETYPE_VISUALS).map((v) => v.slot)).size).toBe(24);
    for (const k of keys) for (const part of ['sigil', 'sigil-mono', 'compact', 'hero-landscape', 'hero-portrait', 'card', 'treatment-pattern'] as const) ok(archetypeArt(k, part));
    expect(archetypeArt('not_real', 'sigil')).toBeNull();
  });

  it('maps all twelve engine games to their asset packs', () => {
    expect(Object.keys(GAME_VISUALS).sort()).toEqual(GAMES.map((g) => g.key).sort());
    for (const g of GAMES) for (const part of ['symbol', 'symbol-mono', 'card', 'cover', 'active', 'result', 'celebration'] as const) ok(gameArt(g.key, part));
  });

  it('resolves brand, environments, icons, post types, circles, levels, achievements, card styles and empty states', () => {
    Object.values(BRAND).forEach(ok);
    ok(envArt('sigil-field', 'portrait'));
    ok(envArt('identity-reveal', 'landscape'));
    ['home', 'network', 'play', 'circles', 'profile', 'eye-off', 'resonate', 'reply', 'lock', 'trophy'].forEach((i) => ok(uiIcon(i)));
    ['thought', 'question', 'dilemma', 'poll', 'confession', 'prompt', 'text'].forEach((k) => ok(postTypeIcon(k)));
    Object.keys(CIRCLE_COVERS).forEach((t) => ok(circleCover(t)));
    ok(circleCover('unknown'));
    ['a', 'b', 'c', '0c6f'].forEach((id) => ok(circleSymbol(id)));
    [1, 5, 10, 25].forEach((l) => ok(levelBadge(l)));
    Object.keys(ACHIEVEMENT_ART).forEach((k) => ok(achievementArt(k)));
    expect(ACHIEVEMENTS.filter((a) => !ACHIEVEMENT_ART[a.key]).map((a) => a.key)).toEqual([]);
    for (const c of COLLECTIBLES.filter((x) => x.kind === 'card')) {
      expect(CARD_STYLE_FRAMES[c.key.replace(/^card_/, '')], c.key).toBeTruthy();
      ok(cardStyleFrame(c.key.replace(/^card_/, '')));
    }
    (['circle', 'feed', 'no-results', 'notifications', 'offline', 'unavailable'] as const).forEach((k) => ok(emptyArt(k)));
  });
});
