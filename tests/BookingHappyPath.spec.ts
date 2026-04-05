import { test, expect } from '@playwright/test';
import { JoinPage } from '../pages/JoinPage';
import { SelectPlanPage } from '../pages/SelectPlanPage';

test.describe('Happy Path: Successful payment with valid credit card', () => {

  test('Register as a new member', async ({ page }) => {
    const joinPage = new JoinPage(page);

    await joinPage.goto();

    await joinPage.register({
      firstName: 'Test',
      lastName:  'Member',
      email:     JoinPage.uniqueEmail('happy_path'),
      phone:     '12015550123',
      password:  JoinPage.uniquePassword('Ezr@R0ck$'),
      acceptTerms: true,
    });

    const selectPlanPage = new SelectPlanPage(page);
    await selectPlanPage.waitForPageLoad();
  });

});
