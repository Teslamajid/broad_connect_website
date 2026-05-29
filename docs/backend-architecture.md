# BroadConnect — Backend System Architecture

**Scope:** Backend blueprint for the existing **Check Availability** (homepage `#coverage`) and **Checkout** (`/pages/checkout.html`) flows.
**Status:** Design document. Implementation-agnostic (no vendor lock-in). Detailed enough to implement directly.

---

## 1. Design Principles

1. **The frontend is never trusted.** Plan IDs, prices, eligibility, and availability are always re-derived/re-validated server-side. The URL params (`?plan=...&price=...`) the checkout page reads today are treated as *hints*, never as authority.
2. **Stateless API tier, stateful data tier.** All app servers are horizontally scalable; all durable state lives in the database, cache, and object store.
3. **Idempotent writes.** Every state-changing endpoint accepts an idempotency key so retries (network, double-clicks, webhook redelivery) never create duplicates.
4. **Separation of concerns.** Synchronous request path does the minimum needed to answer the user; everything else (notifications, CRM sync, provisioning) is pushed to background workers.
5. **Single source of truth for money.** Pricing lives in a server-side Plan/Pricing catalog. The client only ever displays prices; it never computes or submits them as authoritative.

---

## 2. Component Map

```
                       ┌──────────────────────────────────────────────┐
   Browser (UI)        │                  Edge / CDN                   │
  ┌───────────┐        │  - Static assets, TLS, WAF, global rate-limit │
  │ #coverage │──────► │  - Caches GET /availability responses (short) │
  │ checkout  │        └───────────────────┬──────────────────────────┘
  └───────────┘                            │
                                           ▼
                        ┌──────────────────────────────────────────────┐
                        │              API Gateway / BFF                 │
                        │  - AuthN/AuthZ, CSRF, per-IP & per-session     │
                        │    rate limiting, request validation, schema   │
                        │  - Routes to domain services                   │
                        └───┬───────────────┬───────────────┬──────────-┘
                            │               │               │
              ┌─────────────▼───┐  ┌────────▼────────┐  ┌───▼─────────────┐
              │ Availability     │  │ Checkout/Order  │  │ Lead/Notify     │
              │ Service          │  │ Service         │  │ Service         │
              └───┬───────┬──────┘  └───┬────────┬────┘  └───────┬─────────┘
                  │       │             │        │               │
       ┌──────────▼┐ ┌────▼─────┐  ┌────▼───┐ ┌──▼──────────┐ ┌──▼─────────┐
       │ Geocoding │ │ Coverage │  │ Pricing│ │ Payment      │ │ Message    │
       │ Provider  │ │ DB / GIS │  │ Catalog│ │ Provider     │ │ Queue      │
       │ (pluggable)│ │ + cache  │  │        │ │ (pluggable)  │ │            │
       └───────────┘ └──────────┘  └────────┘ └──────────────┘ └──────┬─────┘
                                                                       ▼
                                                            ┌────────────────────┐
                                                            │ Background Workers   │
                                                            │ - email/SMS          │
                                                            │ - CRM/provisioning    │
                                                            │ - webhook reconcile   │
                                                            └────────────────────┘
                                          ┌──────────────────────────────┐
                                          │ Primary DB (RDBMS, ACID)      │
                                          │ Cache (KV)  Object store (logs)│
                                          └──────────────────────────────┘
```

### Service responsibilities

| Service | Responsibility |
|---|---|
| **API Gateway / BFF** | TLS termination, authentication, CSRF, input schema validation, rate limiting, request/response shaping for the browser. |
| **Availability Service** | Normalize + geocode the address, query coverage data, apply availability business rules, return serviceable plans. Read-heavy, cacheable. |
| **Checkout/Order Service** | Create and manage checkout sessions and orders, recompute pricing/eligibility, talk to the payment provider, finalize on confirmation. Write-heavy, transactional. |
| **Lead/Notify Service** | Capture leads (including "not available — notify me"), enqueue customer/staff notifications, sync to CRM. |
| **Pricing Catalog** | Authoritative plans, prices, currency, features, eligibility constraints. Versioned. |
| **Coverage DB / GIS** | Serviceable areas (polygons, postcodes, street ranges, or premise IDs) and per-area capacity/technology (FTTH, fixed wireless). |
| **Payment Provider (pluggable)** | Hosted checkout/session creation and webhook events. Abstracted behind an interface so it can be swapped. |
| **Message Queue + Workers** | Decoupled background processing for notifications, provisioning, and webhook reconciliation. |

