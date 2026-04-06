import { type Page, type Locator, type FrameLocator, expect } from '@playwright/test';

/**
 * Page Object Model — Ezra payment & booking confirmation page.
 * URL pattern: /sign-up/payment  →  /sign-up/scan-confirm
 *
 * The payment form is rendered inside a Stripe-hosted iframe, so this POM
 * exposes both page-level locators and a FrameLocator for the Stripe fields.
 */
export class PaymentPage {
  readonly page: Page;

  // ── Price display ─────────────────────────────────────────────────────────────
  /**
   * The price element in the order summary.
   * Selector mirrors what the spec asserts: .pricing-detail .h4
   */
  readonly priceDisplay: Locator;

  /**
   * FrameLocator scoped to the Stripe iframe content.
   * Use this to locate card fields — Playwright crosses the frame boundary
   * automatically when you chain locators off a FrameLocator.
   */
  readonly stripeFrame:    FrameLocator;

  // ── Stripe input fields (resolved inside stripeFrame) ────────────────────────
  readonly cardNumberInput:   Locator;
  readonly expiryInput:       Locator;
  readonly cvcInput:          Locator;
  readonly zipInput:          Locator;

  // ── Submit ────────────────────────────────────────────────────────────────────
  readonly payButton: Locator;

  // ── Confirmation screen ───────────────────────────────────────────────────────
  readonly confirmationHeading:    Locator;
  readonly beginQuestionnaireButton: Locator;
  readonly appointmentHeading:     Locator;

  constructor(page: Page) {
    this.page = page;

    // ── Price ─────────────────────────────────────────────────────────────────
    this.priceDisplay = page
      .getByTestId('price-display')
      .or(page.locator('.pricing-detail .h4'));

    // ── Stripe iframe ─────────────────────────────────────────────────────────
    this.stripeFrame  = page.locator('iframe[name*=privateStripeFrame]').first().contentFrame()!;

    // ── Card inputs (inside Stripe frame) ─────────────────────────────────────
    this.cardNumberInput = this.stripeFrame.getByRole('textbox', { name: 'Card number' });
    this.expiryInput     = this.stripeFrame.getByRole('textbox', { name: 'Expiration date MM / YY' });
    this.cvcInput        = this.stripeFrame.getByRole('textbox', { name: 'Security code' });
    this.zipInput        = this.stripeFrame.getByRole('textbox', { name: 'ZIP code' });

    // ── Submit ────────────────────────────────────────────────────────────────
    this.payButton = page
      .getByTestId('pay-submit-btn')
      .or(page.locator('[data-test="submit"]'));

    // ── Confirmation ──────────────────────────────────────────────────────────
    this.confirmationHeading = page.getByRole('heading', {
      name: /you're almost done/i,
    });

    this.beginQuestionnaireButton = page.getByRole('button', {
      name: 'Begin Medical Questionnaire',
    });

    this.appointmentHeading = page.getByRole('heading', {
      name: 'MRI Scan Appointment',
    });
  }

  // ── Waits ────────────────────────────────────────────────────────────────────

  async waitForConfirmation() {
    await expect(this.page).toHaveURL(/\/sign-up\/scan-confirm/, { timeout: 15_000 });
    await this.confirmationHeading.waitFor({ state: 'visible', timeout: 15_000 });
  }

  // ── Individual field actions ─────────────────────────────────────────────────

  async fillCardNumber(value: string) {
    await this.cardNumberInput.fill(value);
  }

  async fillExpiry(value: string) {
    await this.expiryInput.fill(value);
  }

  async fillCvc(value: string) {
    await this.cvcInput.fill(value);
  }

  async fillZip(value: string) {
    await this.zipInput.fill(value);
  }

  async clickPay() {
    await this.payButton.click();
  }

  // ── Compound actions ─────────────────────────────────────────────────────────

  /**
   * Fill all Stripe card fields and submit payment.
   * Defaults to Stripe's canonical test card (always approves).
   */
  async pay(card: {
    number:  string;
    expiry:  string;
    cvc:     string;
    zip:     string;
  } = {
    number:  '4242 4242 4242 4242',
    expiry:  '12 / 34',
    cvc:     '999',
    zip:     '12345',
  }) {
    await this.fillCardNumber(card.number);
    await this.fillExpiry(card.expiry);
    await this.fillCvc(card.cvc);
    await this.fillZip(card.zip);
    await this.clickPay();
  }

  // ── Assertions ───────────────────────────────────────────────────────────────

  /**
   * Assert the order summary shows the expected price.
   * @param expectedPrice - Numeric price, e.g. 1950 → asserts text "$1950"
   */
  async expectPriceDisplayed(expectedPrice: number) {
    await expect(this.priceDisplay).toHaveText(`$${expectedPrice}`);
  }

  async expectConfirmationHeadingVisible(firstName: string) {
    await expect(
      this.page.getByRole('heading', { name: `You're almost done, ${firstName}.` })
    ).toBeVisible({ timeout: 15_000 });
  }

  async expectBeginQuestionnaireButtonVisible() {
    await expect(this.beginQuestionnaireButton).toBeVisible();
  }

  async expectAppointmentHeadingVisible() {
    await expect(this.appointmentHeading).toBeVisible();
  }
}