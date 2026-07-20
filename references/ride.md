# Ride Reference

> All agent-facing operations use `tada <subcommand> [args…]` (PATH-resident). Two scripts that cannot live on PATH (`ride-relay.js`, `install.js`) are invoked via `node ${SKILL_DIR}/scripts/<name>.js` — see `../SKILL.md` for the path convention.

## Place Search

### place_search - Autocomplete suggestions

Before running `place_search` to resolve a ride origin or destination, ask the user for their current location (latitude/longitude) to improve search accuracy. If the user does not know or does not provide it, proceed without it — the search will use the city center as bias point.

```bash
tada place-search <wallet_address> <city> <query> [latitude] [longitude] --json
```

- `city`: **City code** (e.g. `SIN`, `BKK`) or English city name. Do NOT use region codes (`SG`, `TH`) here — those are for `ride_search` only.

| City code | English name | Region code | Country |
|-----------|--------------|-------------|---------|
| `SIN` | Singapore | `SG` | Singapore |
| `BKK` | Bangkok | `TH` | Thailand |
| `DEN` | Denver | `CO` | USA |
| `HCM` | Ho Chi Minh / Saigon | `VN` | Vietnam |
| `HAN` | Hanoi | `VN` | Vietnam |
| `PNH` | Phnom Penh | `KH` | Cambodia |
| `REP` | Siem Reap | `KH` | Cambodia |
| `SHV` | Sihanoukville | `KH` | Cambodia |
| `KPK` | Kampot | `KH` | Cambodia |
| `SEL` | Seoul | `KR` | Korea |
| `ADD` | Addis Ababa | `ET` | Ethiopia |
| `JKT` | Jakarta | `ID` | Indonesia |
| `HKG` | Hong Kong | `HK` | Hong Kong |
| `NYC` | New York | `NY` | USA |

`place_search` uses **city code**, `ride_search` uses **region code**. Use this table to convert between them.

- `query`: Search term (place name, address, etc.)
- `latitude` / `longitude`: Optional. User's current location for bias. Omit if unknown.

Response shape:

```json
{
  "results": [ /* PlaceResult[] */ ],
  "next_action": "ASK_USER_TO_PICK_ONE_RESULT" | "REPORT_NO_MATCHES_TO_USER",
  "must": "..."  // present only when results is non-empty
}
```

Each item in `results`:
- `placeId`: Place ID — opaque token. Treat as a black box.
- `name`: Place name
- `address`: Place address
- `locationPoint`: `{ latitude, longitude }` coordinates — present for TADA POI / OneMap results, `null` for Google Places results
- `subPlaces`: Array of sub-locations (e.g. gates, lobbies, entrances) — may be empty

Show results to the user using `name` and `address`. Ask them to select one.

If `next_action` is `REPORT_NO_MATCHES_TO_USER` (empty `results`): inform the user and ask them to try a different search term.

> **⚠️ placeId provenance rule (strictly enforced)**
> Any `placeId` / `place_id` argument passed to a subsequent command (`tada place-detail`, `tada map-session-create`, `tada ride-request` `locations[].placeId`) MUST be a value taken verbatim from `results[].placeId` of a `place_search` response — or, transitively, from a `place_detail` / `map-session-verify` response that itself originated from one.
> NEVER fabricate or substitute a place ID from any external system or from your own model knowledge.
> If `results` does not contain the place the user wants, run `place_search` again with a different query.

### After user selects a place_search result

Check the selected result's `locationPoint`:

**If `locationPoint` is present (TADA POI / OneMap):** skip `place_detail` — coordinates and subPlaces are already available from the autocomplete result. Proceed directly to Map Location Confirmation.

**If `locationPoint` is null (Google Places):** run `place_detail` to fetch coordinates.

### place_detail - Fetch coordinates (only when locationPoint is null)

```bash
tada place-detail <wallet_address> <city> <place_id> --json
```

- `place_id`: `placeId` from the chosen `place_search` result

Response fields:
- `placeId`: Place ID
- `name` / `address`: Place name and address
- `locationPoint`: `{ latitude, longitude }` coordinates (may be `null`)
- `subPlaces`: Array of sub-locations (may be empty)

If `locationPoint` is `null`: inform the user and ask them to select a different result from the already-displayed `place_search` list. Do not re-run `place_search`.

### How to build the locations array

**A-1. User provided a place name → autocomplete result has `locationPoint`** → Build from autocomplete result directly (no place_detail)
```json
{
  "name": "<name from autocomplete result>",
  "address": "<address from autocomplete result>",
  "latitude": "<locationPoint.latitude from autocomplete result>",
  "longitude": "<locationPoint.longitude from autocomplete result>",
  "placeId": "<placeId from autocomplete result>"
}
```

**A-2. User provided a place name → autocomplete result has `locationPoint: null`** → Run place_detail, build from its result
```json
{
  "name": "<name from place_detail result>",
  "address": "<address from place_detail result>",
  "latitude": "<locationPoint.latitude from place_detail result>",
  "longitude": "<locationPoint.longitude from place_detail result>",
  "placeId": "<placeId from place_detail result>"
}
```

**B. User provided coordinates/address/name directly** → Build without scripts, no map session needed
```json
{
  "name": "<user-provided name, or use address if no name>",
  "address": "<user-provided address>",
  "latitude": "<user-provided latitude>",
  "longitude": "<user-provided longitude>"
}
```

Required: `latitude`, `longitude`, `address`, `name` (all required)
Optional: `placeId`, `googlePlaceId`, `subPlaceId`

### Map Location Confirmation

**⚠️ MANDATORY for Case A (both A-1 and A-2).** You MUST run map confirmation after obtaining coordinates. Do NOT skip this step. Do NOT proceed to `ride_search` without completing map confirmation for both origin and destination. If `subPlaces` exist, do NOT list them as text — they must go to the map.

After obtaining coordinates (from autocomplete result in Case A-1, or from place_detail in Case A-2), check whether subPlaces exist:

**If subPlaces exist:** map session is **mandatory** — the user must select a specific subPlace. The place itself is just a group. Do NOT allow the user to skip.

**If subPlaces do not exist:** map session is still created — present the link alongside the result for the user to verify/adjust if they want.

**Step 1: Create map session**

If `subPlaces` exist, transform and pipe them via stdin. The `subPlaces` array from autocomplete/place_detail uses `locationPoint: { latitude, longitude }`, but `map-session-create` expects flat `{ id, name, lat, lng, address }`. Transform each subPlace: `locationPoint.latitude → lat`, `locationPoint.longitude → lng`.

