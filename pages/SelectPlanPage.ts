import { type Page, type Locator, expect } from '@playwright/test';

/**
 * Page Object Model — Ezra scan plan selection & scheduling page.
 *
 * Covers two sequential views that share a URL prefix:
 *   1. Scan product selection  ("Select your Scan")
 *   2. Slot scheduling         ("Schedule your scan")
 *
 * Both views are part of the same SPA route, so a single POM makes sense here.
 * Methods are grouped and named by the view they belong to for readability.
 */
export class SelectPlanPage {
  readonly page: Page;

  // ── View 1: Scan product selection ───────────────────────────────────────────
  readonly selectScanHeading: Locator;

  /** All visible scan product cards. Filter by text to pick a specific plan. */
  readonly scanCards: Locator;

  /** Date of birth input inside the scan card detail form. */
  readonly dobInput: Locator;

  /** Sex / biological sex combobox. */
  readonly sexCombobox: Locator;

  /** "Next" / "Continue" button that advances from plan selection to scheduling. */
  readonly planSubmitButton: Locator;

  // ── View 2: Slot scheduling ───────────────────────────────────────────────────
  readonly scheduleHeading:    Locator;

  /**
   * "Recommended" tab / filter on the scheduling view.
   * Clicking it filters the calendar to recommended slots.
   */
  readonly recommendedTab: Locator;

  /**
   * Any enabled calendar day cell.
   * The `.last()` call in selectLastAvailableDay() picks the furthest available
   * day, which is the least likely to be already booked in a shared test env.
   */
  readonly enabledCalendarDays: Locator;

  /**
   * Time slot buttons (on-the-hour or half-hour).
   * Using `.first()` is intentional — we want the earliest available slot.
   */
  readonly timeSlotButtons: Locator;

  /** "Continue" / "Next" button that advances from scheduling to payment. */
  readonly scheduleSubmitButton: Locator;

  // ── View 3: Appointment reservation confirm ───────────────────────────────────
  readonly reserveHeading: Locator;

  constructor(page: Page) {
    this.page = page;

    // ── View 1 ────────────────────────────────────────────────────────────────
    this.selectScanHeading = page.getByRole('heading', { name: 'Select your Scan' });

    this.scanCards = page.locator('.encounter-card:visible');

    this.dobInput = page.getByRole('textbox', { name: 'Date of birth (MM-DD-YYYY)' });

    this.sexCombobox = page
      .getByTestId('sex-combobox')
      .or(page.getByRole('combobox').locator('div').first());

    this.planSubmitButton = page.getByTestId('select-plan-submit-btn');

    // ── View 2 ────────────────────────────────────────────────────────────────
    this.scheduleHeading = page.getByRole('heading', { name: 'Schedule your scan' });

    this.recommendedTab = page
      .getByTestId('recommended-tab')
      .or(page.getByText('Recommended'));

    this.enabledCalendarDays = page.locator(
      '.vuecal__cell:not(.vuecal__cell--disabled) [data-testid*=cal-day-content]',
    );

    this.timeSlotButtons = page
      .getByText(':00')
      .or(page.getByText(':30'));

    this.scheduleSubmitButton = page
      .getByTestId('schedule-submit-btn')
      .or(page.locator('[data-test="submit"]'));

    // ── View 3 ────────────────────────────────────────────────────────────────
    this.reserveHeading = page.getByRole('heading', { name: 'Reserve your appointment' });
  }

  // ── Waits ────────────────────────────────────────────────────────────────────

  async waitForPageLoad() {
    await this.selectScanHeading.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async waitForScheduleView() {
    await this.scheduleHeading.waitFor({ state: 'visible', timeout: 15_000 });
  }

  async waitForReserveView() {
    await this.reserveHeading.waitFor({ state: 'visible', timeout: 15_000 });
  }

  // ── View 1 actions ───────────────────────────────────────────────────────────

  /**
   * Returns the scan card that contains the given product name text.
   * Scoped to visible cards only to avoid matching hidden duplicates.
   */
  getScanCardByName(productName: string): Locator {
    return this.scanCards.filter({ hasText: productName }).first();
  }

  /**
   * Read the price displayed on a scan card and return it as a number.
   * The "Available at" text is expected to contain the price, e.g. "Available at $1,950".
   *
   * @returns The numeric price, e.g. 1950. Returns 0 if parsing fails.
   */
  async getPriceFromCard(card: Locator): Promise<number> {
    const text = await card.getByText('Available at').textContent();
    const price = parseFloat(text?.replace(/[^0-9.-]+/g, '') ?? '0');
    return price;
  }

  async clickScanCard(card: Locator) {
    await card.click();
  }

  async fillDateOfBirth(dob: string) {
    await this.dobInput.fill(dob);
  }

  async selectSex(sex: string) {
    await this.sexCombobox.click();
    await this.page.getByText(sex, { exact: true }).click();
  }

  async clickPlanSubmit() {
    await this.planSubmitButton.click();
    await this.waitForScheduleView();
  }

  async clickRecommendedTab() {
    await this.recommendedTab.click();
  }

  /**
   * Click the last enabled calendar day.
   * Using "last" avoids already-booked days that tend to cluster near today
   * in shared staging environments.
   */
  async selectLastAvailableDay() {
    await this.enabledCalendarDays.last().click({ timeout: 30_000 });
  }

  /** Click the first available time slot button (:00 or :30). */
  async selectFirstAvailableTimeSlot() {
    await this.timeSlotButtons.first().click();
  }

  async clickScheduleSubmit() {
    await this.scheduleSubmitButton.click();
    await this.waitForReserveView();
  }

  // ── Compound actions ─────────────────────────────────────────────────────────

  /**
   * Select a scan product by name, fill DOB and sex, then advance to scheduling.
   *
   * @param productName - Partial text match of the scan card, e.g. 'MRI Scan'
   * @param dob         - Date of birth in MM-DD-YYYY format
   * @param sex         - Exact text of the sex option, e.g. 'Male'
   * @returns           - The numeric price extracted from the card
   */
  async selectPlan(productName: string, dob: string, sex: string): Promise<number> {
    const card  = this.getScanCardByName(productName);
    const price = await this.getPriceFromCard(card);

    await this.clickScanCard(card);
    await this.fillDateOfBirth(dob);
    await this.selectSex(sex);
    await this.clickPlanSubmit();

    return price;
  }

  /**
   * Select a slot on the scheduling view and advance to the reservation screen.
   * Uses the recommended filter, the last available day, and the first time slot.
   */
  async scheduleAppointment() {
    await this.clickRecommendedTab();
    await this.selectLastAvailableDay();
    await this.selectFirstAvailableTimeSlot();
    await this.clickScheduleSubmit();
  }

  // ── Assertions ───────────────────────────────────────────────────────────────

  async expectSelectScanHeadingVisible() {
    await expect(this.selectScanHeading).toBeVisible();
  }

  async expectScheduleHeadingVisible() {
    await expect(this.scheduleHeading).toBeVisible();
  }

  async expectReserveHeadingVisible() {
    await expect(this.reserveHeading).toBeVisible({ timeout: 15_000 });
  }
}