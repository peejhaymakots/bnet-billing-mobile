# B-Net Billing Android Client App

Development handoff for an Android version of the existing `/client` portal.
Reviewed against repository commit `45e7895` on November 12, 2026 (PHT).
Sign-in guidance refreshed November 20, 2026 (PHT), against the web release `4973997` and the current native starter.

**Status: an Expo / React Native starter already exists here. It is not yet a complete replacement for the client website.** This README documents current behavior and the work needed; proposed endpoints and screens below are not implemented by this document.

Production website: [B-Net Billing](https://bnetbilling.thebathan.com).
Mobile repository: [bnet-billing-mobile](https://github.com/peejhaymakots/bnet-billing-mobile). Backend repository: [beenetbillingsystem](https://github.com/peejhaymakots/beenetbillingsystem).

Visual and content reference: [Website Design](https://github.com/peejhaymakots/beenetbillingsystem/blob/main/docs/DESIGN.md). Reuse its colors, status meanings, readability, and English/Filipino helper conventions. The native navigation proposed below differs from the current website; this document still defines the Android feature gaps and implementation plan.

## 1. Scope And Architecture

Build a client-only Android app using the existing Expo, React Native, and TypeScript workspace. Keep administration on the website. Reuse the Worker business logic; do not create another billing database or calculate authoritative balances in the app.

```text
Android app -> HTTPS /api/mobile/* -> Cloudflare Worker
                                      |-- D1: accounts, billing, tokens, mappings
                                      |-- private R2: attachments, router snapshots
                                      |-- existing email/SMS services

Monitoring VM <-> authenticated Worker bridge <-> private router commands/snapshots
       |
       +-- GenieACS / existing router action engine
```

The app must never connect directly to D1, R2, the monitoring VM, or GenieACS. Cloudflare, email, SMS, monitoring, and router-bridge secrets belong only on the backend. This is a native client, not an HTML-scraping wrapper around `/client`.

### Source Map

| File | Responsibility |
| --- | --- |
| [`src/App.tsx`](src/App.tsx) | Existing screens, API calls, token persistence, file selection |
| [`package.json`](package.json) | Expo / React Native dependencies and scripts |
| [`app.json`](app.json) | App name, Android package, permissions, URL scheme |
| [`eas.json`](eas.json) | Preview APK and production Android App Bundle profiles |
| [`../../src/index.ts`](https://github.com/peejhaymakots/beenetbillingsystem/blob/main/src/index.ts) | `mobileRoutes`, bearer authentication, mobile billing/proof handlers, web UI |
| [`../../src/billing.ts`](https://github.com/peejhaymakots/beenetbillingsystem/blob/main/src/billing.ts) | Billing calculations, proof validation, mobile-token helpers |
| [`../../src/client-network-section.ts`](https://github.com/peejhaymakots/beenetbillingsystem/blob/main/src/client-network-section.ts) | Existing web network/usage behavior to reuse behind JSON handlers |
| [`../../src/router-registry.ts`](https://github.com/peejhaymakots/beenetbillingsystem/blob/main/src/router-registry.ts) | Verified router-to-subscription ownership and access modes |
| [`../../src/router-actions.ts`](https://github.com/peejhaymakots/beenetbillingsystem/blob/main/src/router-actions.ts) | Encrypted commands, confirmation, rate limiting, replay protection |
| [`../../docs/router-management-pilot.md`](https://github.com/peejhaymakots/beenetbillingsystem/blob/main/docs/router-management-pilot.md) | Router integration, VM scheduling, security, rollback |

## 2. What Exists And What Is Missing

The starter has Home, Bills, Pay, Proofs, and Account tabs. It includes client login, Expo SecureStore token persistence, balance/plan display, bills, QR previews, payment submission, proof replacement/deletion, logout, and account-password change. These are code capabilities, not a claim of successful APK/device acceptance testing.

Known gaps to resolve before distributing it:

- `loadAll()` fetches five endpoints together on startup and every refresh. Split loading by screen; an optional section must not block the whole app.
- Payments are fetched into state but are not rendered. Add expandable payment IDs and complete allocation details.
- Bills, payments, and proofs have a backend cap of 100 records, not proper pagination. Do not label that cap as a full history.
- The app shows all subscriptions together. Add a persistent selected-line control, while keeping account-wide payment totals clear.
- The Cash form still shows attachment controls. Hide and clear attachments for Cash, and replace old "Upload proof" wording with "Submit Payment."
- `PaymentMethod` incorrectly assumes every method has QR URLs. The API returns `null` for Cash; do not open or render a null QR URL.
- The picker button says "Camera or gallery," but the implementation only opens the image library. Either add camera capture with permission handling or correct the label.
- Proof DTOs contain `viewUrl`, but the app does not implement viewing. That URL points to a web-cookie-authenticated route, not a mobile-bearer route.
- Payment dates default from UTC and several dates are shown raw. Use PHT dates and readable timestamps consistently.
- Password-eye controls, older-user accessibility, confirmation/success flows, and Tagalog helper text need parity with the website.
- Native Network Health, Internet Usage, Router Management, plan upgrades, HomeFlix requests, and standalone announcements are missing.
- The API helper lacks timeouts and assumes every response is JSON. Handle network errors, HTML gateway errors, cancellation, and unauthorized responses centrally.
- Direct dependencies are pinned to versions carried over from the billing workspace. Verify Expo compatibility on a real Android build before release.

`pnpm run check` passed during this documentation review. No Android device run, signed APK build, or Play Store release was performed.

## 3. Target Client Experience

Use four bottom navigation items: **Home**, **Bills & Payments**, **Submit Payment**, and **More**. More contains How to Pay, Internet Usage, Router Management, Announcements when allowed, Change Password, and Logout. This is the target navigation, not the starter's current tabs.

| Screen | Required content and behavior |
| --- | --- |
| Login | Match the website's Email / Mobile number selector, existing account password, visibility control, and support-based recovery. See the sign-in handoff below. |
| Home | "Hello, {Name}"; Total Outstanding Balance; Payment for Verification; selected plan; one clear next action. Show a negative balance in green when there is credit, rather than another Account Credit card. |
| Internet line selector | Use the subscription alias and plan name. Preserve selection across network/router/upgrade screens. Never combine different lines' readings. Avoid displaying internal subscription IDs to clients. |
| Bills & Payments | Bill History first, Recent Payments below. Five records per section/page. Tap a payment ID to expand its amount, date, method, reference, allocations by bill month, applied amount, and remaining credit. Close without navigating away. Include pending submissions with accurate statuses. |
| Submit Payment | Show only For Verification submissions above the form. Fields: Amount, Payment Date, Method, Reference Number (Optional), Attach screenshot. JPG/PNG/PDF up to 5 MB. Hide attachment controls for Cash. Review, confirm, submit, then show success. |
| Proof details | In-app image/PDF preview. Replace/delete only when permitted by the server; approved proofs stay immutable. Show admin rejection/reversal notes and PHT submission time. |
| How to Pay | Separate page with admin-managed methods and instructions. GCash, Maribank, ShopeePay and Cash; large QR preview and download/share where applicable. No QR for Cash. Remind users to submit payment details afterward. |
| Internet Usage | Network health, fiber category (not raw optical readings), connected since, freshness, 15-minute to 24-hour bandwidth ranges, custom start/end, and 7/30/60-day usage history. Touch-select Download/Upload readings. Missing or stale data is not zero usage or proof of an outage. |
| Router Management | Select one enabled line; show connected devices above router speed tests, test history, and Wi-Fi settings. Hide networks reported Off; preserve Unknown status. Do not display the router model. Wi-Fi changes need confirmation, not another B-Net account-password prompt. |
| HomeFlix / upgrades | Included access for eligible PHP 1,200 / PHP 1,500 and VIP plans. Clearly explain separate HomeFlix registration. Eligible lower plans get upgrade, trial, PHP 150/month and PHP 1,500/year add-on offers. Other eligible upgrade choices must not disappear. |
| Announcements | Paginated, readable content; no announcements or plan-upgrade marketing for VIP clients. |
| Change Password | Current account password, new password and confirmation; success message followed by sign-in again. This is separate from changing the router's Wi-Fi password. |

HomeFlix links: [Create an account](https://info.thebathan.com/register) and [How to watch / FAQs](https://info.thebathan.com/). These are external destinations, not shared B-Net login sessions. Never forward a billing token to them. Eligibility and available offers must come from server rules, not duplicated hardcoded mobile prices.

### Readability And Helper Text

- English primary labels with short Tagalog/Taglish helper text. Do not prefix helper text with "Tagalog:".
- Use comfortable body text, large touch targets (aim for at least 48 dp), Android font scaling, accessible labels, and clear loading/empty/error states.
- Support small phones and tablets without horizontal scrolling or fixed-height text clipping.
- Use status words as well as color. Keep destructive actions separate and confirm them.
- Examples: "Piliin ang internet line na gusto ninyong tingnan." / "Hinihintay pa ang verification ng B-Net. Huwag muna pong ulitin ang submission." / "Pagkatapos magpalit ng Wi-Fi name o password, ikonekta ulit ang inyong devices."
- Format dates as `November 12, 2026`; timestamps as `November 12, 2026 at 8:00 AM PHT`. Treat date-only billing fields as calendar dates, not device-local timestamps.

### Android Sign-in Handoff

**Current vs. target:** The website supports email or Philippine mobile number. The Android starter and its JSON login endpoint still accept email only. Keep the native screen's single-column layout; deliver phone support in the Worker before distributing an APK that offers the selector.

- Default to **Email**. Selecting **Mobile number** replaces only the identifier field. Show a fixed, accessible **+63** prefix next to a telephone-keypad input, with placeholder `917 123 4567`. Accept pasted local or international formats without adding a second prefix. Use the same password field and **Sign in** button in both modes; this is not OTP login.
- Use the [Sign-in copy](https://github.com/peejhaymakots/beenetbillingsystem/blob/main/docs/UI_COPY.md#login), show/hide password control, and expandable **Forgot your password?** help. Keep the selected method after an error. Disable repeat submits while signing in. Use a scrollable, keyboard-safe layout and announce errors to TalkBack.
- **Proposed API extension:** Keep the current email payload unchanged. Alternatively accept `{phone,password,deviceName,platform}` at `POST /api/mobile/login`; require exactly one identifier. Keep the mobile bearer-token response, expiry, revocation, and SecureStore behavior unchanged.
- Reuse the web login's number normalization, indexed lookup, client-only restriction, and password verification. A shared number must never select an account: return a generic failure suggesting email. Use the same rate-limit keys across web and native for normalized numbers and the matched account. Never log credentials or identifiers.
- Before release: test email, national and pasted international numbers, wrong passwords, shared numbers, admin denial, and HTTP 429. On a small Android phone, verify both methods, autofill, large text, TalkBack, and that **Sign in** remains reachable with the keyboard open.

## 4. Existing Mobile API Contract

Base URL is the Worker origin, without a trailing `/api/mobile`. All routes below already exist. Except login and OPTIONS, they require a client bearer token:

```http
Authorization: Bearer <client-mobile-token>
```

| Method | Path | Current response / input |
| --- | --- | --- |
| POST | `/api/mobile/login` | JSON `{email,password,deviceName,platform}` -> `{token,expiresAt,user}` |
| POST | `/api/mobile/logout` | Revokes current token; returns `{ok:true}` |
| GET | `/api/mobile/me` | `{user}` |
| GET | `/api/mobile/dashboard` | `{user,totals,subscriptions,bills,proofs,notices,announcements}`; up to 8 latest bills, 8 pending/rejected proofs and 5 announcements |
| GET | `/api/mobile/bills` | `{bills}`; current limit 100 |
| GET | `/api/mobile/payments` | `{payments}` with `paymentCode`, `unappliedAmount`, and `allocations`; current limit 100 |
| GET | `/api/mobile/payment-methods` | `{paymentMethods}` with `qrUrl`, `downloadUrl`, `requiresAttachment`; includes Cash |
| GET | `/api/mobile/proofs` | `{proofs}` with `displayStatus`, `adminNote`, `canModify`, `createdAt`, `viewUrl`; current limit 100 |
| POST | `/api/mobile/proofs` | Multipart payment submission; returns `{proof}` with HTTP 201 |
| POST | `/api/mobile/proofs/:id/replace` | Multipart replacement file, optionally revised payment details; owner-only, pending/rejected only |
| POST | `/api/mobile/proofs/:id/delete` | Owner-only, pending/rejected only; `{ok:true}` |
| POST | `/api/mobile/account/password` | JSON `{currentPassword,newPassword,confirmPassword}`; revokes web/mobile sessions and returns a sign-in-again message |

Multipart names are `claimed_amount`, `payment_date` (`YYYY-MM-DD`), `method`, `reference`, and `proof_file`. Keep these transport names even though the visible label is **Amount**. Let the networking library set the multipart boundary.

Login response example (synthetic values):

```json
{
  "token": "<returned-only-on-login>",
  "expiresAt": "<ISO-8601 timestamp>",
  "user": {"id": 123, "name": "Sample Client", "email": "client@example.test", "isVip": false}
}
```

Common errors are `{ "error": "message" }`: 401 for absent/expired credentials, 403 for forbidden operations, 409 for duplicate submissions, and 429 for login rate limiting. Also handle non-JSON 5xx responses. Router mutation rate limiting must remain intact when adding its native adapter.

### Authentication Boundaries

- Mobile tokens currently expire after 90 days. They are hashed in D1, stored by the app in Expo SecureStore, and checked on requests. There is no mobile refresh-token endpoint or automatic sliding renewal today; do not promise unlimited login.
- Mobile token `last_used_at` updates are throttled to approximately once per 15 minutes, not on every request.
- Password changes and admin resets revoke sessions. Handle 401 on every screen, not just startup; clear private in-memory data and return to login.
- Web `/client/*` pages use signed cookies. A mobile bearer token is not a web session. Do not place tokens in URLs, scrape HTML, forge Origin headers, or disable web same-origin checks to make native requests work.
- `/proofs/:id/view` currently requires web-cookie authentication. Add a mobile-authenticated binary preview endpoint before implementing native proof viewing. Do not make private proofs publicly accessible as a shortcut.
- The existing `/payment-methods/:id/qr` route serves payment QR media, including links used in billing emails. It is not the same authorization contract as a private proof. Handle null URLs for Cash and image formats returned by the route.

## 5. Backend Work Needed For Website Parity

The following are **proposed contracts, not available routes**. Finalize schemas and tests before the app calls them.

| Proposed endpoint / extension | Purpose |
| --- | --- |
| Cursor pagination for `/api/mobile/bills`, `/payments`, `/proofs` | Default five history records per section; return `nextCursor` / `hasMore` and a server-enforced maximum. Preserve separate bill/payment page state. |
| `GET /api/mobile/payments/:id` | Full owner-scoped payment detail on expansion, instead of all allocations on initial load. |
| `GET /api/mobile/proofs/:id/view` | Private image/PDF stream authenticated with the mobile bearer token. |
| `GET /api/mobile/announcements` | Standalone paginated announcements with VIP visibility enforced. |
| `GET /api/mobile/subscriptions/:id/network` | Lightweight current health and timestamps for one owned active line. |
| `GET /api/mobile/subscriptions/:id/usage` | Bounded bandwidth samples and daily totals with validated time ranges. |
| `GET /api/mobile/routers` | Only the signed-in client's enabled, verified lines and access/capability flags. |
| `GET /api/mobile/subscriptions/:id/router` | Sanitized Wi-Fi/device snapshot, freshness, latest request and bounded history. No raw R2 keys or GenieACS paths. |
| `POST /api/mobile/subscriptions/:id/router/actions` | Reuse existing command checks/encryption; return a structured request ID/status rather than a browser redirect. |
| `GET /api/mobile/subscriptions/:id/router/actions/:requestId` | Owner-scoped operation status; never arbitrary R2 reads. |
| Mobile upgrade/HomeFlix offer and request endpoints | Reuse existing selected-line eligibility, duplicate protection, approval queue, and notifications. |
| Mobile payment-reversal request endpoint | Preserve the existing approval workflow; clients never reverse approved payments directly. |

Use thin mobile route adapters around shared business services. Do not maintain a second implementation of payment allocation, proof approval, router encryption, or subscription ownership. Audit existing mobile proof replace/delete handlers for atomic status checks and D1/R2 failure cleanup before wider release; client-side button restrictions are not sufficient.

### Router Rules That Must Carry Over

- Check the authenticated user, active subscription, verified mapping, access mode, and assignment version on every read/action. Never trust a submitted user ID.
- Disabled access returns no router details. View Only cannot submit settings or diagnostics. Manage Wi-Fi permits only supported actions.
- Do not ask for the B-Net account password again when changing Wi-Fi settings. Keep explicit confirmation, ownership checks, input validation, rate limiting, command expiry and duplicate/replay protection.
- Preserve `_2.4G` / `_5G` naming using verified band metadata or the existing safe suffix logic; do not identify ownership from SSID names.
- Hide only Wi-Fi entries explicitly reported Off. Unknown is not Off. Do not silently change radio enablement.
- Use the existing native router test, 50 MB per direction/test, with confirmation and bounded history. Do not substitute the phone's Wi-Fi speed for router throughput.
- Poll saved status at most every 20 seconds only while the router screen is focused and the app is foregrounded. Stop timers and abort requests on navigation, backgrounding, logout, or line changes. Never poll all clients or issue a new diagnostic on each poll.
- A phone refresh does not contact the router directly. Show snapshot freshness separately from router contact; preserve stale-data restrictions and unavailable states.
- Keep the VM bridge and its dedicated secret entirely server-side. Never embed them in the APK.

## 6. Low-Resource And Security Requirements

- Load a small Home summary first. Load bills, payments, media, charts and router details only on the relevant screen; avoid the starter's five-request `loadAll()` pattern.
- Filter D1 reads by the authenticated account and selected subscription where applicable. Use explicit columns, indexed predicates, and bounded lists. Remove per-bill lookup loops in `mobileBillList` when expanding history.
- Keep all authoritative amounts and allocation rules on the Worker. A payment is account-wide even when the selected network/router view is line-specific. Pending submissions do not reduce the balance.
- Keep private JSON and media `private, no-store`. Do not put tokens, personal data, Wi-Fi values, proof images or raw responses in logs/analytics.
- Use HTTPS in release builds. Never disable certificate validation. `EXPO_PUBLIC_*` values are bundled into the app and must not contain secrets. See [Expo environment variables](https://docs.expo.dev/guides/environment-variables/).
- Request only necessary permissions at the point of use. Review the starter's CAMERA and READ_MEDIA_IMAGES declarations against the implemented picker/camera flow. Billing and router management do not require contacts, SMS, or location permissions.
- Add finite request timeouts, cancellation and independent section failures. Retry reads conservatively; do not automatically replay payment submissions or Wi-Fi mutations after a timeout. Check existing submission/request status first.
- Keep server duplicate-attachment and payment-submission protection; disable duplicate taps and retain a stable request key if a new mobile idempotency contract is added.
- Do not claim CPU savings without measurements. Measure representative authenticated routes separately; preserve authorization and input validation even when optimizing for Cloudflare Free.
- Usage totals are currently labeled estimates because of known overlapping VM lookback windows. Keep that qualification until the sender/history correction is verified. See [monitoring limitations](https://github.com/peejhaymakots/beenetbillingsystem/blob/main/docs/client-monitoring-handoff-review.md).
- Email/SMS remain backend notifications. Android push notifications are a separate future feature, not implemented by this starter; no provider credentials belong in the app.

## 7. Windows Development Setup

Use a Node.js version compatible with the locked Expo SDK and the repository (backend tooling requires Node 22.16+), pnpm, and Android Studio/SDK with a configured emulator or USB-debugging device. Check the Expo SDK's toolchain requirements before changing versions.

From the repository root:

```powershell
Set-Location <mobile-repository-root>
pnpm install --frozen-lockfile
pnpm run check
```

The starter defaults to **production** when `EXPO_PUBLIC_API_BASE_URL` is unset. Set a development URL explicitly before testing writes. Never create test bills, payments, or router commands against real customers.

For an Android Studio emulator, use the host alias `10.0.2.2`, not `127.0.0.1` (which refers to the emulator itself). See [Android emulator networking](https://developer.android.com/studio/run/emulator-networking-address).

Terminal 1, from the backend repository, run the local Worker with local D1/R2 and development-only secrets:

```powershell
pnpm run db:migrate:local
pnpm run dev
```

Terminal 2, from this mobile repository:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://10.0.2.2:8787"
pnpm run android
```

For subsequent Metro sessions with the installed app:

```powershell
$env:EXPO_PUBLIC_API_BASE_URL="http://10.0.2.2:8787"
pnpm run start
```

For a physical device, use an authorized HTTPS staging Worker or a reachable development host address; the emulator alias does not work on a real phone. Any local cleartext exception must be development-only. A tunnel for the Expo bundle does not automatically expose the Worker API. Do not open D1, R2, GenieACS, or the VM to the phone.

The runtime reads `process.env.EXPO_PUBLIC_API_BASE_URL` in `src/App.tsx`; changing only `app.json`'s `extra.apiBaseUrl` does not change the current API helper.

## 8. APK And Store Builds

Current identifiers: app name `B-Net Billing`, Android package `com.thebathan.bnetbilling`, scheme `bnetbilling`. Preserve the package/signing identity for updates. The configured version is `1.0.0`; establish an Android version-code policy before release.

Run from the mobile app directory, after resolving the release blockers:

```powershell
pnpm dlx eas-cli login
pnpm dlx eas-cli build:configure
pnpm dlx eas-cli build --platform android --profile preview
```

The existing `preview` profile requests an installable APK; `production` requests an Android App Bundle. See [Expo APK builds](https://docs.expo.dev/build-reference/apk/) and [first build setup](https://docs.expo.dev/build/setup/). Establish EAS project ownership and signing credentials, review configuration changes, and set the intended non-secret API URL for each build environment. Do not assume local shell variables automatically configure a remote build.

For a production bundle after device acceptance testing:

```powershell
pnpm dlx eas-cli build --platform android --profile production
```

Before distribution, add a proper launcher/adaptive icon and splash artwork using the B-Net brand, verify Android back behavior and permissions, and complete the privacy/distribution requirements for the chosen channel. An APK built successfully is not proof that backend parity or security checks passed.

Worker changes still deploy only through GitHub `main` and Cloudflare's Git integration. Do not run direct production `wrangler deploy`. Building/installing the Android app is a separate release; a Git push does not install a new APK on users' phones.

## 9. Implementation And Acceptance Checklist

1. Stabilize dependencies and extract the API client/screens from `App.tsx` without changing billing rules. Add timeouts, consistent 401 handling, data cleanup, and screen-local loading.
2. Complete billing parity: selected lines, wording, PHT dates, Cash handling, private proof preview, paginated Bills & Payments, allocation expansion, and safe confirmation/retry flows.
3. Add tested JSON adapters for network/usage, eligible requests and announcements. Keep missing data and optional failures independent from billing.
4. Add the router JSON adapters using the existing ownership and command services. Start with synthetic fixtures, then approved read-only pilot checks; obtain explicit permission before real Wi-Fi changes or speed tests.
5. Test an APK on small Android phones and a tablet with slow/offline networks, large font sizes, denied media permissions, background/resume and rapid line switching.
6. Release to a small authorized client group, monitor sanitized errors and Worker/D1/R2 usage, then expand. Keep the existing website available as a fallback.

Required verification:

- Login accepts clients only; admin credentials cannot access the mobile API. Logout, expiration and password resets remove access and clear private app state.
- Changing a bill/proof/subscription/router/request ID cannot expose another account. Test multiple lines belonging to one user and lines belonging to different users.
- Amounts and allocation details match the website, including negative balances, partial payments, pending/rejected/reversed proofs and immutable approved proofs.
- JPG/PNG/PDF validation, 5 MB rejection, duplicate Cash/file submissions, replacement/deletion races, and upload failure cleanup are covered server-side.
- Cash never renders QR/file controls. Preview/download works for the configured QR format and private proof type, including PDF.
- Historical pages show five items and stable pagination without silently losing older records.
- Wi-Fi name/password changes succeed without a second account-password prompt, but fail without session ownership, permission, confirmation or valid input. Off networks remain hidden.
- Router polling stops outside the foreground router screen; stale responses from a previously selected line cannot replace the current line's details.
- No secret or private account/router data is logged, bundled or shared through external links. Notifications contain no Wi-Fi passwords.

Run from the repository root:

```powershell
pnpm run check
pnpm run test
pnpm run check
```

These checks do not replace Android runtime testing. Existing backend tests are a starting point; add native-screen and mobile-route tests for every new feature. No production database migration, router action, or app build is required merely to use this README.