```bash
echo '{"subPlaces": [{"id":"...","name":"...","lat":<locationPoint.latitude>,"lng":<locationPoint.longitude>,"address":"..."},...]}'  | tada map-session-create <wallet_address> <city> <lat> <lng> [name]
```

If no subPlaces, call without stdin:
```bash
tada map-session-create <wallet_address> <city> <lat> <lng> [name]
```

Returns `{ sessionId, mapUrl, expiresAt }`.

**Step 2: Present result + link, start polling**

Show the place result together with the map link, e.g.:
> "Marina Bay Sands (1 Bayfront Avenue, Singapore 018971)
> You can verify or adjust the location on the map: [View on map](mapUrl)
> If this looks correct, just let me know to proceed."

Poll for the user's selection using `tada map-session-verify <session_id> --json` in a polling loop.

**Step 3: React to whichever signal comes first**

| Signal | Action |
|--------|--------|
| User says "proceed" / "looks good" | Use the place result as-is. Ignore the poll (session expires naturally). Only allowed when subPlaces do not exist. |
| Poll result: `completed` | Use the map result (`lat`, `lng`, `address`, `name`, `placeId`, `subPlaceId`) for the locations array. If `subPlaceId` is present, include it. |
| Poll result: `cancelled` | Ask the user: use the original place result, or search again? |
| Poll result: `expired` | Proceed with the place result (session timed out). |
| Poll result: `jwt_expired` | Re-authenticate (SIWE login), then run `map-session-create` again with fresh JWT. |

`tada map-session-verify <session_id> --json` output events:
- `{ "type": "waiting" }` — user has not selected yet
- `{ "type": "completed", "result": { "lat", "lng", "address", "name", "placeId?", "subPlaceId?" } }` — use this for the locations array
- `{ "type": "cancelled" }` — user closed the map without confirming
- `{ "type": "jwt_expired" }` — requires re-authentication
- `{ "type": "expired" }` — session timed out (5-minute TTL)

Do NOT create a map session when the user provided coordinates directly (Case B).

## Saved places (local catalog)

Frequent destinations and origins can be persisted locally so the agent can skip TADA autocomplete on subsequent rides.

> Auth asymmetry: `place-save` requires a valid JWT (it calls the gateway `/v1/places/resolve-google` endpoint). `place-list`, `place-remove`, `place-favorite`, and `place-unfavorite` are purely local (SQLite) and need no JWT — do not run a preflight auth check for them.

### Save a place

```
tada place-save <wallet_address> <google_maps_url> [--label LABEL] [--force]
```

- `<google_maps_url>`: a `google.com/maps/place/…` URL or a `maps.app.goo.gl/…` short link. The gateway resolves it to a canonical `ChIJ…` placeId and formatted address.
- `--label LABEL`: optional. Labels are case-insensitive (lowercased on write). Re-saving an existing label silently overwrites.
- `--force`: confirm an approximate match (see below).

**Exact match** — the URL resolves to a precise place. The CLI saves it immediately and exits 0.

**Approximate match** — when the URL cannot be resolved to an exact place, the CLI exits non-zero with:

```json
{ "error": "APPROXIMATE_MATCH_NEEDS_FORCE", "candidate": { "name": "…", "formatted_address": "…" } }
```

The agent MUST show the candidate `name` and `formatted_address` to the user and ask whether it is the correct place. Only after the user explicitly confirms should the agent re-run the same command with `--force` appended. Never pass `--force` without explicit user confirmation — and never in the same turn you first receive `APPROXIMATE_MATCH_NEEDS_FORCE`: stop, present the candidate, and wait for the user's reply first. This holds even if the user already named or labeled the place in their original request: an approximate match means the *resolved* candidate is uncertain, so it is the resolved candidate that must be confirmed, not the user's wording.

The persisted row includes more fields than agents typically need; for downstream ride construction use `name`, `formatted_address`, `latitude`, `longitude`, and `google_place_id`.

### List / look up saved places

```
tada place-list <wallet_address> [--match QUERY [--match QUERY ...]]
```

`--match` is repeatable. The agent should generate 2–5 candidate phrasings from the user's utterance (original wording, English transliteration, common aliases, plausible typos) and pass them all in one invocation.

Matching is **tier-per-pass union**:
1. Label exact (NOCASE) — first tier to hit wins.
2. Else name `LIKE %candidate%` (NOCASE union across all candidates).
3. Else formatted_address `LIKE %candidate%` (NOCASE union).
4. Else empty matches with `matched_tier: null`.

Output shape:

```json
{
  "matches": [ /* rows */ ],
  "matched_tier": "label" | "name" | "address" | null,
  "queries":      ["jacx", "잭스"],
  "next_action":  "USE_FOR_RIDE_OR_FALLBACK_TO_PLACE_SEARCH"
}
```

Empty matches return exit code `0` — this is the signal to fall through to `tada place-search`.

### Remove a saved place

```
tada place-remove <wallet_address> <id_or_label>
```

If the argument is an integer it's treated as the row `id`; otherwise as a `label`. Returns `{ removed: 1, id, label }` on success or `{ removed: 0, error: "NOT_FOUND" }` (still exit 0).

### Agent flow — Step 0 before any ride

Before running this flow, apply the **"Acknowledge before a long booking turn"** guardrail in `SKILL.md`: unless this turn's response is a question (not signed in / no destination / already-known-ambiguous), send a short acknowledgement first, then proceed. See that guardrail for the OpenClaw `message send` mechanics.

Places stored locally include both favorites (explicit, with labels) and history (auto-tracked from every successful ride-request, no label). `tada place-list --match QUERY` returns both, but `is_favorite=1` rows are sorted ahead of history, then by `hit_count` and `last_used_at`. When mixed results appear:
- If an `is_favorite=1` row matches, use it directly.
- If only history rows match, confirm with the user before booking ("Want to go back to <X>?").

Promote a history row to favorite with `tada place-favorite <wallet> <id_or_dedup_key> --label LABEL`. Demote with `tada place-unfavorite <wallet> <id_or_label>` (preserves hit_count). Auto-history fields on each row: `is_favorite`, `hit_count`, `last_used_at`. `hit_count` counts requests, not completions — cancelled rides still count.

When the user names an origin or destination, **always** start with:

1. Generate 2–5 candidate phrasings (original / English / alias / typo correction).
2. `tada place-list <wallet> --match "<c1>" --match "<c2>" …`
3. If `matches.length > 0`, construct the ride-request location directly from the row:

```json
{
  "name":      "<row.name>",
  "address":   "<row.formatted_address>",
  "latitude":  <row.latitude>,
  "longitude": <row.longitude>,
  "placeType": "GOOGLE",
  "placeId":   "<row.google_place_id>"
}
```

