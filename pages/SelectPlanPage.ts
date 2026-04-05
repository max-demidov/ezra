import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model for the Ezra plan selection page.
 * URL: https://myezra-staging.ezra.com/sign-up/select-plan
 */
export class SelectPlanPage {
  readonly page: Page;
  readonly url: string;

  readonly continueButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.url  = '/sign-up/select-plan';

    this.continueButton = page.getByTestId('select-plan-submit-btn');
  }

  /** Navigate to the page url. */
  async goto() {
    await this.page.goto(this.url);
  }

  /**
   * Wait until the registration form is interactive.
   * The SPA hydrates asynchronously — wait for the email input rather than
   * just domcontentloaded, which fires before React mounts the form.
   */
  async waitForPageLoad() {
    await expect(this.page).toHaveURL(/\/sign-up\/select-plan/, { timeout: 15_000 });
    await this.continueButton.waitFor({ state: 'visible', timeout: 5_000 });
  }

}