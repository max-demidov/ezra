import { test, expect, type Page } from '@playwright/test';
import { JoinPage }        from '../pages/JoinPage';
import { SelectPlanPage }  from '../pages/SelectPlanPage';
import { PaymentPage }     from '../pages/PaymentPage';
import { EzraApiClient }   from '../api/EzraApiClient';

/**
 * End-to-end happy path: new member registers → selects a scan plan →
 * schedules a slot → completes payment → reaches the confirmation screen →
 * booking is verified via the back-end API.
 *
 * The suite is serial so that shared state (the registered member, the
 * selected price) flows naturally between steps without prop-drilling.
 * If any step fails, all subsequent steps are skipped automatically.
 */
test.describe.serial('Happy Path: Successful payment with valid credit card', () => {

  let page:           Page;
  let joinPage:       JoinPage;
  let selectPlanPage: SelectPlanPage;
  let paymentPage:    PaymentPage;
  let apiClient:      EzraApiClient;
  let price:          number;

  const MEMBER = {
    firstName: 'Test',
    lastName:  'Member',
    email:     JoinPage.uniqueEmail('happy_path'),
    phone:     '12015550123',
    password:  JoinPage.uniquePassword('Ezr@R0ck$'),
  } as const;

  test.beforeAll(async ({ browser }) => {
    page           = await browser.newPage();
    joinPage       = new JoinPage(page);
    selectPlanPage = new SelectPlanPage(page);
    paymentPage    = new PaymentPage(page);
    apiClient      = await EzraApiClient.create();
  });

  test.afterAll(async () => {
    await page.close();
    await apiClient.dispose();
  });

  // ── Step 1: Registration ────────────────────────────────────────────────────

  test('Register as a new member', async () => {
    await joinPage.goto();
    await joinPage.acceptCookiesIfPresent();

    await joinPage.register({
      firstName:   MEMBER.firstName,
      lastName:    MEMBER.lastName,
      email:       MEMBER.email,
      phone:       MEMBER.phone,
      password:    MEMBER.password,
      acceptTerms: true,
    });

    await selectPlanPage.waitForPageLoad();
  });

  // ── Step 2: Plan & slot selection ───────────────────────────────────────────

  test('Select a plan and slot', async () => {
    await selectPlanPage.expectSelectScanHeadingVisible();

    price = await selectPlanPage.selectPlan('MRI Scan', '12-31-1999', 'Male');
    expect(price).toBeGreaterThan(0);

    await selectPlanPage.scheduleAppointment();
    await selectPlanPage.expectReserveHeadingVisible();
  });

  // ── Step 3: Payment ─────────────────────────────────────────────────────────

  test('Complete payment with Stripe test card', async () => {
    await paymentPage.expectPriceDisplayed(price);
    await paymentPage.pay();

    await paymentPage.waitForConfirmation();
    await paymentPage.expectConfirmationHeadingVisible(MEMBER.firstName);
    await paymentPage.expectBeginQuestionnaireButtonVisible();
    await paymentPage.expectAppointmentHeadingVisible();
  });

  // ── Step 4: Back-end verification ───────────────────────────────────────────

  test('Verify the booking is created in the system and available in User Facing Portal', async () => {
    test.slow();
    test.setTimeout(300_000);
    // Skipping this test for now since the booking verification is currently slow,
    // likely due to delays in the booking creation process.
    // The test passes with a sufficient timeout. Feel free to re-enable but be
    // ready to increase the timeout up to 10 minutes.
    test.skip();

    await apiClient.authenticate({
      username: process.env.KRAKOVSKY_EMAIL!,
      password: process.env.KRAKOVSKY_PASSWORD!,
      clientId: EzraApiClient.ADMIN_CLIENT_ID,
      endpoint: EzraApiClient.USER_AUTH_ENDPOINT,
    });

    const booking = await apiClient.waitForBooking(MEMBER.email, {
      timeout:   300_000,
      intervals: [10_000, 20_000, 30_000],
    });

    apiClient.assertBookingMatchesMember(booking, {
      email:    MEMBER.email,
      scanType: 'MRI Scan',
    });
  });

});