Skip `place-search` / `place-detail` / `map-session-create` for that endpoint. If `row.google_place_id` is null, omit both `placeType` and `placeId` — the ride still works on `name + address + lat/lng`.

If `matches` is empty (or the matched tier feels ambiguous and the candidates are off), fall through to the existing `place-search` flow.

## Ride

> **Two modes — run `tada whoami` first and read `mode`.** The ride commands have different argument forms per mode:
> - **`mode: "tada"` (TADA/Throo member)** — card-paid. Use the **Member mode** flow immediately below. **Do NOT call `ride-pay-prepare` / `ride-pay-confirm`** — they are wallet-only and return `MODE_MISMATCH` for members.
> - **`mode: "wallet"` (crypto)** — collateral/USDC-paid. Use the `<wallet_address>`-prefixed forms and the payment flow (`ride-pay-prepare → wallet-sign → ride-pay-confirm`) documented in the subsections after this one.

### Member mode (`mode: "tada"`) — card-paid ride flow

A logged-in TADA/Throo member pays with a registered card. There is **no separate payment step**: `ride-request` creates a `PENDING` ride and the card is charged directly. Do not run any `ride-pay-*` command.

The card (`payment_item_uuid` in `ride-request`, `card_uuid` in `ride-search`) is **optional**. When omitted, the CLI resolves it automatically via the gateway `GET /v1/cards` (see **Card resolution** below) — so the normal flow is to leave it out entirely. Pass it explicitly only when re-running after a `needs_card_selection` prompt.

**1. Search** — positional args (no `wallet_address`, no `region`; region is resolved automatically from coordinates). The trailing `card_uuid` is optional:
```bash
tada ride-search <origin_lat> <origin_lng> <dest_lat> <dest_lng> [card_uuid]
```

Each entry in the result's `routes[]` carries `distance_display` and `duration_display` already localized to the rider's region (US regions in miles, elsewhere in km). Present these strings verbatim — do **not** convert distance units yourself.

The result is `{ options[], routes[] }`. Each entry in `options[]` carries `product_name` — the rider-facing display name, already region-localized (e.g. `Save Throo` in NY). Present `product_name` to the user; do **not** surface the raw `car_type` / `product_type` enum values (`SEDAN`, `ANYTADA`) — the projection does not return them.

| Field | Meaning |
|---|---|
| `product_id` | Pass as `product_id` in `ride-request` |
| `product_name` | Rider-facing display name (already region-localized) |
| `price` | **The total the rider is charged** before any coupon or promotion — fares, fees, tolls and taxes included. A numeric string (e.g. `"31.35"`); the currency is in `price_currency`, never embedded here. Show exactly one price per option; there is no separate base fare to display. |
| `price_currency` | ISO currency code for `price` (e.g. `USD`) |
| `na` | `true` when the option cannot be booked right now. This is the single availability signal — it already accounts for every reason booking would reject the option. |

An option with `na: true` always has `price: null`, and an option with `na: false` always has a `price`. Offer only `na: false` options to the rider.

**2. Request** — a single JSON argument. `locations` is `[origin, destination]`; `payment_item_uuid` (the card) and `product_id` are both optional:
```bash
tada ride-request '{"locations":[{"latitude":<oLat>,"longitude":<oLng>,"name":"<origin name>","address":"<origin address>"},{"latitude":<dLat>,"longitude":<dLng>,"name":"<dest name>","address":"<dest address>"}],"product_id":<optional int>}'
```
Required field: `locations`. On success the ride is created in `PENDING` and the card is charged — **immediately start `ride-relay.js`** (see the ride-relay section). Do **not** call `ride-pay-prepare`/`ride-pay-confirm`.

> **Coordinates must be flattened out of the place response.** `place-search` / `place-detail` nest coordinates under `lat_lng`, and each location you send must carry them **top-level** as `latitude` / `longitude`:
>
> ```
> place-detail  →  { "place_id": …, "name": …, "lat_lng": { "latitude": 40.762048, "longitude": -73.938523 } }
> ride-request  →  { "place_id": …, "name": …, "latitude": 40.762048, "longitude": -73.938523 }
> ```
>
> The command tolerates the nested `lat_lng` container and the short `lat` / `lng` spelling, but emit the canonical flat form — it is the only shape the gateway itself accepts. Never omit the coordinates and expect them to be inferred: a location whose coordinates cannot be read fails with `INVALID_COORDINATES` rather than being routed to a guessed region. A `place-list` row already uses `latitude` / `longitude` and needs no conversion.

**3. Status / cancel** — the ride id is the `request_id` returned by `ride-request`:
```bash
tada ride-status <request_id>
tada ride-cancel <request_id> [reason] [--reason-type <id>]   # member form: no wallet_address argument
tada ride-cancel-penalty <request_id> [--reason-type <id>]    # member-only: preview cancellation fee before cancelling
```

After the driver is assigned, member-mode cancellation is a **two-step protocol** — the first call returns the reason list instead of cancelling. See `ride_cancel` below.

The status values and cancel-confirmation etiquette are identical to crypto mode — see `ride_status` and `ride_cancel` below. **Share links differ by mode:** member mode has no inline `rideShareUrl` on `ride-status`; use the `ride-share` command below (it calls the gateway). Crypto mode surfaces `rideShareUrl` inline on `ride-status` / monitor events.

#### Card resolution

When the active mode is `tada` (TADA/Throo member), `payment_item_uuid` in `ride-request` and `card_uuid` in `ride-search` are **optional**. The CLI calls the gateway `GET /v1/cards` internally and selects the card automatically — the agent does not call this endpoint directly.

**Fields in the `needs_card_selection` payload.** When the CLI cannot resolve a single card, each entry in the emitted `cards[]` array carries only these fields:

| Field | Notes |
|-------|-------|
| `id` | Use this value as `payment_item_uuid` (ride-request) or `card_uuid` (ride-search) |
| `card_brand` | Card brand, e.g. `"American Express"` (may be `null`) |
| `card_last4` | Last 4 digits, for display |
| `is_expired` | Authoritative expiry flag — trust this; do **not** recompute from expiry dates |
| `is_default` | Per-card flag set by the user in the TADA/Throo app; NOT the account-level default payment method |

**Additional fields of the underlying card record** (present on the full card object the CLI uses internally, but NOT in the `needs_card_selection` payload above): `exp_month` / `exp_year` (may be `0` = unknown — treat `0` as "not available", not "January year 0"), `country`, `issuer`.

**Resolution outcomes:**

