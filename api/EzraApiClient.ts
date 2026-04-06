import { type APIRequestContext, expect, request } from '@playwright/test';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Booking {
  member: { email: string };
  type:   string;
  [key: string]: unknown; // allow access to other fields without breaking type checks
}

/**
 * Parameters for the `authenticate()` method.
 * All fields are required — callers decide which endpoint and credentials
 * to use, keeping the method free of assumptions about caller identity.
 */
export interface AuthParams {
  username:  string;
  password:  string;
  clientId:  string;
  /** Use `EzraApiClient.USER_AUTH_ENDPOINT` or `EzraApiClient.MEMBER_AUTH_ENDPOINT`. */
  endpoint:  string;
}

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * API client for the Ezra staging back-end.
 * Base URL: https://stage-api.ezra.com
 *
 * Mirrors the Page Object Model pattern — all endpoint knowledge lives here.
 * Tests import this class and call named methods; they never construct raw
 * fetch / APIRequestContext calls themselves.
 *
 * Usage (admin):
 *   const api = await EzraApiClient.create();
 *   await api.authenticate({
 *     username: process.env.ADMIN_EMAIL!,
 *     password: process.env.ADMIN_PASSWORD!,
 *     clientId: EzraApiClient.ADMIN_CLIENT_ID,
 *     endpoint: EzraApiClient.USER_AUTH_ENDPOINT,
 *   });
 *   const booking = await api.waitForBooking(memberEmail);
 *   await api.dispose();
 *
 * Usage (member):
 *   await api.authenticate({
 *     username: process.env.MEMBER_EMAIL!,
 *     password: process.env.MEMBER_PASSWORD!,
 *     clientId: EzraApiClient.MEMBER_CLIENT_ID,
 *     endpoint: EzraApiClient.MEMBER_AUTH_ENDPOINT,
 *   });
 */
export class EzraApiClient {
  private readonly context: APIRequestContext;
  private accessToken: string | null = null;

  static readonly BASE_URL = 'https://stage-api.ezra.com';

  // ── Auth endpoint constants ───────────────────────────────────────────────────
  /** OAuth token endpoint for admin / portal users. */
  static readonly USER_AUTH_ENDPOINT   = '/individuals/user/connect/token';
  /** OAuth token endpoint for member-facing clients. */
  static readonly MEMBER_AUTH_ENDPOINT = '/individuals/member/connect/token';

  // ── Client ID constants ───────────────────────────────────────────────────────
  static readonly ADMIN_CLIENT_ID  = '356575C0-6E1F-47EB-AB14-23705D8C5BFE';
  /** Replace with the actual member-facing client ID if it differs. */
  static readonly MEMBER_CLIENT_ID = 'F59A84B4-6E6B-4678-97A0-11C0F6E0719F';

  private static readonly AUTH_SCOPE        = 'openid offline_access profile roles email';
  private static readonly BOOKINGS_ENDPOINT = '/packages/odata/appointments';

  private constructor(context: APIRequestContext) {
    this.context = context;
  }

  // ── Factory ───────────────────────────────────────────────────────────────────

  /**
   * Create a new client with its own isolated APIRequestContext.
   * Call `dispose()` in afterAll to release the underlying connections.
   */
  static async create(): Promise<EzraApiClient> {
    const context = await request.newContext({ baseURL: EzraApiClient.BASE_URL });
    return new EzraApiClient(context);
  }

  /** Release the underlying APIRequestContext. Call in afterAll. */
  async dispose(): Promise<void> {
    await this.context.dispose();
  }

  // ── Auth ──────────────────────────────────────────────────────────────────────

