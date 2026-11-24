import { describe, expect, it } from 'vitest';
import { AVATAR_PARTS, AVATAR_PART_KEYS, DEFAULT_AVATAR, avatarVersion, normaliseAvatar, randomAvatar, renderAvatarSvg } from './avatar';

describe('avatar creator', () => {
  it('renders every option of every part as a well-formed, script-free SVG', () => {
    for (const p of AVATAR_PART_KEYS) for (const o of AVATAR_PARTS[p]) {
      const svg = renderAvatarSvg({ ...DEFAULT_AVATAR, [p]: o.key });
      expect(svg.startsWith('<svg') && svg.endsWith('</svg>')).toBe(true);
      expect(svg).not.toMatch(/<script|on\w+=|href=|NaN|undefined/i);
    }
  });

  it('ignores unknown values and anything that is not a known key', () => {
    const n = normaliseAvatar({ skin: '"/><script>alert(1)</script>', hair: 'bun', extra: 'x' });
    expect(n).toEqual({ ...DEFAULT_AVATAR, hair: 'bun' });
    expect(renderAvatarSvg(n)).not.toContain('script');
  });

  it('is deterministic, and the version changes when the avatar does', () => {
    let i = 0;
    const seq = () => [0.1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.8, 0.4, 0.6][i++ % 9];
    const a = randomAvatar(seq);
    expect(normaliseAvatar(a)).toEqual(a);
    expect(renderAvatarSvg(a)).toBe(renderAvatarSvg({ ...a }));
    expect(avatarVersion(a)).toBe(avatarVersion({ ...a }));
    expect(avatarVersion({ ...a, mouth: a.mouth === 'grin' ? 'smile' : 'grin' })).not.toBe(avatarVersion(a));
  });
});