| Condition | Result |
|-----------|--------|
| 0 cards or all `is_expired` | `NO_CARD` error — tell user to add a card in the TADA/Throo app |
| 1 non-expired card | That card is auto-selected; ride proceeds without agent action |
| 2+ non-expired cards, exactly one with `is_default: true` | The default is auto-selected; ride proceeds without agent action |
| 2+ non-expired cards, no single default | Returns `{ needs_card_selection: true, cards: [...], next_action: "ASK_USER_TO_PICK_CARD_THEN_RERUN_WITH_payment_item_uuid" }` — present the list, ask the user to pick, re-run with the chosen card's `id` |
| Card lookup fails (gateway error or expired session) | `CARD_LOOKUP_FAILED` error |

Cards are **scoped to the pickup's region**: the lookup runs against the regional gateway derived from the origin coordinates. Correct coordinates are therefore a precondition for finding the rider's cards — this is why a location with unreadable coordinates is rejected outright (`INVALID_COORDINATES`) instead of being routed to a default region. If a user insists a card exists in the app but you get `NO_CARD`, re-check the coordinates you passed before telling them to add another card.

Card register, delete, and set-default operations are not exposed by the CLI — they live in the TADA/Throo rider app.

### Crypto mode (`mode: "wallet"`) — collateral/USDC ride flow

> **JWT expired / `JWT_NOT_FOUND` mid-ride → re-authenticate with SIWE, then retry the failed command.**
> If any crypto command (`ride-search`, `setup-check`, `ride-pay-prepare`, …) returns `JWT expired` or `JWT_NOT_FOUND`, run these three commands **in order**, then re-run the command that failed. They are **positional — do NOT invent `--siwe` / `--file` / any flag**, and the argument order is exact:
> ```bash
> tada siwe-request-message <wallet_address> <chain_id>   # → returns siwe_file path
> tada wallet-sign <wallet_address> personal_sign <siwe_file>   # 3rd arg is the FILE PATH, not the message text → returns signature
> tada siwe-submit <siwe_file> <signature>                # order: siwe_file FIRST, then signature
> ```
> `chain_id`: `84532` (BASE_SEPOLIA) or `11155111` (ETH_SEPOLIA). Full reference: `references/wallet.md` → SIWE Authentication.

### ride_search - Search for a ride

```bash
tada ride-search <wallet_address> <region> <origin_lat> <origin_lng> <dest_lat> <dest_lng>
```

- `region`: Service region code (e.g. `SG`, `NY`)

Searches available ride products for the given origin/destination coordinates.
The `search_id` (checkSum) from the result is cached in DB for 3 minutes.

Each entry in the result's `routes[]` carries `distance_display` and `duration_display` already localized to the ride's region (US regions in miles, elsewhere in km). Present these strings verbatim — do **not** convert distance units yourself.

### ride_request - Request a ride

```bash
tada ride-request <json_params>
```

`json_params` example:
```json
{
  "wallet_address": "0x...",
  "search_id": "checkSum from ride_search",
  "product_code": "STANDARD",
  "region": "SG",
  "pay_currency": "USDC_base_sepolia",
  "locations": [
    {
      "name": "Marina Bay Sands",
      "address": "1 Bayfront Avenue, Singapore 018971",
      "latitude": 1.2834,
      "longitude": 103.8607,
      "placeId": "ChIJ..."
    },
    {
      "name": "40 Sin Ming Lane",
      "address": "40 Sin Ming Lane, Midview City, Singapore 573958",
      "latitude": 1.3491,
      "longitude": 103.8321,
      "placeId": "ChIJ..."
    }
  ],
  "rider": { "name": "John Doe", "phone": "+821012345678" }
}
```

**Before calling `ride-request`, you must have both the rider's name and phone number confirmed by the user. If not already provided in the conversation, ask the user for their name explicitly. Never invent or guess a name.**

The `locations` array is [origin, destination] in order.

- `pay_currency`: Always use `USDC_base_sepolia` (Base Sepolia environment)
- `wallet_provider_id` is determined automatically from `pay_currency` — do not specify it

**⚠️ After ride_request succeeds, you MUST complete payment before starting ride-relay:**
```bash
tada ride-pay-prepare <request_id> <wallet_address>   # → returns typed_data JSON to sign
tada wallet-sign <wallet_address> eth_signTypedData_v4 '<typed_data_json>'   # payment uses eth_signTypedData_v4 + JSON (NOT personal_sign/siwe_file — that form is SIWE re-auth only)
tada ride-pay-confirm <request_id> <signature>
```
Then start `ride-relay.js` in the background. Do NOT start ride-relay while status is `WAITPAY`.

## Member place search

When the active mode is `tada` (TADA/Throo member), use the five gateway-backed place commands below to resolve a place name or coordinates into a bookable `place_id` + coordinates before calling `ride-search` / `ride-request`.

> **placeId provenance rule (strictly enforced)**
> Any `place_id` passed to a subsequent command (`place-detail`, `ride-search`, `ride-request` `locations[].place_id`) MUST be copied verbatim from the response of one of these commands. Never fabricate or substitute a place_id from model knowledge.

### Command signatures

```bash
tada place-search <query> <region> [originLat originLng] [--city CODE] [--session-token UUID] [--lang TAG] --json
tada place-detail <place_id> <region> [city] [--lang TAG] --json
tada place-nearby <lat> <lng> [limit] [--lang TAG] --json
tada place-airports <city> [--lang TAG] --json
tada place-reverse-geocode <lat> <lng> <region> [--lang TAG] --json
```

- `region`: Two-letter region code. Currently supported: **`NY`**, **`SG`**. Any other value returns an error — there is no fallback.
- `city`: TADA city code (e.g. `NYC`), not free text. Used by `place-airports` (required) and `place-detail` (optional hint).
- `originLat` / `originLng`: Optional bias point for `place-search` — pass the user's current coordinates when known.
- `limit` (place-nearby): Optional integer cap on results.
- `--lang TAG`: Optional BCP 47 language tag for localised names (e.g. `en`, `ko`).
- `--session-token UUID`: Optional session continuity token for `place-search`.

### Response shapes

**place-search / place-nearby / place-airports** — list response:
```json
{
  "places": [ /* PlaceResult[] — may be empty */ ],
  "next_action": "...",
  "must": "..."
}
```

`places` can be an empty array (`[]`) — this is a **normal 200 response**, not an error. Never treat an empty list as a failure; ask the user to try a different query or pick-up point.

**place-detail / place-reverse-geocode** — single-record response. These are the only commands that can return `404 place_not_found` (no result for the given id or coordinates).

### PlaceResult fields

