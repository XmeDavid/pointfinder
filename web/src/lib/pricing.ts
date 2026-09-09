/**
 * Personal plan pricing, in euros.
 *
 * Clubs are sales-led: a club price is quoted by us, never listed in the
 * product, so only the personal plan carries amounts here.
 */

/** Presentation cycle, as offered by the pricing toggles. */
export type BillingCycleOption = 'monthly' | 'yearly'

/** Cycle name the billing checkout API expects. */
export type CheckoutCycle = 'monthly' | 'annual'

export const PRICING_CURRENCY = 'EUR'

export const PERSONAL_PRICE_EUR: Record<BillingCycleOption, number> = {
  monthly: 3.99,
  yearly: 30,
}

export const CHECKOUT_CYCLE: Record<BillingCycleOption, CheckoutCycle> = {
  monthly: 'monthly',
  yearly: 'annual',
}

/**
 * Formats a plan price in the reader's language. Whole amounts keep no
 * decimals (€30); fractional ones keep the cents (€3.99).
 */
export function formatPrice(amount: number, language: string): string {
  return new Intl.NumberFormat(language, {
    style: 'currency',
    currency: PRICING_CURRENCY,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount)
}
