import { type Page, type Locator, expect } from '@playwright/test';
import { randomUUID } from 'crypto';

/**
 * Page Object Model for the Ezra member registration page.
 * URL: https://myezra-staging.ezra.com/join
 */
export class JoinPage {
  readonly page: Page;
  readonly url: string;

  readonly firstNameInput: Locator;
  readonly lastNameInput: Locator;
  readonly emailInput: Locator;
  readonly phoneInput: Locator;
  readonly passwordInput: Locator;
  readonly termsCheckbox: Locator;
  readonly submitButton: Locator;
  readonly signInLink: Locator;

  constructor(page: Page) {
    this.page = page;
    this.url  = '/join';

    this.firstNameInput = page.getByRole('textbox', { name: 'Legal First Name' });
    this.lastNameInput = page.getByRole('textbox', { name: 'Legal Last Name' });
    this.emailInput = page.getByRole('textbox', { name: 'Email' });
    this.phoneInput = page.getByRole('textbox', { name: 'Phone Number' });
    this.passwordInput = page.getByRole('textbox', { name: 'Password' })
    this.termsCheckbox = page.getByRole('button', { name: 'I agree to Ezra\'s terms of' }).locator('svg');
    this.submitButton = page.getByRole('button', { name: 'Submit' });
    this.signInLink = page.getByRole('link', { name: 'SignIn' });
  }

  /** Navigate to the /join page and wait for it to be ready. */
  async goto() {
    await this.page.goto(this.url);
    await this.waitForPageLoad();
  }

  /** Accept cookies if the banner is present. */
  async acceptCookiesIfPresent() {
    const acceptButton = this.page.getByRole('button', { name: 'Accept' });
    if (await acceptButton.isVisible()) {
      await acceptButton.click();
    }
  }

  /**
   * Wait until the registration form is interactive.
   * The SPA hydrates asynchronously — wait for the email input rather than
   * just domcontentloaded, which fires before React mounts the form.
   */
  async waitForPageLoad() {
    await expect(this.page).toHaveURL(/\/join/);
    await this.emailInput.waitFor({ state: 'visible', timeout: 10_000 });
    await this.page.waitForLoadState('domcontentloaded');
  }

  // ── Actions ──────────────────────────────────────────────────────────────────

  async fillFirstName(value: string) {
    await this.firstNameInput.fill(value);
  }

  async fillLastName(value: string) {
    await this.lastNameInput.fill(value);
  }

  async fillEmail(value: string) {
    await this.emailInput.fill(value);
  }

  async fillPhone(value: string) {
    await this.phoneInput.click();
    await this.phoneInput.fill(value);
  }

  async fillPassword(value: string) {
    await this.passwordInput.fill(value);
  }

  async acceptTerms() {
    await this.termsCheckbox.click();
  }

  async clickSubmit() {
    await this.submitButton.click();
  }

  async clickSignInLink() {
    await this.signInLink.click();
  }

  // ── Compound actions ─────────────────────────────────────────────────────────

  /**
   * Fill every field and submit the registration form in one call.
   *
   * @param data - Registration form data.
   */
  async register(data: {
    firstName:       string;
    lastName:        string;
    email:           string;
    phone:           string;
    password:        string;
    acceptTerms?:    boolean;
  }) {
    if (data.acceptTerms !== false) {
      await this.acceptTerms();
    }
    await this.fillPhone(data.phone);
    await this.fillPassword(data.password);
    await this.fillFirstName(data.firstName);
    await this.fillLastName(data.lastName);
    await this.fillEmail(data.email);
    await this.clickSubmit();
  }

  /** Assert the submit button is disabled (e.g. before form is valid). */
  async expectSubmitDisabled() {
    await expect(this.submitButton).toBeDisabled();
  }

  /** Assert the submit button is enabled. */
  async expectSubmitEnabled() {
    await expect(this.submitButton).toBeEnabled();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Generate a unique test email to avoid "already registered" collisions
   * across test runs without needing an external cleanup step.
   *
   * Usage:  const email = JoinPage.uniqueEmail('member_a');
   *         // → member_a+1714000000000@test.ezra.com
   */
  static uniqueEmail(prefix = 'user'): string {
    return `${prefix}+${Date.now()}@test.ezra.com`;
  }

  /**
   * Generate a unique test password.
   *
   * Usage:  const password = JoinPage.uniquePassword('member_a');
   *         // → member_af896f840
   */
  static uniquePassword(prefix = ''): string {
    return `${prefix}${randomUUID().slice(0, 10)}`;
  }

}