---

## 3. API Endpoints (called by the frontend)

| Method | Path | Purpose | Auth |
|---|---|---|---|
| `POST` | `/api/v1/availability/check` | Check service availability for an address. | Public + rate-limited |
| `GET`  | `/api/v1/availability/result/{token}` | Re-fetch a prior availability result (cacheable, shareable). | Public |
| `POST` | `/api/v1/leads` | Capture "notify me when available" / sales lead. | Public + rate-limited |
| `GET`  | `/api/v1/plans` | List active plans + server-side prices (the UI must render from this, not from hardcoded HTML). | Public |
| `POST` | `/api/v1/checkout/session` | Create a checkout session from a plan + availability token. | Public/optional account |
| `GET`  | `/api/v1/checkout/session/{id}` | Read current session state (polling/confirmation page). | Session-scoped token |
| `POST` | `/api/v1/checkout/session/{id}/confirm` | Submit customer details + lock the order; returns payment redirect or "contact me" completion. | Session-scoped token |
| `POST` | `/api/v1/webhooks/payment` | Provider → backend payment event sink. | Signature-verified |

All `POST` write endpoints accept an `Idempotency-Key` header.

---

## 4. Availability Check — Detailed Flow

### 4.1 Request

```http
POST /api/v1/availability/check
Content-Type: application/json
X-CSRF-Token: <token>          # if session cookie present
Idempotency-Key: <uuid>        # optional for reads, used to coalesce

{
  "address": "12 Wilkinson Road, Freetown",
  "districtHint": "Western Area Urban",   // optional
  "geo": { "lat": 8.484, "lng": -13.234 } // optional, if UI has it
}
```

### 4.2 Server steps

1. **Validate input** at the gateway against a strict schema: address required, length bounds, character allowlist, strip control chars. Reject oversize payloads early (e.g., > 2 KB).
2. **Rate limit** per IP and per session (e.g., token bucket, ~10/min/IP). Excess → `429`.
3. **Normalize + geocode.** Availability Service normalizes the raw string and calls the **Geocoding Provider** (pluggable interface) to resolve to `{lat, lng, normalizedAddress, premiseId?, confidence}`.
4. **Cache lookup.** Build a cache key from the rounded geo / normalized premise (`avail:{geohash7}` or `avail:{premiseId}`). On hit, return immediately.
5. **Query coverage data.** On miss, query the **Coverage DB / GIS**:
   - Point-in-polygon against serviceable-area polygons, **or**
   - Premise-ID / street-range lookup, **or**
   - Postcode/district table — whichever the data supports.
   Return matched area(s) with `technology`, `maxSpeed`, `capacityState`.
6. **Apply business rules** (pure, server-side, versioned):
   - Area must be `active` (not merely "planned").
   - `capacityState != FULL` (else `WAITLIST`).
   - Geocode `confidence ≥ threshold`; below threshold → `NEEDS_VERIFICATION` (ask for more address detail) rather than a false "available".
   - Cross-reference **Pricing Catalog** to return only plans whose `technology`/`area` constraints match.
7. **Persist a lightweight availability record** (see §6) keyed by a short-lived **availability token**, so checkout can reference an immutable, server-verified result instead of re-deriving from user input.
8. **Cache the result** with a short TTL (e.g., 5–15 min for serviceable, 30–60 min for not-serviceable) to absorb repeat checks and plan-browsing.

### 4.3 Response

