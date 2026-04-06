import { test, expect } from '@playwright/test';
import { EzraApiClient, type SubmissionAnswer } from '../api/EzraApiClient';

/**
 * Integration test: Cross-Member Medical Data Access Prevention
 *
 * Member A — legitimate owner of the Medical Questionnaire.
 * Member B — attacker attempting to read and mutate Member A's data
 *            using their own valid session token (IDOR / BOLA attack).
 *
 * The three serial steps verify:
 *   1. Member A can read and write their own questionnaire data.
 *   2. Member B is blocked (403) from reading or writing Member A's data.
 *   3. Member A's data is unchanged after Member B's failed attempts.
 */
test.describe.serial('Cross-Member Medical Data Access Prevention', () => {

  // ── Test fixtures ───────────────────────────────────────────────────────────
  // Encounter IDs are stable staging fixtures — each belongs to a dedicated
  // test account. Member B's encounter ID is declared for completeness even
  // though the attack uses Member A's submission ID directly.
  const MEMBER_A_ENCOUNTER_ID = 'f5a738eb-ac55-47cd-86ae-c1c18c12e91b';

  let apiClientA: EzraApiClient;
  let apiClientB: EzraApiClient;

  // submissionIdA is resolved in Step 1 and shared with Steps 2 and 3.
  // It has no default — if Step 1 fails to populate it, Steps 2 and 3 skip.
  let submissionIdA: string;

  // newAddress is set in Step 1 and used in Step 3 to verify data integrity.
  let newAddress: string;

  test.beforeAll(async () => {
    apiClientA = await EzraApiClient.create();
    apiClientB = await EzraApiClient.create();
  });

  test.afterAll(async () => {
    await apiClientA.dispose();
    await apiClientB.dispose();
  });

  // ── Step 1: Member A — authenticate, read, and update their questionnaire ───

  test('Member A authenticates, retrieves their submission ID, and updates their questionnaire data', async () => {
    await apiClientA.authenticate({
      username: process.env.MEMBER_A_EMAIL!,
      password: process.env.MEMBER_A_PASSWORD!,
      clientId: EzraApiClient.MEMBER_CLIENT_ID,
      endpoint: EzraApiClient.MEMBER_AUTH_ENDPOINT,
    });

    // Resolve Member A's submission ID from their encounter.
    const submissionDetails = await apiClientA.getSubmissionDetails(MEMBER_A_ENCOUNTER_ID);
    submissionIdA = submissionDetails.mqSubmissions[0].id;
    expect(submissionIdA, 'Submission ID must be present before proceeding').toBeTruthy();

    // Write a randomised address so Step 3 has an unambiguous value to verify.
    newAddress = `${Math.floor(Math.random() * 1000)} Main St`;
    const updatePayload: SubmissionAnswer = { key: 'address', value: newAddress, hasAnswer: true };

    const updateResponse = await apiClientA.postSubmissionData(submissionIdA, updatePayload);
    expect(updateResponse.ok(), `POST submission data failed: ${updateResponse.status()}`).toBeTruthy();

    // Read back and confirm the value was persisted correctly.
    const readResponse = await apiClientA.getSubmissionData(submissionIdA);
    expect(readResponse.ok(), `GET submission data failed: ${readResponse.status()}`).toBeTruthy();

    const answers: SubmissionAnswer[] = await readResponse.json();
    const addressAnswer = answers.find(a => a.key === 'address');
    expect(addressAnswer, 'Address answer must be present in the response').toBeTruthy();
    expect(addressAnswer!.value).toBe(newAddress);
  });

  // ── Step 2: Member B — IDOR attack using Member A's submission ID ────────────

  test("Member B is blocked from reading or mutating Member A's questionnaire with their own valid session token", async () => {
    await apiClientB.authenticate({
      username: process.env.MEMBER_B_EMAIL!,
      password: process.env.MEMBER_B_PASSWORD!,
      clientId: EzraApiClient.MEMBER_CLIENT_ID,
      endpoint: EzraApiClient.MEMBER_AUTH_ENDPOINT,
    });

    // Attack 1: Member B attempts to overwrite Member A's answer.
    const attackPayload: SubmissionAnswer = { key: 'address', value: '77 El Camino', hasAnswer: true };
    const writeResponse = await apiClientB.postSubmissionData(submissionIdA, attackPayload);
    expect(writeResponse.ok(), 'Member B write should be rejected').toBeFalsy();
    expect(writeResponse.status()).toBe(403);

    // Attack 2: Member B attempts to read Member A's questionnaire answers.
    const readResponse = await apiClientB.getSubmissionData(submissionIdA);
    expect(readResponse.ok(), 'Member B read should be rejected').toBeFalsy();
    expect(readResponse.status()).toBe(403);
  });

  // ── Step 3: Verify Member A's data is intact after the attack ───────────────

  test("Member A's questionnaire data is unchanged after Member B's unauthorised attempts", async () => {
    const readResponse = await apiClientA.getSubmissionData(submissionIdA);
    expect(readResponse.ok(), `GET submission data failed: ${readResponse.status()}`).toBeTruthy();

    const answers: SubmissionAnswer[] = await readResponse.json();
    const addressAnswer = answers.find(a => a.key === 'address');
    expect(addressAnswer, 'Address answer must still be present').toBeTruthy();
    expect(addressAnswer!.value).toBe(newAddress);
  });

});