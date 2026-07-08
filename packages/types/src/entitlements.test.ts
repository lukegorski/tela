import { describe, it, expect } from 'vitest';
import { deriveEntitlements } from './entitlements.js';

describe('deriveEntitlements — truth table (spec §5)', () => {
  it.each([
    // [features, builder, aiStyling, renderQuotaPerWeek]
    [{}, false, true, 7],
    [{ builder: true }, true, true, 7],
    [{ builder: false }, false, true, 7],
    [{ builder: 'yes' }, false, true, 7], // non-boolean truthy is NOT a flag
    [{ builder: 1 }, false, true, 7],
    [{ aiStyling: false }, false, false, 7],
    [{ aiStyling: true }, false, true, 7],
    [{ builder: true, aiStyling: false }, true, false, 7],
    [{ renderQuotaBypass: true }, false, true, null],
    [{ builder: true, renderQuotaBypass: true }, true, true, null],
    [{ renderQuotaBypass: false }, false, true, 7],
    [{ renderQuotaBypass: 1 }, false, true, 7], // non-boolean is not a bypass
  ] as const)('features=%j → builder=%s aiStyling=%s quota=%s', (features, builder, aiStyling, quota) => {
    expect(deriveEntitlements({ features })).toEqual({
      builder,
      aiStyling,
      renderQuotaPerWeek: quota,
    });
  });

  it.each([
    [null],
    [undefined],
    ['{}'], // string, not object — the postgres-js jsonb double-encode trap shape
    [42],
    [['builder']],
  ] as const)('malformed features (%j) degrade to the free defaults', (features) => {
    expect(deriveEntitlements({ features })).toEqual({
      builder: false,
      aiStyling: true,
      renderQuotaPerWeek: 7,
    });
  });

  it('unknown feature keys are ignored', () => {
    expect(deriveEntitlements({ features: { somethingElse: true, builder: true } }).builder).toBe(true);
  });
});