```json
{
  "availabilityToken": "av_8sd...",     // referenced later by checkout
  "status": "AVAILABLE",                 // AVAILABLE | WAITLIST | NOT_AVAILABLE | NEEDS_VERIFICATION
  "normalizedAddress": "12 Wilkinson Rd, Freetown",
  "technology": "FTTH",
  "serviceablePlans": [
    { "planId": "ftth_standard", "name": "Standard", "priceMinor": 55000, "currency": "SLE", "period": "month" }
  ],
  "expiresAt": "2026-05-29T12:30:00Z"
}
```

> The current UI shows a generic "available / not available" message. This contract is a drop-in upgrade: `status` drives the same two UI states, while `availabilityToken` + `serviceablePlans` wire availability directly into checkout.

---

## 5. Checkout — Detailed Flow

The current page reads `plan`/`price` from the URL and fakes a submit. The backend replaces this with three calls: **create session → (display) → confirm**, plus async **webhook** finalization.

### 5.1 Create session

```http
POST /api/v1/checkout/session
Idempotency-Key: <uuid>
{
  "planId": "ftth_standard",
  "availabilityToken": "av_8sd..."   // optional but preferred
}
```

Server:
1. **Resolve the plan from the Pricing Catalog** by `planId`. **Ignore any client price.** The authoritative `priceMinor`, `currency`, and `features` come from the catalog.
2. **Validate eligibility:** if an `availabilityToken` is present, load that record, confirm it is unexpired and `AVAILABLE`/`WAITLIST`, and confirm the plan is in its `serviceablePlans`. If absent, mark session `eligibilityState = UNVERIFIED` (allowed to proceed as a lead, but flagged).
3. **Create a `CheckoutSession`** row (status `OPEN`) capturing the resolved plan snapshot (price at this moment), currency, eligibility state, and a server-generated **session token** (opaque, unguessable).
4. Return the session with a **price computed server-side**; the UI must render the summary from this response, not from the URL.

```json
{
  "sessionId": "cs_91a...",
  "sessionToken": "<opaque>",
  "plan": { "planId": "ftth_standard", "name": "Standard", "priceMinor": 55000, "currency": "SLE", "period": "month" },
  "dueTodayMinor": 0,
  "eligibilityState": "VERIFIED",
  "expiresAt": "2026-05-29T13:00:00Z"
}
```

### 5.2 Confirm (submit details + lock order)

```http
POST /api/v1/checkout/session/{id}/confirm
Idempotency-Key: <uuid>
Authorization: Bearer <sessionToken>
{
  "customer": {
    "fullName": "Aminata Mansaray",
    "email": "you@example.com",
    "phone": "+23276000000",
    "installationAddress": "12 Wilkinson Road, Freetown"
  },
  "consent": { "terms": true }
}
```

Server (inside a single DB transaction):
1. **Re-validate session**: exists, status `OPEN`, not expired, token matches.
2. **Re-validate customer input**: email format, phone (E.164 / local SL formats), required fields, length bounds, sanitize. Field errors → `422` with per-field codes.
3. **Re-resolve price + eligibility** *again* from the catalog/availability record (defense against catalog changes or token expiry between create and confirm). On mismatch → `409 PRICE_CHANGED` so the UI can re-display.
4. **Create/Upsert `Order`** (status `PENDING`) referencing the session; persist customer, plan snapshot, amount, eligibility state. Idempotency key guarantees one order per confirm attempt.
5. **Branch on charge model:**
   - **Pay-now plans:** create a **payment session** with the Payment Provider (server-side, amount from catalog), store `paymentRef`, set order `AWAITING_PAYMENT`, return a `redirectUrl`.
   - **"Contact me / installation-first" plans** (matches the current "No payment will be charged at this step" copy): set order `AWAITING_CONTACT`, enqueue lead + notifications, return a completion payload that drives the existing success panel.
6. Mark session `CONSUMED`.

