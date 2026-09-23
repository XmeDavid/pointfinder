import { expect, type Page } from '@playwright/test'

/**
 * Content-panel sections at any width (OW-36): wide screens show tabs, phones
 * one section chooser whose list carries the same `tab-*` ids once opened.
 */
export async function chooseSection(page: Page, section: 'bases' | 'challenges' | 'teams' | 'stages' | 'nfc' | 'documents') {
  const chooser = page.locator('[data-testid="drawer-section-chooser"]:visible')
  if (await chooser.count()) await chooser.first().click()
  await page.locator(`[data-testid="tab-${section}"]:visible`).first().click()
}

/** The drawer shows this section, whether as a pressed tab or the chooser's current entry. */
export async function expectSection(page: Page, label: string, section: string) {
  const chooser = page.locator('[data-testid="drawer-section-chooser"]:visible')
  if (await chooser.count()) await expect(chooser.first()).toContainText(label)
  else await expect(page.getByTestId(`tab-${section}`)).toHaveAttribute('aria-pressed', 'true')
}
