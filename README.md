# Ezra — Playwright Test Suite

End-to-end and API integration tests for the [Ezra member portal](https://myezra-staging.ezra.com), written in TypeScript with [Playwright](https://playwright.dev).

Covers the member registration and booking happy path, cross-member data privacy (IDOR prevention), and payment verification — with a CI pipeline on GitHub Actions.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup](#setup)
3. [Environment Variables](#environment-variables)
4. [Running Tests](#running-tests)
5. [Project Structure](#project-structure)
6. [Architecture & Design Decisions](#architecture--design-decisions)
7. [Trade-offs & Assumptions](#trade-offs--assumptions)
8. [Scalability](#scalability)
9. [Future Work](#future-work)

---

## Prerequisites

| Tool | Minimum version | Notes |
|------|----------------|-------|
| Node.js | 18 LTS | Required by Playwright |
| npm | 9 | Bundled with Node 18 |

No global installs are required beyond Node.js. Playwright browsers are installed as part of `npm install`.

---

## Setup

```bash
# 1. Clone the repository
git clone https://github.com/max-demidov/ezra.git
cd ezra

# 2. Install dependencies and Playwright browsers
npm install
npx playwright install --with-deps chromium

# 3. Create your local .env file from the template
cp .env.example .env
# Then open .env and fill in the credentials (see Environment Variables below)
```

---

## Environment Variables

All credentials are stored in a local `.env` file that is **never committed to source control** (`.env` is listed in `.gitignore`). The `.env.example` file documents the required keys without values.

| Variable | Used by | Description |
|---|---|---|
| `MEMBER_A_EMAIL` | `CrossMemberDataAccessPrevention` | Email of the pre-existing staging member who owns the test questionnaire |
| `MEMBER_A_PASSWORD` | `CrossMemberDataAccessPrevention` | Password for Member A |
| `MEMBER_B_EMAIL` | `CrossMemberDataAccessPrevention` | Email of a second staging member used as the attacker |
| `MEMBER_B_PASSWORD` | `CrossMemberDataAccessPrevention` | Password for Member B |
| `KRAKOVSKY_EMAIL` | `BookingHappyPath` (Step 4) | Admin portal account used to verify bookings via the back-end API |
| `KRAKOVSKY_PASSWORD` | `BookingHappyPath` (Step 4) | Password for the admin account |

> **CI:** In GitHub Actions, these variables are stored as repository secrets and injected automatically — no `.env` file is needed in the pipeline.

---

## Running Tests

```bash
# Run the full test suite (headless, Chromium)
npx playwright test

# Run a specific test file
npx playwright test tests/BookingHappyPath.spec.ts
npx playwright test tests/CrossMemberDataAccessPrevention.spec.ts

# Run with a visible browser window (useful for debugging)
npx playwright test --headed

# Run in debug mode — opens Playwright Inspector, pauses on each step
PWDEBUG=1 npx playwright test

# Open the HTML report after a run
npx playwright show-report
```

> **`slowMo`:** `playwright.config.ts` adds a 200 ms delay between browser operations. This reduces flakiness on the SPA (which re-renders between interactions) at the cost of slightly slower runs. Remove `slowMo` for maximum CI speed once selectors are stable.

---

## Project Structure

```
ezra/
├── api/
│   └── EzraApiClient.ts                         # API client — all back-end HTTP calls live here
├── pages/
│   ├── JoinPage.ts                              # /join — member registration
│   ├── SelectPlanPage.ts                        # Scan selection + slot scheduling
│   └── PaymentPage.ts                           # Stripe payment + confirmation screen
├── tests/
│   ├── BookingHappyPath.spec.ts                 # E2E: register → book → pay → confirm
│   └── CrossMemberDataAccessPrevention.spec.ts  # API: IDOR prevention
├── .env.example                                 # Template — copy to .env and fill in values
├── .gitignore
├── package.json
├── playwright.config.ts
└── README.md
```

### Layer responsibilities

**`pages/`** — Page Object Models. Each class owns the selectors and actions for one page or view. Tests never call `page.locator()` directly. If a selector changes, only the relevant POM needs updating.

**`api/`** — API Client. Mirrors the POM pattern for the back-end. All endpoint paths, auth constants, and request construction live in `EzraApiClient`. Tests call named methods and never build raw HTTP requests inline.

**`tests/`** — Spec files only. No selectors, no URLs, no raw HTTP calls. Each test reads like a plain-English description of what it's verifying.

---

## Architecture & Design Decisions

### Serial test steps over a single monolithic test

`test.describe.serial` breaks the end-to-end flow into individually named steps. This has two practical benefits: the Playwright HTML report shows exactly which step failed (e.g., "Select a plan and slot" rather than a 3-minute test named "Happy path"), and skipping subsequent steps when an early one fails avoids misleading failures downstream.

The trade-off is that serial tests cannot run in parallel within a suite. This is acceptable here because the steps share state (a live browser session and a booking in progress) that cannot be meaningfully parallelised anyway.

### Shared page instance in `beforeAll`

A single `Page` object is created once in `beforeAll` and reused across all serial steps. This preserves session cookies, local storage, and navigation state across steps — which is the correct model for an E2E flow where each step depends on the previous one leaving the browser in a specific state.

### `EzraApiClient` factory pattern

The constructor is private; callers use `EzraApiClient.create()`. This is necessary because instantiating an `APIRequestContext` is async — you cannot `await` inside a constructor. The factory makes the async initialisation explicit and keeps the calling code clean. `dispose()` is always called in `afterAll` to release the underlying HTTP connections.

### Two clients for the privacy test

`CrossMemberDataAccessPrevention` creates two independent `EzraApiClient` instances (`apiClientA`, `apiClientB`), each with its own `APIRequestContext` and access token. This mirrors a real attack scenario: Member B has a fully valid, authenticated session — the test is not checking that unauthenticated requests are rejected (that's a separate, simpler test), but that a legitimately authenticated member cannot access another member's resources.

### Raw `APIResponse` returned from questionnaire methods

`postSubmissionData` and `getSubmissionData` return `Promise<APIResponse>` rather than parsing the response body. This is intentional: the same methods are called in both positive-path tests (where the caller asserts `.ok()`) and negative-path tests (where the caller asserts `.status() === 403`). Parsing inside the client would force it to throw on non-200 status codes, which would break the negative-path assertions. The JSDoc on both methods explains this explicitly.

### Selector strategy in Page Objects

Locators are chained with `.or()` in priority order: `data-testid` → ARIA role/label → placeholder/name → CSS. This means:

- Tests work immediately without `data-testid` attributes (using semantic fallbacks)
- Upgrading to `data-testid` later is a one-line change in the POM, not in every test
- Selectors survive CSS class renames and component refactors

---

## Trade-offs & Assumptions

**Staging environment dependency.** All tests run against `myezra-staging.ezra.com` and `stage-api.ezra.com`. There is no local mock server. This means tests require network access to staging, and a staging outage or deployment will cause test failures that are not bugs in the test code. The trade-off is realism: tests exercise the real SPA with real auth flows, real Stripe test cards, and real API responses, which catches integration issues that mocked environments miss.

**Pre-existing test accounts for the privacy test.** `CrossMemberDataAccessPrevention` uses two fixed staging accounts with known encounter IDs (`MEMBER_A_ENCOUNTER_ID`). These must be created and maintained in the staging environment. The alternative — registering fresh accounts per run — would add 2–3 minutes to each run and introduce its own setup-failure modes. The assumption is that a QA-managed set of stable staging fixtures is more reliable than fully dynamic data.

**`BookingHappyPath` creates a real booking per run.** The test registers a new member with a unique email and completes a payment with Stripe's test card. This leaves booking records in staging that accumulate over time. The assumption is that staging data retention is not a concern and that the test email (`happy_path+<timestamp>@test.ezra.com`) is sufficient to distinguish test bookings from real ones. A cleanup step in `afterAll` would be the correct fix if staging bloat becomes an issue.

**`slowMo: 200` is a pragmatic flakiness fix.** The Ezra member portal is a Vue SPA that re-renders between route transitions. Without a delay, Playwright occasionally clicks elements that are mid-transition and not yet interactive. The correct long-term fix is to add explicit `waitFor` assertions before each interaction (e.g., wait for a loader to disappear), but `slowMo` provides a working baseline while the suite is being established.

**Only Chromium is enabled.** Firefox and WebKit are commented out in `playwright.config.ts`. The trade-off is faster CI runs and simpler debugging. Cross-browser coverage should be enabled before the suite is used for release sign-off.

**Step 4 of `BookingHappyPath` is skipped by default.** The booking verification API call (`/packages/odata/appointments`) can take up to 10 minutes due to eventual consistency in the back-end. It is marked `test.skip()` to avoid blocking the CI pipeline. It can be re-enabled locally when specifically verifying back-end booking creation.

---

## Scalability

The current architecture scales in three directions without structural changes:

**New pages** — add a file to `pages/`. The spec imports it and calls its methods. No changes to existing files.

**New API resources** — add methods to `EzraApiClient` under a new section comment. The typed interface pattern (`SubmissionAnswer`, `Booking`) should be extended — new resource shapes get their own exported interfaces at the top of the file.

**New test suites** — add a file to `tests/`. The config picks up all files automatically. Shared state between suites (e.g., a pre-authenticated session) can be managed with Playwright's [global setup](https://playwright.dev/docs/test-global-setup-teardown) once the number of suites makes per-suite auth overhead significant.

The main scaling constraint today is the single-worker CI configuration (`workers: 1` on CI). This is appropriate for serial E2E tests that share staging state, but independent test suites (e.g., pure API tests with no UI) can safely run in parallel and should be separated into a parallel project in `playwright.config.ts` as the suite grows.

---

## Future Work

**Stable `data-testid` selectors.** The POM selectors fall back to ARIA labels and placeholders today. Coordinate with engineering to add `data-testid` attributes to all interactive elements on the booking flow. This makes selectors unambiguous and eliminates the `.or()` chains.

**Global authentication setup.** Once there are multiple test suites that all need an authenticated member session, move authentication into `globalSetup` and save the storage state to disk. Tests can then restore the session without re-authenticating on every run, cutting the overhead significantly.

**Test data management.** Introduce a teardown step (or a dedicated cleanup API call) to delete test accounts and bookings created by `BookingHappyPath` after each run. This prevents staging from accumulating thousands of `happy_path+<timestamp>@test.ezra.com` accounts over time.

**Broaden the IDOR test.** `CrossMemberDataAccessPrevention` currently covers the Medical Questionnaire. The same two-client attack pattern should be templated and applied to other PHI-bearing resources: scan reports, booking details, and appointment records. A parametrised helper that takes a resource path and runs the four attack vectors (GET with own token, nested GET, PATCH mutation, token replay) would give full IDOR coverage across all endpoints with minimal additional code.

**Cross-browser coverage.** Uncomment Firefox and WebKit in `playwright.config.ts` and verify that the booking flow and Stripe iframe behave consistently. Run the cross-browser suite nightly rather than on every commit to keep PR feedback fast.

**Enable Step 4 of `BookingHappyPath`.** Work with the back-end team to understand the expected consistency window for booking creation, then either reduce the polling interval once a realistic timeout is known, or move the step to a separate nightly suite with a longer timeout budget.

**Contract tests for API response shapes.** The `EzraApiClient` types (`Booking`, `SubmissionDetails`, `SubmissionAnswer`) document the expected API response shapes, but they are not enforced at runtime. Adding a lightweight JSON schema validation step inside the client methods would catch API schema regressions before they cause obscure test failures.

**Negative-path UI tests.** The current UI suite covers only the happy path. Add negative-path specs for common failure modes: invalid card declined, duplicate email on registration, no available slots, session expiry mid-booking.