| Field | Type | Notes |
|-------|------|-------|
| `place_id` | string | Opaque. TADA UUID or Google `ChIJ…` id. Copy verbatim. |
| `name` | string | Display name |
| `address` | string | Formatted address |
| `lat_lng` | `{latitude, longitude}` or `null` | Present for TADA POIs (`place_type 0`); **may be `null` for Google candidates (`place_type 10`)** — resolve with `place-detail` before booking |
| `place_type` | integer | `0` = TADA POI (ranked first), `10` = Google, `20` = OneMap |
| `allowance_type` | integer | `0` = Both, `1` = Pickup only, `2` = Dropoff only |
| `sub_places` | array | Bookable sub-points of a terminal (see below) |
| `nearest_place_id` | string \| null | Present on any place record; non-null mainly on reverse-geocode when a TADA POI is near the point, null otherwise |
| `pickup_disclaimer_type` | string \| null | Open string set — pass through as-is; do not fabricate |
| `dropoff_disclaimer_type` | string \| null | Open string set — pass through as-is; do not fabricate |

`place_type` and `allowance_type` are integer enums — pass through verbatim; do not fabricate values.

### Resolve → ride flow

1. **place-search**: search by query string and present the `places` list to the user.
2. **User picks a result.** Check `lat_lng`:
   - `lat_lng` present (TADA POI / OneMap): use coordinates directly — skip `place-detail`.
   - `lat_lng` is `null` (Google candidate): run `place-detail` with the same `region` to resolve coordinates. If `place-detail` also returns `null` coords, ask the user to pick a different result.
3. **Terminal sub_places**: If the place is an airport or major terminal, `sub_places` may contain bookable points. Each sub_place has its own `allowance_type`:
   - `1` (Pickup): use for origin → book as `sub_place_id` + the sub_place's `lat_lng` + `name_with_main_place`
   - `2` (Dropoff): use for destination → same pattern
   - `0` (Both): can be used for either leg
   Present the relevant sub_places to the user if they exist; ask which one to use.
4. **Build LocationRequest** — copy values verbatim into the **flat** shape below. `latitude` / `longitude` are top-level (NOT nested under a `lat_lng` object); read them out of the response's `lat_lng` and place them at the top level. Sending a nested `lat_lng` object is rejected with `gateway 400 invalid_parameter`.
   ```json
   {
     "latitude":  <lat_lng.latitude from response>,
     "longitude": <lat_lng.longitude from response>,
     "name":      "<name or name_with_main_place from response>",
     "address":   "<address from response>",
     "place_id":  "<place_id from response — verbatim>"
   }
   ```
   When booking a sub_place, also include `"sub_place_id": "<sub_place.id>"`.
5. **Ride**: pass the resolved locations into `tada ride-search` / `tada ride-request` (member).

### Alternative place-lookup commands

| User intent | Command to use |
|-------------|----------------|
| "Near me" / nearby TADA pickup points | `place-nearby <lat> <lng>` — returns TADA POIs only |
| Airport / terminal by city | `place-airports <city>` — e.g. `tada place-airports NYC` |
| Coordinates → address / place | `place-reverse-geocode <lat> <lng> <region>` — returns the nearest place; `nearest_place_id` if a TADA POI is close |

Use `place-nearby` or `place-airports` instead of `place-search` when the user's intent clearly matches those cases; it reduces round trips and returns better-typed results.

### ride_status - Check ride status

```bash
tada ride-status <request_id> [wallet_address]
```

Returns the current status and driver info of a ride request.

Status values (in lifecycle order):

| Status | Phase | Meaning |
|--------|-------|---------|
| `WAITPAY` | Pre-ride | Ride requested, waiting for payment |
| `PAYCONFIRMED` | Pre-ride | Payment confirmed, entering driver matching |
| `PENDING` | Matching | Searching for available drivers |
| `NOT_MATCHED` | Terminal | No driver found within matching window |
| `MATCHED` | Matching | Driver candidate found (not yet accepted) |
| `CONFIRMED` | Matching | System confirmed the match |
| `ASSIGNED` | Active | Driver accepted and assigned to the ride |
| `PICKUP` | Active | Driver is **driving toward** the pickup point (NOT "picked up") |
| `PICKUP_ARRIVED` | Active | Driver **arrived at** the pickup point, waiting for passenger |
| `INUSE` | Active | Passenger is in the car, ride **in progress** |
| `FINISHED` | Terminal | Ride completed successfully |
| `USER_CANCELED` | Terminal | Cancelled by the rider |
| `USER_CANCELED_BEFORE_CALL` | Terminal | Cancelled by the rider before driver matching started |
| `USER_CANCELED_NO_FREE` | Terminal | Cancelled by the rider (cancellation fee charged) |
| `DRIVER_CANCELED` | Terminal | Cancelled by the driver |
| `DRIVER_CANCELED_RECALLABLE` | Terminal | Cancelled by the driver (can re-request with same search) |
| `COMPANY_CANCELED` | Terminal | Cancelled by the operator |
| `COMPANY_CANCELED_RECALLABLE` | Terminal | Cancelled by the operator (can re-request with same search) |
| `EXPIRED` | Terminal | No driver found, request expired |
| `EXPIRED_RECALLABLE` | Terminal | Expired but can be re-requested with the same search |
| `EXPIRED_BEFORE_PAY` | Terminal | Payment window expired before payment was made |
| `ERROR_PAYMENT` | Terminal | Payment processing error |
| `ERROR` | Terminal | Unexpected system error |

If the `driverInfo` field is present, a driver has been assigned (status is `ASSIGNED` or later). When `driverInfo` is present and the response also includes `rideShareUrl`, surface it to the user as a markdown link (e.g. `[ride share](url)`) — this is a public live-tracking URL the user can share externally. Ignore `rideShareUrl` before driver assignment.

### ride_share - Get a shareable trip-tracking link

```bash
tada ride-share <request_id> [--lang TAG]
```

Returns a public link others can open to follow the trip's live location and status. Works in both modes from the local `request_id`:
- **Member**: calls the gateway share endpoint. `--lang` localizes the optional share `message` (en, ko, ja, th, vi, km, es, zh-CN, zh-TW; default `en`).
- **Crypto**: returns the inline `rideShareUrl` (available only after a driver is assigned).

Output (member): `url`, `urlId`, optional `message`, optional `chatUrl`. Crypto returns just `url`. Surface `url` to the user as a markdown link.

Errors: `SHARE_NOT_AVAILABLE` (crypto, before driver assignment) · `SHARE_LINK_FAILED` (gateway error) · `RIDE_NOT_FOUND` (no local ride record).

### ride_cancel - Cancel a ride request

```bash
# member: tada ride-cancel <request_id> [reason] [--reason-type <id>]
# crypto: tada ride-cancel <request_id> [wallet_address] [reason]
```