```json
// pay-now
{ "orderId": "ord_5f...", "status": "AWAITING_PAYMENT", "redirectUrl": "https://pay.example/redirect/..." }
// contact-first
{ "orderId": "ord_5f...", "status": "AWAITING_CONTACT", "message": "We'll contact you to confirm installation." }
```

### 5.3 Confirmation / Webhook finalization (pay-now)

```http
POST /api/v1/webhooks/payment    # called by the Payment Provider
X-Signature: <hmac>
```

Server:
1. **Verify signature** against the provider secret; reject unsigned/invalid → `400`, no state change.
2. **Idempotent handling**: dedupe on provider `eventId` (store processed event IDs). Redeliveries are no-ops returning `200`.
3. **Match** the event to an `Order` via `paymentRef`.
4. **Transition** order: `paid` → `CONFIRMED`; `failed`/`expired` → `PAYMENT_FAILED` (recoverable, see §8).
5. **Enqueue** post-purchase work (receipt email/SMS, CRM/provisioning ticket). The webhook handler itself only updates state + enqueues; it must be fast and side-effect-light.
6. Always return `200` once persisted so the provider stops retrying.

> The browser does not learn the result from the webhook. The success page either (a) lands on a provider return URL and then **polls `GET /checkout/session/{id}`** until the order is `CONFIRMED`, or (b) for contact-first plans, shows success immediately from the confirm response.

---

## 6. Data Persistence

### Entities & key fields

**`AvailabilityCheck`** — audit + token store for availability results.
- `id`, `token` (unique), `rawAddress`, `normalizedAddress`, `geo`, `status`, `technology`, `serviceablePlanIds[]`, `confidence`, `createdAt`, `expiresAt`.

**`Lead`** — captures "notify me" + sales interest (also used when availability is `NOT_AVAILABLE`).
- `id`, `email`, `phone`, `address`, `source` (`COVERAGE_UNAVAILABLE` | `CHECKOUT` | `CONTACT_FORM`), `availabilityCheckId?`, `status` (`NEW` → `CONTACTED` → `CONVERTED`/`CLOSED`), `createdAt`.

**`CheckoutSession`** — short-lived intent.
- `id`, `sessionToken` (hashed), `planId`, `planSnapshot` (jsonb: name, priceMinor, currency, features), `eligibilityState`, `availabilityCheckId?`, `status` (`OPEN` → `CONSUMED`/`EXPIRED`), `idempotencyKey`, `createdAt`, `expiresAt`.

**`Order`** — durable record of the purchase/booking.
- `id`, `checkoutSessionId`, `customer` (name/email/phone/address), `planSnapshot`, `amountMinor`, `currency`, `eligibilityState`, `paymentRef?`, `status`, `idempotencyKey` (unique), timestamps.
- **Status machine:** `PENDING → AWAITING_PAYMENT → CONFIRMED` (pay-now) | `PENDING → AWAITING_CONTACT → CONFIRMED` (contact-first) | `→ PAYMENT_FAILED` | `→ CANCELLED`.

**`PaymentEvent`** — webhook idempotency ledger.
- `eventId` (unique), `orderId`, `type`, `payloadHash`, `processedAt`.

**`IdempotencyKey`** — generic dedupe table for write endpoints.
- `key` (unique), `endpoint`, `requestHash`, `responseSnapshot`, `status` (`IN_PROGRESS`/`DONE`), `createdAt`, `expiresAt`.

### Idempotency & retries

- **Write endpoints**: on receipt, the service `INSERT … ON CONFLICT (key) DO NOTHING`. If the key exists and is `DONE`, return the stored response. If `IN_PROGRESS`, return `409`/retry-after (request already running). This makes double-submits and client retries safe.
- **Webhooks**: deduped via `PaymentEvent.eventId`. Provider retries are absorbed.
- **Request hashing**: store a hash of the request body with the key so a re-used key with a *different* body is rejected (`422 IDEMPOTENCY_KEY_REUSED`).

---

## 7. Security & Integrity

