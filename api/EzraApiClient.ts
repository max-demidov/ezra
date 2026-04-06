import { type APIRequestContext, expect, request } from '@playwright/test';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Booking {
  member: { email: string };
  type:   string;
  [key: string]: unknown;  // allow access to other fields without breaking type checks
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
 * Usage:
 *   const api = await EzraApiClient.create();
 *   await api.authenticateAsAdmin();
 *   const booking = await api.waitForBooking(memberEmail);
 *   await api.dispose();
 */
export class EzraApiClient {
  private readonly context: APIRequestContext;
  private accessToken: string | null = null;

  static readonly BASE_URL = 'https://stage-api.ezra.com';

  // Keep auth constants here so a credential change is a one-line edit.
  private static readonly AUTH_ENDPOINT  = '/individuals/user/connect/token';
  private static readonly AUTH_CLIENT_ID = '356575C0-6E1F-47EB-AB14-23705D8C5BFE';
  private static readonly AUTH_SCOPE     = 'openid offline_access profile roles email';
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
   * Authenticate with the User Facing Portal and store the access token
   * for use in subsequent requests.
   *
   * Credentials are read from environment variables — never hardcoded.
   * Set KRAKOVSKY_EMAIL and KRAKOVSKY_PASSWORD in your .env file.
   */
  async authenticateAsAdmin(): Promise<void> {
    const response = await this.context.post(EzraApiClient.AUTH_ENDPOINT, {
      headers: {
        'Accept':       '*/*',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      form: {
        grant_type: 'password',
        scope:      EzraApiClient.AUTH_SCOPE,
        username:   process.env.KRAKOVSKY_EMAIL!,
        password:   process.env.KRAKOVSKY_PASSWORD!,
        client_id:  EzraApiClient.AUTH_CLIENT_ID,
      },
    });

    expect(response.ok(), `Auth request failed: ${response.status()}`).toBeTruthy();

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

  // ── Private helpers ───────────────────────────────────────────────────────────

  private assertAuthenticated(): void {
    if (!this.accessToken) {
      throw new Error(
        'EzraApiClient: no access token — call authenticateAsAdmin() before making authenticated requests.',
      );
    }
  }
}