- `request_id`: `requestId` returned after running `ride_request`
- `wallet_address`: crypto mode only. Auto-looked up from local DB if omitted; required if not in DB.
- `reason`: free-text cancellation note (optional)
- `--reason-type <id>`: the id of a reason the **rider** picked from the `cancel_pending` list (see below)

**⚠️ Always follow this order:**

1. Run `tada ride-status <request_id>` to check the current ride status
2. If `driverInfo` exists or status is `ASSIGNED` or later → clearly inform the user that **a cancellation fee may apply** and ask them to confirm
3. Run `tada ride-cancel <request_id>` only after the user confirms

#### Two-step cancellation after driver assignment (member mode)

Once the ride reaches `ASSIGNED` / `PICKUP` / `PICKUP_ARRIVED`, the server requires a
cancellation reason. Calling `ride-cancel` without `--reason-type` therefore **does not
cancel the ride**. It exits 0 with:

```json
{
  "cancel_pending": true,
  "ride_status": "PICKUP",
  "reasons": [ { "id": 17, "title": "Found another travel option" }, { "id": 999, "title": "Others" } ],
  "cancellation_fee": 5,
  "cancellation_fee_currency": "USD",
  "fee_varies_by_reason": true,
  "message": "Ride is NOT cancelled yet. ..."
}
```

`cancel_pending: true` means **the ride is still active**. Do not tell the user it was
cancelled, and do not report an error — this is step 1 of 2.

1. Show the `reasons` list and the fee to the rider.
2. **The rider picks the reason. You must never choose one on their behalf — not even
   `999` / "Others".** Picking for them files a false reason against the driver and can
   change the fee. If the rider will not pick, the ride stays active; say so.
3. Re-run with their choice: `tada ride-cancel <request_id> --reason-type <id>`.

`cancellation_fee` is the **default** fee (`fee_varies_by_reason: true`); the actual fee
depends on the reason. For an exact figure before committing, run
`tada ride-cancel-penalty <request_id> --reason-type <id>`.

The reason list **narrows as the ride advances** (e.g. once the driver arrives). If the
rider deliberates and the chosen id has gone stale, the CLI re-issues a fresh
`cancel_pending` with the current list — present it again rather than retrying the old id.

No reason is required — and `ride-cancel` cancels immediately, as before — for member rides
before assignment (`PENDING`/`CONFIRMED`), and for crypto rides in **any cancelable status**
(`PAYCONFIRMED`, `PENDING`, `ASSIGNED`, `PICKUP`, `PICKUP_ARRIVED`). Crypto has no reason
list yet, so it cancels in one step even after assignment; outside those statuses it is
refused locally (see `RIDE_NOT_CANCELABLE` below).

Response (on an actual cancellation):
- `isFreeCancel`: Whether this is a free cancellation (crypto; for recording purposes)
- `pickupStartTime`: Time the driver departed (null if not yet departed)
- `cancelRequestedAt`: Time the cancellation was requested

Errors:
- `RIDE_NOT_CANCELABLE` — the ride cannot be cancelled at all. Do not ask for a reason and
  do not retry; the envelope carries the `status`. Raised when the ride is **in progress**
  (`INUSE`) or already ended (finished/expired/cancelled) — for a ride already underway the
  rider must ask the driver to end the trip. **In crypto mode it is also raised for
  `WAITPAY`, `MATCHED`, and `CONFIRMED`** — pre-payment and matching-transition states that
  the crypto backend refuses. `WAITPAY` is the status a crypto ride sits in right after
  `ride-request`, before payment confirms: nothing to retry away, so either complete the
  payment flow (`ride-pay-prepare` → `ride-pay-confirm`) or wait for the ride to reach
  `PAYCONFIRMED` before cancelling. This check is local — no server call is made.
- `RIDE_CANCEL_FAILED` with a "payment is being held" message — a transient pre-payment
  hold (~30s). Retry shortly.
- `INVALID_ARGUMENT` — `--reason-type` was missing or not an integer id from the list.

### Payment flow (ride_pay_prepare → wallet_sign → ride_pay_confirm)

Complete these three steps in sequence immediately after `ride_request`:

**Step 1. Prepare payment:**
```bash
tada ride-pay-prepare <request_id> <wallet_address> --json
```
Returns `{ typed_data }` — EIP-712 typed data for signing.

**Step 2. Sign the typed data:**
```bash
tada wallet-sign <wallet_address> eth_signTypedData_v4 '<typed_data_json>'
```
Pass the `typed_data` JSON from step 1 as the message argument. Returns `{ wallet_signature }`.

**Step 3. Confirm payment:**
```bash
tada ride-pay-confirm <request_id> <signature>
```
Pass the `wallet_signature` from step 2. Returns `{ success, tx_hash }`.

## ride-relay (event streaming)

Streams ride status and driver chat events to the agent after payment is confirmed.

**⚠️ Only start AFTER payment is confirmed** (`tada ride-pay-confirm` returns `success: true`). Do not start while status is `WAITPAY`.

### How to start

Immediately after `tada ride-pay-confirm` succeeds, start ride-relay using the platform's background primitive:

```bash
node ${SKILL_DIR}/scripts/ride-relay.js <request_id> [--agent <agent-id>] [--session-key <session-key>] [--session-id <sid>] [--once]
```

Refer to SKILL.md → "Event streaming: ride-relay" for the correct primitive per platform:

- **Claude Code:** the `Monitor` tool, with ride-relay as its `command` (e.g. `node ${SKILL_DIR}/scripts/ride-relay.js <request_id>`). Monitor runs the command itself and turns each stdout line into a live notification, so every `ride_event` reaches the user as it arrives; the relay self-exits on the terminal `ride_event`, which ends the watch. Do **not** run the relay under a backgrounded `Bash` and try to attach `Monitor` to that shell — `Monitor` streams the stdout of its *own* command, it cannot watch a separate background process.
- **Hermes:** `terminal(background=true, notify_on_complete=true)` with `--once`; on each `[IMPORTANT: Background process … completed]` notification, parse the status line, report it to the user verbatim, and spawn the next relay (agentic loop) until terminal status. See SKILL.md → "Hermes extra" for the loop and the manual-drain fallback.
- **OpenClaw:** any background launch works — `exec` with `&` (or `nohup … &`) is fine. ride-relay **detaches itself**: it re-execs into a new session (so the tool call's process-group kill can't reap it), prints a `RELAY_DETACHED` note with the child pid and its log path (`~/.tada/run/relay-<request_id>.log`), and the command you ran exits immediately. Do not wait on it. Pass only `<request_id>`: ride-relay self-resolves its agent from the configured agents/workspace and its session from the unique active transcript containing that ride id. It never guesses the freshest session. `--agent`, `--session-key`, and `--session-id` remain optional compatibility/debug hints and must not be invented. `--once` under OpenClaw is ignored (no-op) — the relay stays long-running. See SKILL.md → "OpenClaw extra" for deterministic resolution + hybrid (channel-aware) delivery behavior.
- **Other:** platform's own background primitive; ride-relay runs in stdout passthrough mode.