| Concern | Control |
|---|---|
| **Server-side authority** | Prices, eligibility, availability re-derived from catalog/coverage DB on every write. Client-supplied `price` is ignored. |
| **AuthN/AuthZ** | Public endpoints are unauthenticated but rate-limited. Checkout confirm/read require the **opaque session token** (bearer) bound to that session; tokens are single-purpose and expire. Optional user accounts scope orders to a `userId`. |
| **CSRF** | If using cookie-based sessions, require a CSRF token (double-submit cookie or synchronizer token) on all state-changing requests. Pure token-in-header APIs (no ambient cookies) are CSRF-immune. |
| **Session protection** | Tokens are high-entropy, stored **hashed** at rest, short TTL, rotated on privilege change, transmitted over TLS only. |
| **Input validation/sanitization** | Strict schema validation at the gateway; allowlist characters; bound lengths; reject oversized bodies. Parameterized queries everywhere (no string-built SQL). |
| **Tamper prevention** | `availabilityToken` and `sessionToken` are server-issued and opaque; the server never accepts a plan/price the catalog didn't produce. Order amount is snapshotted server-side at confirm. |
| **Rate limiting / abuse** | Layered: edge/WAF global limit, per-IP and per-session token buckets on `availability/check`, `leads`, and `checkout/*`. Progressive backoff + CAPTCHA challenge on repeated abuse. |
| **Webhook trust** | HMAC signature verification + timestamp tolerance to block replay; idempotency ledger. |
| **PII handling** | Encrypt PII at rest; minimize logged PII (mask email/phone in logs); honor data-retention windows for `AvailabilityCheck`/`Lead`. |

---

## 8. Error Handling

**Principle:** stable machine-readable `code` + safe user message in the response; full detail (stack, upstream payloads, correlation ID) only in internal logs. Every response carries a `correlationId` echoed in logs for support.

| HTTP | `code` | User-facing message | Internal note |
|---|---|---|---|
| 400 | `INVALID_REQUEST` | "Please check the form and try again." | Schema violation detail logged. |
| 422 | `VALIDATION_FAILED` | Per-field messages (email/phone). | Field map logged. |
| 404 | `SESSION_NOT_FOUND` | "Your checkout session expired. Please start again." | Session id logged. |
| 409 | `PRICE_CHANGED` | "Pricing was updated — please review the new total." | Old/new price logged. |
| 409 | `SESSION_ALREADY_CONSUMED` | "This order was already submitted." | Return existing order. |
| 429 | `RATE_LIMITED` | "Too many attempts. Please wait a moment." | Limiter key logged. |
| 502/503 | `UPSTREAM_UNAVAILABLE` | "We're having trouble reaching a service. Try again shortly." | Geocoder/payment timeout logged. |

**Partial-failure recovery:**
- **Geocoder down** → degrade to district/postcode lookup or return `NEEDS_VERIFICATION` rather than failing hard; never return a false "available".
- **Payment session creation fails after Order created** → Order stays `PENDING`; a reconciliation job retries or expires it; user sees retry CTA.
- **Webhook missed** → a **reconciliation worker** polls the provider for orders stuck in `AWAITING_PAYMENT` past a threshold and self-heals to `CONFIRMED`/`PAYMENT_FAILED`.
- **Notification send fails** → retried with backoff from the queue; never blocks order confirmation.

---

## 9. Scalability & Reliability

- **Caching (availability reads):** cache normalized geocodes and coverage results in a KV store keyed by geohash/premise with short TTLs; serve repeat checks and plan browsing from cache. Edge-cache `GET /availability/result/{token}` and `GET /plans`. This protects the geocoder and GIS from load spikes.
- **Background processing boundary:** the synchronous path returns as soon as durable state is written (order persisted, payment session created). Emails/SMS, CRM sync, provisioning tickets, and webhook reconciliation run on **queue-backed workers** with retries + dead-letter queues. Webhook handlers persist + enqueue only.
- **Database transaction strategy:**
  - Wrap **confirm** (validate → create Order → create payment ref → consume session) in **one ACID transaction** so an order never exists without a consistent snapshot, and a session is never consumed without an order.
  - Use **unique constraints** (`Order.idempotencyKey`, `PaymentEvent.eventId`) as the last line of defense against duplicates even under concurrency.
  - Keep transactions short; do **no** network I/O to the payment provider *inside* the DB transaction — create the local order transactionally, then call the provider, then persist `paymentRef` (idempotent). On crash between steps, reconciliation heals it.
  - Read-heavy availability uses read replicas / cache; write-heavy checkout uses the primary.
