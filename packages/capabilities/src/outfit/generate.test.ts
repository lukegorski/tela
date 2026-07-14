import { describe, it, expect } from 'vitest';
import { dedupeByRole, reconcileRolesWithCategories } from './generate.js';

const cat = (entries: Record<string, string>) => new Map(Object.entries(entries));

describe('reconcileRolesWithCategories', () => {
  it('corrects an AI role that contradicts the closet category (P3: jacket as shoes)', () => {
    const { items, corrections } = reconcileRolesWithCategories(
      [
        { closetItemId: 'a', role: 'top' },
        { closetItemId: 'b', role: 'bottom' },
        { closetItemId: 'c', role: 'shoes' }, // actually outerwear
      ],
      cat({ a: 'top', b: 'bottom', c: 'outerwear' }),
    );
    expect(items.map((i) => i.role)).toEqual(['top', 'bottom', 'outerwear']);
    expect(corrections).toEqual([{ closetItemId: 'c', from: 'shoes', to: 'outerwear' }]);
  });

  it('leaves matching roles untouched and reports no corrections', () => {
    const input = [
      { closetItemId: 'a', role: 'top' },
      { closetItemId: 'b', role: 'shoes' },
    ];
    const { items, corrections } = reconcileRolesWithCategories(input, cat({ a: 'top', b: 'shoes' }));
    expect(items).toEqual(input);
    expect(corrections).toEqual([]);
  });

  it('trusts the AI role when the category is not itself a valid role', () => {
    const { items, corrections } = reconcileRolesWithCategories(
      [{ closetItemId: 'a', role: 'accessory' }],
      cat({ a: 'jewelry' }), // free-form category outside the role enum
    );
    expect(items[0].role).toBe('accessory');
    expect(corrections).toEqual([]);
  });

  it('trusts the AI role when the item is missing from the category map', () => {
    const { items, corrections } = reconcileRolesWithCategories(
      [{ closetItemId: 'ghost', role: 'top' }],
      cat({}),
    );
    expect(items[0].role).toBe('top');
    expect(corrections).toEqual([]);
  });

  it('phantom-slot filler collapses to a dedupe drop (P3: second t-shirt as shoes)', () => {
    const { items } = reconcileRolesWithCategories(
      [
        { closetItemId: 'tee1', role: 'top' },
        { closetItemId: 'jeans', role: 'bottom' },
        { closetItemId: 'tee2', role: 'shoes' }, // actually a top → corrected → duplicate
      ],
      cat({ tee1: 'top', jeans: 'bottom', tee2: 'top' }),
    );
    const deduped = dedupeByRole(items);
    expect(deduped.map((i) => i.closetItemId)).toEqual(['tee1', 'jeans']);
    expect(deduped.map((i) => i.role)).toEqual(['top', 'bottom']);
  });

  it('does not mutate the input items', () => {
    const input = [{ closetItemId: 'c', role: 'shoes' }];
    reconcileRolesWithCategories(input, cat({ c: 'outerwear' }));
    expect(input[0].role).toBe('shoes');
  });
});

describe('dedupeByRole (existing behavior)', () => {
  it('keeps the first of duplicate non-repeatable roles and all accessories', () => {
    const out = dedupeByRole([
      { role: 'top', id: 1 },
      { role: 'top', id: 2 },
      { role: 'accessory', id: 3 },
      { role: 'accessory', id: 4 },
    ] as Array<{ role: string; id: number }>);
    expect(out.map((i) => i.id)).toEqual([1, 3, 4]);
  });
});