After starting, tell the user the ride was requested and monitoring is active, then continue handling arriving events.

### Stdout event schema

Each line ride-relay emits on its stdout is a single JSON event.
**Key fields** the LLM cares about:

| Field | Meaning | Handling |
|---|---|---|
| `type` | `ride_event`, `chat_event`, `monitor_event`, ... | branch on it |
| `terminal` | `true` when the ride has reached a terminal status (`FINISHED`, `USER_CANCELED*`, `DRIVER_CANCELED*`, ...) | on `true`, notify the user and end the loop |
| `prompt` | instruction text for the agent (already formatted for human reading) | surface to user / take action verbatim |

Other fields (`requestId`, `ts`, `seq`, `eventId`, `payload`) are metadata — the LLM doesn't need to handle them.

| `type` | When | Agent action |
|--------|------|--------------|
| `ride_event` (terminal=false) | ride status changed | notify user of the new status |
| `ride_event` (terminal=true) | ride reached terminal status | tell user the outcome; exit loop; do NOT restart |
| `chat_event` | driver sent a chat message | relay sender + content to user |
| `monitor_event` phase=started | monitor process came up | no user-facing action |
| `monitor_event` phase=error | transient error in monitor | no action; monitor handles retry |
| `monitor_event` phase=exiting | monitor about to terminate | see Reconnect below |

No heartbeats are emitted; absence of output is normal. stderr is diagnostic only.

### Reconnect after termination

ride-relay is cursor-resumable — re-running the same command picks up automatically from where it left off (at-least-once). Termination handling:

1. **exit code 0 + last stdout line has `terminal=true`** → ride is done. Tell the user the outcome; do NOT restart.
2. **exit code 1** → fatal initialization error (auth expired, missing request, ...). Restarting will fail the same way; surface to user.
3. **anything else (exit 2, SIGKILL, runtime timeout)** → transient termination. Restart with the same command.
   - However, if the same command exits 1 three times in a row, stop and surface to user.

Before restarting, it's good practice to call `tada ride-status <request_id>` to check the ride is still active (if it's already terminal, no restart needed).

### Exit codes

| code | Meaning |
|---|---|
| 0 | reached a terminal `ride_event`; normal exit. |
| 1 | fatal initialization error (auth, missing request, ...). |
| 2 | received `SIGTERM` / `SIGINT`. |

### Driver info presentation

When a `ride_event` carries a `driverInfo` object (driver assigned), the payload looks like:

```json
{
  "driverInfo": {
    "carPlate": "1231A",
    "carModel": "Model",
    "profilePhotoUrl": "https://...",
    "name": "HAYDEN WOO"
  }
}
```

Present driver info to the user in this order of priority: **license plate (carPlate) → car model (carModel) → photo (profilePhotoUrl) → name (name)**.
If `profilePhotoUrl` is present, send it as an image using the `message` tool with `media=<profilePhotoUrl>`.

If the `ride_event` payload contains `rideShareUrl` (only meaningful after driver match), surface it to the user as a markdown link (e.g. `[ride share](url)`) so they can share the live ride status externally.

### Sending chat messages

To send a message to the driver while ride-relay is running, use `tada chat-send-message` (see `references/chat.md`).

### Ride status classification

Used by the reconnect procedure to decide whether to restart ride-relay after an unexpected process termination.

**Active** (ride-relay should be running; restart on abnormal exit):
- `PAYCONFIRMED`, `PENDING`, `MATCHED`, `CONFIRMED`, `ASSIGNED`, `PICKUP`, `PICKUP_ARRIVED`, `INUSE`

**Terminal** (do not restart):
- `FINISHED`, `USER_CANCELED`, `USER_CANCELED_BEFORE_CALL`, `USER_CANCELED_NO_FREE`, `DRIVER_CANCELED`, `DRIVER_CANCELED_RECALLABLE`, `COMPANY_CANCELED`, `COMPANY_CANCELED_RECALLABLE`, `EXPIRED`, `EXPIRED_RECALLABLE`, `EXPIRED_BEFORE_PAY`, `NOT_MATCHED`, `ERROR_PAYMENT`, `ERROR`

### Event handling

1. When a `ride_event` with `driverInfo` present is received (driver assigned) → chat WebSocket connects automatically within the monitor process; no extra setup needed.
2. When a `ride_event` with `terminal: true` is received → ride-relay exits on its own. Handle by status:

**Terminal status handling:**

| Status | Action |
|--------|--------|
| `FINISHED` | Inform user the ride is complete. Check tip availability: call `tada tip-config` with the ride's region. If `enabled: true`, offer to tip the driver (see `references/tip.md`). |
| `USER_CANCELED` | Inform user the ride was cancelled. No tip. |
| `USER_CANCELED_BEFORE_CALL` | Inform user the ride was cancelled (before driver matching). No tip. |
| `USER_CANCELED_NO_FREE` | Inform user the ride was cancelled and a cancellation fee was charged. No tip. |
| `DRIVER_CANCELED` | Inform user the driver cancelled. Offer to search for a new ride. |
| `DRIVER_CANCELED_RECALLABLE` | Inform user the driver cancelled. Offer to re-request immediately (same search parameters). |
| `COMPANY_CANCELED` | Inform user the ride was cancelled by the operator. Offer to search for a new ride. |
| `COMPANY_CANCELED_RECALLABLE` | Inform user the ride was cancelled by the operator. Offer to re-request immediately (same search parameters). |
| `EXPIRED` | Inform user that no driver was found and the request has expired. Offer to search again. |
| `EXPIRED_RECALLABLE` | Inform user that no driver was found but the ride can be re-requested with the same search. Offer to re-request immediately. |
| `EXPIRED_BEFORE_PAY` | Inform user the payment window expired. Offer to search for a new ride. |
| `NOT_MATCHED` | Inform user that no driver was matched. Offer to search for a new ride. |
| `ERROR_PAYMENT` | Inform user of a payment processing error. Run `tada wallet-balance` and `tada deposit-status` to diagnose. |
| `ERROR` | Inform user of a system error. Run `tada setup-check` to diagnose. |