- **Statelessness & scaling:** API tier scales horizontally behind the gateway; all state in DB/cache/queue. Health checks + graceful draining for zero-downtime deploys.

---

## 10. End-to-End Sequence

```
User           UI            Gateway        Availability    Coverage/Geo     Checkout/Order     Pricing      Payment Provider     Queue/Workers
 │  enter addr  │                │                │               │                │               │                │                  │
 │─────────────►│  POST /availability/check ─────►│               │                │               │                │                  │
 │              │                │  validate+RL   │               │                │               │                │                  │
 │              │                │───────────────►│ geocode ─────►│                │               │                │                  │
 │              │                │                │◄── coords ────│                │               │                │                  │
 │              │                │                │ query coverage│                │               │                │                  │
 │              │                │                │ rules + plans (reads Pricing) ─────────────────►│                │                  │
 │              │                │◄─ token+plans ─│  cache result │                │               │                │                  │
 │◄ result ─────│◄───────────────│                │               │                │               │                │                  │
 │ pick plan    │                │                │               │                │               │                │                  │
 │─────────────►│  POST /checkout/session ───────────────────────────────────────►│ resolve price │                │                  │
 │              │                │                │               │                │ (ignore client price) ────────►│                  │
 │◄ session ────│◄──────────────────────────────────────────────────────────────│  create OPEN   │                │                  │
 │ fill details │                │                │               │                │               │                │                  │
 │─────────────►│  POST /checkout/session/{id}/confirm ──────────────────────────►│ TX: revalidate │                │                  │
 │              │                │                │               │                │  create Order  │                │                  │
 │              │                │                │               │                │  create payment session ──────►│ session created  │
 │◄ redirectUrl │◄──────────────────────────────────────────────────────────────│  AWAITING_PAYMENT                │                  │
 │ pay on provider ─────────────────────────────────────────────────────────────────────────────────────────────►│ (user pays)      │
 │              │                │                │               │                │  ◄── POST /webhooks/payment ────│ payment.succeeded│
 │              │                │                │               │                │  verify sig + dedupe            │                  │
 │              │                │                │               │                │  Order → CONFIRMED              │                  │
 │              │                │                │               │                │  enqueue receipt/provisioning ──────────────────►│ workers run
 │ return page  │  GET /checkout/session/{id} (poll) ────────────────────────────►│  status: CONFIRMED             │                  │
 │◄ success ────│◄──────────────────────────────────────────────────────────────│                                 │                  │
```

**Contact-first variant:** at confirm, the order is set to `AWAITING_CONTACT`, a lead + notifications are enqueued, and the success panel (the existing `#checkoutSuccess` block) is shown immediately — no payment provider or webhook involved.

---

## 11. Mapping to the Current Frontend

| Today (mock) | Backend replacement |
|---|---|
| `CoverageForm` uses `Math.random()` | `POST /availability/check` → real geocode + coverage rules → `status` drives the same success/error UI. |
| Plan cards link `#coverage` / pass `?plan&price` | `GET /plans` feeds the cards; `availabilityToken` carries the verified result into checkout. |
| Checkout reads `?plan&price` from URL | `POST /checkout/session` returns server-authoritative price; UI renders summary from it. |
| Fake `setTimeout` submit + success panel | `POST /checkout/session/{id}/confirm` → real order; success panel shown from confirm (contact-first) or after polling `CONFIRMED` (pay-now). |
