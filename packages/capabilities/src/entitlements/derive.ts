/**
 * The entitlements choke point (spec §5). ONE pure function derives every
 * gate's answer from the user row; routes, capabilities, and UI read ONLY
 * this shape. Future billing (users.plan, Stripe) swaps the derivation —
 * never the gates.
 *
 * v0 derivation (no plan column yet; features flipped by script in beta):
 *  - builder:            features.builder === true, else false (dark by default)
 *  - aiStyling:          true unless features.aiStyling === false
 *                        (today every user has AI styling; the premium fake
 *                        door in v1 changes the DEFAULT, not this shape)
 *  - renderQuotaPerWeek: null (unlimited) when features.renderQuotaBypass
 *                        is true, else 7 (spec decision #4; enforced in v1)
 */

export interface Entitlements {
  builder: boolean;
  aiStyling: boolean;
  renderQuotaPerWeek: number | null;
}

export interface EntitlementsInput {
  features: unknown;
}

const DEFAULT_RENDER_QUOTA_PER_WEEK = 7;

export function deriveEntitlements(user: EntitlementsInput): Entitlements {
  const features: Record<string, unknown> =
    user.features && typeof user.features === 'object' && !Array.isArray(user.features)
      ? (user.features as Record<string, unknown>)
      : {};

  return {
    builder: features.builder === true,
    aiStyling: features.aiStyling !== false,
    renderQuotaPerWeek: features.renderQuotaBypass === true ? null : DEFAULT_RENDER_QUOTA_PER_WEEK,
  };
}