**Do not tell the user to wait** — report each event as it arrives. **Never say "let me know if you'd like to check the status" — do not hand the trigger to the user.**

> On any expiry / no-match, follow the SKILL.md **Guardrails**: offer a TADA re-search **once** (never a competitor or any other ride app), and do not speculate about why it expired beyond "no driver matched in time." See SKILL.md → Guardrails.

## Ride History

### ride_history - List completed rides

```bash
tada ride-history <wallet_address> [limit]
```

- Returns completed rides with `tipInfo.tipPaymentAvailable` per ride.
- Display per ride: `rideTimeStamp`, `pickup → destination`.

### ride_history_detail / ride_receipt - Show ride receipt

```bash
tada ride-history-detail <wallet_address> <request_id>
# Or, with the more direct name:
tada ride-receipt <wallet_address> <request_id>
```

`ride-receipt` is an alias of `ride-history-detail` — both invoke the same
handler. Pick whichever name better matches the user's intent (`ride-receipt`
reads more naturally after a ride finishes; `ride-history-detail` reads more
naturally after browsing the history list).

Calls `GET /v2/ride-histories/detail/{rideRequestId}` and returns the full
`RideHistoryDetailDto`:

- `bookingNumber`, `status`, `rideDate`, `rideType`, `region`, `paymentMethod`.
- `locations[]` — pickup and dropoff (name + address).
- `driverInfo` — name, phone, car (model / plate / color / maker), `profilePhotoUrl`, `tlcDetail` (where applicable).
- `receiptInfo` — `paidAmount`, `paidNetwork`, `paidTxHash`, `receiptStatus`.
- `refundReceiptInfo` — present when the ride was refunded (`refundAmount`, `refundTxHash`).
- `discountInfo` — applied promotion / voucher.
- `tipInfo` — tip payment state (with `tipRequest.txHash` once paid).
- `receiptBreakdown[]` — fare items per entity (rider / driver), with `totalFare`, `currency`, `subtotalName`, `fareItems[]`.

Plain-mode output (the default for humans) attaches an `explorerUrl` field
next to each on-chain transaction hash (`paidTxHash`, `refundTxHash`,
`tipRequest.txHash`) when the `paidNetwork` is recognised
(POLYGON / POLYGON_AMOY / BASE / BASE_SEPOLIA / ETHEREUM / ETHEREUM_SEPOLIA).
Use `--json` to get the raw DTO without enrichment — useful when piping into
another command or parsing programmatically.

## Full Ride Booking Flow

0. Initial setup (first time only)
```bash
# Built-in Privy wallet (agent: always pass --no-wait — see references/wallet.md)
tada wallet-setup --no-wait
```

1. Check wallet status
```bash
tada wallet-status
```

2. SIWE login (required to obtain JWT)
```bash
tada siwe-request-message 0x1234... <chain_id>
tada wallet-sign 0x1234... personal_sign <siwe_file>
tada siwe-submit <siwe_file> <signature>
```

3. Phone verification (first time only)
```bash
# Always check server status first
tada phone-verify-check 0x1234... +821012345678
# Only if verified: false → send OTP and confirm
tada phone-verify-start 0x1234... +821012345678
tada phone-verify-confirm 0x1234... +821012345678 123456
```

4. Readiness check — must pass before booking
```bash
tada setup-check 0x1234...
# Proceed only if ready_for_ride: true
```

5. Resolve places (for each of origin and destination):
```bash
# 5a. Search
tada place-search 0x1234... SIN "Marina Bay" --json
# 5b. Get detail for selected place (only if locationPoint is null)
tada place-detail 0x1234... SIN <place_id> --json
# 5c. ⚠️ MANDATORY: Create map session (pipe subPlaces if present)
tada map-session-create 0x1234... SIN <lat> <lng> [name]
# 5d. Poll map-session-verify until completed/cancelled/expired
tada map-session-verify <session_id> --json
```

6. Search for a ride
```bash
tada ride-search 0x1234... SG 37.5665 126.9780 37.4979 127.0276
```

7. Request a ride
- Confirm rider name and phone with the user before proceeding. Ask if not already provided.
```bash
tada ride-request '{"wallet_address":"0x1234...","search_id":"...","product_code":"STANDARD","region":"SG","pay_currency":"USDC_base_sepolia","locations":[...],"rider":{"name":"John Doe","phone":"+821012345678"}}'
```

7-1. (Optional) Cancel — always check status first
```bash
# 1. Check current ride status
tada ride-status 550e8400-e29b-41d4-a716-446655440000 0x1234...
# If driverInfo exists or status is ASSIGNED or later → warn about possible fee and confirm with user
# 2. After user confirms, execute cancellation
tada ride-cancel 550e8400-e29b-41d4-a716-446655440000 0x1234...
```

8. Payment signing
```bash
tada ride-pay-prepare 550e8400-e29b-41d4-a716-446655440000 0x1234... --json
tada wallet-sign 0x1234... eth_signTypedData_v4 '<typed_data_json>'
tada ride-pay-confirm 550e8400-e29b-41d4-a716-446655440000 0xsignature...
```

9. Start ride-relay (background)
```bash
node ${SKILL_DIR}/scripts/ride-relay.js 550e8400-e29b-41d4-a716-446655440000
```
Launch with the platform's background primitive (see SKILL.md → "Event streaming: ride-relay" for the platform spawn primitives). Stdout JSONL events: see "Stdout event schema" above. Reconnect: see "Reconnect after termination" above. Exit codes: see "Exit codes" above.

10. Cleanup — ride-relay exits on its own when a terminal `ride_event` is reached. If you need to stop it early (e.g. user cancelled and you already handled the terminal event), use the platform's kill primitive (Claude Code `TaskStop` to stop the Monitor, OpenClaw `process kill`).

## Error Handling

When a command fails, take the following action based on the error code:

| Error code | Action |
|------------|--------|
| `WALLET_NOT_FOUND` | Run `tada wallet-setup --no-wait` |
| `JWT_NOT_FOUND` | Run `tada siwe-request-message` + `tada siwe-submit` |
| `PHONE_NOT_VERIFIED` | Run `tada phone-verify-start` + `tada phone-verify-confirm` |
| `INSUFFICIENT_DEPOSIT` | Run `tada deposit-status` to see which networks need deposits, then run `tada deposit-add <wallet> <network> <token> <amount>` for the appropriate network |
| `INSUFFICIENT_BALANCE` | Run `tada wallet-balance` and top up the wallet |
| `RIDE_REQUEST_FAILED` | Run both `tada deposit-status` and `tada wallet-balance` to identify the cause |

For unknown errors, run `tada setup-check` first to check overall status.
