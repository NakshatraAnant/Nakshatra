import { describe, expect, it } from 'vitest';
import { prohibitedCategory } from './market';

describe('circle market rules', () => {
  it('allows everyday items', () => {
    for (const t of ['Old cycle, works fine', 'Engineering textbooks (2nd year)', 'Free houseplants', 'Swap: board games']) expect(prohibitedCategory(t)).toBeNull();
  });
  it('blocks prohibited categories, including plurals', () => {
    expect(prohibitedCategory('Selling two airsoft guns')).toBe('weapons');
    expect(prohibitedCategory('Kitchen knife set')).toBeNull();
    expect(prohibitedCategory('Leftover beer from the party')).toBe('alcohol');
    expect(prohibitedCategory('Spare SIM card')).toBe('identity documents');
    expect(prohibitedCategory('Original rudraksha mala')).toBe('astrological remedies');
    expect(prohibitedCategory('Prescription tablets')).toBe('medicines');
  });
});
