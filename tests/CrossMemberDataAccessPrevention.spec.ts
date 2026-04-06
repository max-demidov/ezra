import { test, expect } from '@playwright/test';
import { EzraApiClient }   from '../api/EzraApiClient';

/**
 * Member A is a legitimate owner of the Medical Questionnaire.
 * Member B is an attacker who tries to access Member A's Medical Questionnaire.
 */
test.describe.serial('Cross-Member Medical Data Access Prevention', () => {
  const memberAencounterId : string = 'f5a738eb-ac55-47cd-86ae-c1c18c12e91b';
  const memberBencounterId : string = 'd89e68c0-e1bb-4e4e-86cd-908707e6559e';

  let apiClientA:      EzraApiClient;
  let apiClientB:      EzraApiClient;

  let submissionIdA:  string = '3565';
  let newAddress:     string;

  test.beforeAll(async () => {
    apiClientA      = await EzraApiClient.create();
    apiClientB      = await EzraApiClient.create();
  });

  test.afterAll(async () => {
    await apiClientA.dispose();
    await apiClientB.dispose();
  });

  // ── Step 1: Verify Member A's authentication and legitimate data access ────────────────────────────────────────────────────

  test('Member A authenticates, retrieves their submission id, accesses their questionare data, and changes it', async () => {
    await apiClientA.authenticate({
      username: process.env.MEMBER_A_EMAIL!,
      password: process.env.MEMBER_A_PASSWORD!,
      clientId: EzraApiClient.MEMBER_CLIENT_ID,
      endpoint: EzraApiClient.MEMBER_AUTH_ENDPOINT,
    });
    const submissionDetails = await apiClientA.getSubmissionDetails(memberAencounterId);
    submissionIdA = submissionDetails.mqSubmissions[0].id!;
    expect(submissionIdA).toBeTruthy();

    // Simulate legitimate update to the questionnaire (e.g. member updates their own info)
    newAddress = `${Math.floor(Math.random() * 1000)} Main St`;
    const submissionUpdateResponse = await apiClientA.postSubmissionData(submissionIdA, 
      { key: 'address', value: newAddress, "hasAnswer": true }
    );    
    expect(submissionUpdateResponse.ok(), `Request failed: ${submissionUpdateResponse.status()}`).toBeTruthy();

    // Simulate legitimate access to the questionnaire (e.g. member reads their own info)
    const submissionDataResponse = await apiClientA.getSubmissionData(submissionIdA);  
    expect(submissionDataResponse.ok(), `Request failed: ${submissionDataResponse.status()}`).toBeTruthy();
    const address = (await submissionDataResponse.json()).find((s: any) => s.key === 'address');
    expect(address).toBeTruthy();
    expect(address.value).toBe(newAddress);
  });

  // ── Step 2: Attack Member A's questionnaire with Member B's own valid session token

  test('Prevention from API requests to Member A\'s questionnaire with Member B\'s own valid session token', async () => {
    await apiClientB.authenticate({
      username: process.env.MEMBER_B_EMAIL!,
      password: process.env.MEMBER_B_PASSWORD!,
      clientId: EzraApiClient.MEMBER_CLIENT_ID,
      endpoint: EzraApiClient.MEMBER_AUTH_ENDPOINT,
    });

    // Malicious or curious member B attempting to mutate Member A's questionnaire data using Member A's submission ID
    const submissionUpdateResponse = await apiClientB.postSubmissionData(submissionIdA, 
      { key: 'address', value: "77 El Camino", "hasAnswer": true }
    );
    expect(submissionUpdateResponse.ok(), `Request failed: ${submissionUpdateResponse.status()}`).toBeFalsy();
    expect(submissionUpdateResponse.status()).toBe(403); // Expecting Forbidden or similar error status

    // Malicious or curious member B attempting to access Member A's questionnaire data using Member A's submission ID
    const submissionDataResponse = await apiClientB.getSubmissionData(submissionIdA);
    expect(submissionDataResponse.ok(), `Request failed: ${submissionDataResponse.status()}`).toBeFalsy();
    expect(submissionDataResponse.status()).toBe(403); // Expecting Forbidden or similar error status
  });

  // ── Step 3: Verify that Member A's data remains unchanged after Member B's unauthorized attempts

  test('Verify that Member A\'s data remains unchanged after Member B\'s unauthorized attempts', async () => {
    const submissionDataResponseA = await apiClientA.getSubmissionData(submissionIdA);
    expect(submissionDataResponseA.ok(), `Request failed: ${submissionDataResponseA.status()}`).toBeTruthy();
    const address = (await submissionDataResponseA.json()).find((s: any) => s.key === 'address');
    expect(address).toBeTruthy();
    expect(address.value).toBe(newAddress);
  });

});