  /**
   * Authenticate against the given token endpoint and store the access token
   * for use in subsequent requests.
   *
   * The method is intentionally free of hardcoded credentials or endpoint
   * assumptions — the caller controls all four parameters, making it usable
   * for both admin (user) and member auth flows.
   *
   * @param params.username - The account email / username
   * @param params.password - The account password
   * @param params.clientId - The OAuth client_id for this application type
   * @param params.endpoint - Token endpoint path:
   *                          `EzraApiClient.USER_AUTH_ENDPOINT`   for admin/portal
   *                          `EzraApiClient.MEMBER_AUTH_ENDPOINT` for member-facing
   *
   * @example
   * // Admin authentication
   * await api.authenticate({
   *   username: process.env.ADMIN_EMAIL!,
   *   password: process.env.ADMIN_PASSWORD!,
   *   clientId: EzraApiClient.ADMIN_CLIENT_ID,
   *   endpoint: EzraApiClient.USER_AUTH_ENDPOINT,
   * });
   *
   * @example
   * // Member authentication
   * await api.authenticate({
   *   username: process.env.MEMBER_EMAIL!,
   *   password: process.env.MEMBER_PASSWORD!,
   *   clientId: EzraApiClient.MEMBER_CLIENT_ID,
   *   endpoint: EzraApiClient.MEMBER_AUTH_ENDPOINT,
   * });
   */
  async authenticate({ username, password, clientId, endpoint }: AuthParams): Promise<void> {
    const response = await this.context.post(endpoint, {
      headers: {
        'Accept':       '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      form: {
        grant_type: 'password',
        scope:      EzraApiClient.AUTH_SCOPE,
        username,
        password,
        client_id:  clientId,
      },
    });

    expect(response.ok(), `Auth request failed: ${response.status()} ${endpoint}`).toBeTruthy();

    const body = await response.json();
    this.accessToken = body.access_token;
  }

  // ── Bookings ──────────────────────────────────────────────────────────────────

  /**
   * Fetch the most recent booking for a member by email.
   * Returns the first booking in the result set, or null if none found.
   */
  async getLatestBookingByEmail(memberEmail: string): Promise<Booking | null> {
    this.assertAuthenticated();

    const response = await this.context.get(EzraApiClient.BOOKINGS_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept:        '*/*',
      },
      params: {
        search: memberEmail,
        top:    1,
      },
    });

    expect(response.ok(), `Bookings request failed: ${response.status()}`).toBeTruthy();

    const { value: bookings } = await response.json();
    return bookings.length > 0 ? (bookings[0] as Booking) : null;
  }

  /**
   * Poll the bookings endpoint until a booking appears for the given email,
   * or until the timeout is reached.
   *
   * The backend has eventual consistency after a UI booking — polling avoids
   * a fixed sleep and makes the timeout explicit and configurable.
   *
   * @param memberEmail - The email address to search for
   * @param options     - Polling configuration (mirrors Playwright's toPass options)
   */
  async waitForBooking(
    memberEmail: string,
    options: {
      timeout?:   number;
      intervals?: number[];
    } = {
      timeout:   300_000,
      intervals: [10_000, 20_000, 30_000],
    },
  ): Promise<Booking> {
    let booking: Booking | null = null;

    await expect(async () => {
      booking = await this.getLatestBookingByEmail(memberEmail);
      expect(booking, `No booking found yet for ${memberEmail}`).not.toBeNull();
    }).toPass(options);

    return booking!;
  }

  // ── Assertions ────────────────────────────────────────────────────────────────

  /**
   * Assert that a booking belongs to the expected member and scan type.
   * Centralising these assertions means a schema change only requires
   * updating this method, not every test that calls it.
   */
  assertBookingMatchesMember(
    booking: Booking,
    expected: { email: string; scanType: string },
  ): void {
    expect(booking).toBeDefined();
    expect(booking.member.email).toBe(expected.email);
    expect(booking.type).toBe(expected.scanType);
  }

  async getSubmissionDetails(encounterId: string): Promise<any> {
    const response = await this.context.get(`/diagnostics/api/medicaldata/forms/mq/submissions/${encounterId}/detail`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept:        '*/*',
      }
    });

    expect(response.ok(), `Request failed: ${response.status()}`).toBeTruthy();

    return await response.json();
  }

  async postSubmissionData(submissionId: string,  data: any ): Promise<any> {
    console.log(`Posting submission data: ${JSON.stringify(data)}`);
    return await this.context.post(`/diagnostics/api/medicaldata/forms/mq/submissions/${submissionId}/data`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept:        '*/*',
        'Content-Type':'application/json',
      },
      data: data,
    });
  }

  async getSubmissionData(submissionId: string): Promise<any> {
    return await this.context.get(`/diagnostics/api/medicaldata/forms/mq/submissions/${submissionId}/data`, {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept:        '*/*',
      }
    });
  }

  // ── Private helpers ───────────────────────────────────────────────────────────

  private assertAuthenticated(): void {
    if (!this.accessToken) {
      throw new Error(
        'EzraApiClient: no access token — call authenticate() before making authenticated requests.',
      );
    }
  }
}