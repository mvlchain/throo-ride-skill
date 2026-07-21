# Wallet & Authentication Reference

> All agent-facing operations use `tada <subcommand> [args…]` (PATH-resident). Two scripts that cannot live on PATH (`ride-relay.js`, `install.js`) are invoked via `node ${SKILL_DIR}/scripts/<name>.js` — see `../SKILL.md` for the path convention.

## Signing Strategy

Crypto-mode users sign with the built-in Privy wallet:

```bash
tada wallet-sign <address> personal_sign <siwe_file>
```

Older installs may still hold a wallet of type `external` (registration of new ones is no longer offered). Those cannot be signed for by the skill — ask the user to sign the message with their own wallet tool and pass the signature back.

Check wallets:
```bash
tada wallet-status
# If multiple wallets exist, ask the user which one to use
```

## Wallet Management

### wallet_setup - Initialize wallet

```bash
# Agent invocation — ALWAYS use --no-wait
tada wallet-setup --no-wait [--force-new]
```

Creates the user's built-in Privy wallet, or checks the status of an existing one. This is the only wallet-creation path — do not ask the user to pick a wallet type; run it as soon as a crypto wallet is needed.
- `--no-wait`: **Required for agent use.** Returns the JSON contract (`auth_required` / `auth_pending` with `auth_url`, or `ready`) and exits immediately, so the agent can show the URL to the user. Without this flag the command blocks for up to 5 minutes waiting for a human at a terminal to finish webapp auth — an agent cannot drive that.
- `--force-new`: Create a new wallet even if one already exists

### wallet_status - List wallets

```bash
tada wallet-status
```

Returns all registered wallets and their validity status.

**If there are 2 or more wallets, always ask the user which one to use. Never choose arbitrarily.**

### wallet_check_auth - Check auth status

```bash
tada wallet-setup-verify [--wait]
```

Checks whether webapp authentication is complete. Returns one of `no_pending` / `pending` (with `auth_url`) / `ready` (with `wallet_address`) / `failed`.

- Default: **one check, returns immediately.** This is the agent path.
- `--wait`: block for up to 5 minutes, polling until the approval lands. Only for a human at a terminal.

**Send the `auth_url` to the user and end your turn before verifying.** The user only sees a message once your turn ends, so an unsent link cannot be opened — verifying (or waiting) in the same turn that produced the link means waiting for an approval the user has no way to give. Send the link, stop, and run `wallet-setup-verify` once the user says they finished the page. Re-run it on request rather than polling it in a loop.

**When presenting `auth_url`:** always use a markdown hyperlink so the user can click it directly:
```
[Authenticate here](auth_url_value)
```
Never display the raw URL as plain text — it is long and wraps in the terminal, making it impossible to copy correctly.

### wallet_sign - Sign a message

```bash
tada wallet-sign <wallet_address> <sign_method> <siwe_file|json>
```

The third argument depends on `sign_method` — it is **not** a raw message string:
- `personal_sign` → pass the **`siwe_file` path** returned by `tada siwe-request-message` (used for SIWE re-auth): `tada wallet-sign <wallet_address> personal_sign <siwe_file>`
- `eth_signTypedData_v4` → pass the **typed-data JSON** (used for ride/tip payment): `tada wallet-sign <wallet_address> eth_signTypedData_v4 '<typed_data_json>'`

### wallet_send_tx - Send transaction

```bash
tada wallet-send-tx <wallet_address> <to> <value_eth> <chain_id> [data]
```

## SIWE Authentication

### siwe_get_message - Generate SIWE message

```bash
tada siwe-request-message <wallet_address> <chain_id>
```

Saves the message as a file in `TADA_AGENT_DATA_DIR` and returns the `siwe_file` path.

### siwe_login - SIWE login

```bash
tada siwe-submit <siwe_file> <signature>
```

- `siwe_file`: File path returned by `tada siwe-request-message`
- JWT is saved to DB and reused by subsequent commands.

## Phone Verification

**Always follow this order.**

1. Get the phone number from the user (E.164 format, e.g. +821012345678)
2. Run `tada phone-verify-check` to check verification status on the server
   - `verified: true` → Saved to local DB, done. No OTP needed
   - `verified: false` → Proceed to step 3
3. Send OTP with `tada phone-verify-start`
4. Get OTP code from user and confirm with `tada phone-verify-confirm`

### phone_verify_check - Check server verification status (always run first)

```bash
tada phone-verify-check <wallet_address> <phone>
```

### phone_verify_start - Send OTP (only when phone_verify_check returns verified: false)

```bash
tada phone-verify-start <wallet_address> <phone>
```

### phone_verify_confirm - Confirm OTP

```bash
tada phone-verify-confirm <wallet_address> <phone> <code>
```

## Balance Check

### balance_check - Check wallet balance

```bash
tada wallet-balance <wallet_address>
```

Returns the actual wallet balance (not the deposit contract balance):

```json
{
  "eth": "0.0",
  "usdc": "12.500000",
  "source_usdc": "310.000000"
}
```

- `eth` / `usdc`: balances on the **payment chain** — the chain crypto-mode rides settle on (Base).
- `source_usdc`: USDC on the **bridge source chain** (Ethereum) — what `bridge-usdc` would move.

**`source_usdc: "0"` and a missing `source_usdc` mean different things. Do not conflate them:**

| Value | Meaning | What to tell the user |
|---|---|---|
| `"0"` (or any number) | Bridging is available on this build | With `"0"`: they have nothing on the source chain to bridge. With a positive number: that much is bridgeable. |
| key absent | This build has **no bridge configured** | Bridging is unavailable here — not a balance problem. |

Reporting "bridging is unavailable" for a user who simply has an empty source wallet sends them to the wrong fix.

## USDC Bridge (Ethereum → Base)

Crypto-mode ride payment settles in **Base USDC only**, but USDC liquidity lives on Ethereum, so a user can hold plenty of USDC and still be unable to pay for a ride. `bridge-usdc` moves Ethereum USDC to Base USDC over Circle CCTP V2. The user needs **no gas token on either chain** — gas is sponsored on both sides.

**When to use it:** `tada wallet-balance <wallet>` shows `usdc` too low for the ride, and `source_usdc` has funds.

### bridge_usdc - Start or resume a bridge

```bash
tada bridge-usdc <wallet_address> <amount> [--fast] [--wait]   # start
tada bridge-usdc <wallet_address>                              # resume
```

#### Amount units — decimal USDC, NOT raw

`bridge-usdc` takes **decimal USDC** (`50`, `50.5`). `deposit-add` takes **raw** 6-decimal units (`50000000`). The divergence is deliberate — an agent producing `50` is far safer than one producing `50000000` — but the two commands sitting side by side is a live confusion risk.

```bash
tada bridge-usdc 0xabc… 50        # 50 USDC   ✅
tada bridge-usdc 0xabc… 50000000  # 50 million USDC — rejected by the balance check, not by the parser
```

Because of that risk **every `bridge-usdc` response carries both `amount_usdc` and `amount_raw`**. Read them back and confirm they match what you meant before reporting anything to the user.

Amounts finer than 6 decimal places are rejected (`BRIDGE_AMOUNT_INVALID`), never rounded — `50.1234567` would silently become a different amount than the user authorized.

#### The amount is what you RECEIVE, not what is burned

- **Standard**: `maxFee` is 0 → `bridge-usdc <wallet> 50` burns exactly 50 and delivers exactly 50.
- **`--fast`**: `bridge-usdc <wallet> 50 --fast` burns **`50 + maxFee`** and delivers **at least 50** (the real fee is usually below the authorized max, so slightly more can arrive).

The pre-flight balance check is against `amount + maxFee` for the same reason. When it fails, `BRIDGE_INSUFFICIENT_USDC` spells out both parts.

#### Standard vs `--fast`

| Mode | Fee | Time | Blocks? |
|---|---|---|---|
| Standard (default) | none | ~20 min | **No** — returns as soon as the burn is submitted |
| `--fast` | small — Circle quotes it at call time (~1 bps) | ~40 s | **Yes**, up to 3 min |
| Standard + `--wait` | none | ~20 min | Yes, up to 25 min |

Standard does not block by default because a 20-minute blocking call is unusable for an agent. It returns a non-terminal status plus `next_step`; resume later. `--wait` opts Standard into blocking — only use it if a human is genuinely waiting at a terminal.

A blocking call that hits its timeout is **not a failure**. It exits 0 with the live status: the funds are mid-flight and Circle attests regardless of whether anyone is polling. Resume it.

#### Resuming

```bash
tada bridge-usdc <wallet_address>
```

Calling `bridge-usdc` with **no amount** picks up the wallet's unfinished job and advances it as far as it can. It is idempotent and is the normal way to continue — this is the one command to remember. Every unfinished response names it in `next_step`.

Only one bridge per wallet may be in flight; starting a second one fails with `BRIDGE_JOB_IN_FLIGHT`. There is no `--force` override, and none is needed: resuming resolves a stuck job on its own.

If another process is already advancing the job, the command returns immediately with `lease_held: true` rather than blocking.

### bridge_usdc_status - Read bridge job state

```bash
tada bridge-usdc-status <wallet_address> [job_id]
```

A **pure local read** — no network, no wallet registration needed, no side effects (same contract as `deposit-relay-status`). With `job_id` it returns that one job; without it, every job for the wallet plus `active_job_id`.

### Response fields

Both commands render a job the same way:

| Field | Notes |
|---|---|
| `job_id`, `status`, `wallet_address` | |
| `amount_usdc`, `amount_raw` | Always both — see the units warning above |
| `max_fee_raw` | `0` on Standard |
| `is_fast` | |
| `source_chain_id`, `dest_chain_id` | |
| `burn_tx_hash`, `mint_tx_hash` | Present once each leg has a resolved hash |
| `mint_attempts`, `failure_reason` | Present when non-zero / set |
| `minted_amount`, `minted_amount_raw` | **Only ever present on `COMPLETED`** |
| `funds_mid_flight`, `recovery` | See below |
| `note` | One-line explanation of why the job did not advance this pass. Worth relaying. |
| `verdict_withheld` | The job cannot yet be judged either way (still inside the burn grace window). It is **not** a failure — resume later. |
| `privy_status` | Diagnostic: the wallet provider's status for the transaction being tracked |
| `lease_held` | Another process is already advancing this job; nothing was submitted |
| `next_step` | Present while the job is unfinished |

Statuses run `INITIATED` → `BURN_SUBMITTED` → `ATTESTED` → `MINT_SUBMITTED` → `COMPLETED`, with `FAILED` as the other terminal state. **Only `COMPLETED` means the money arrived** — see `../SKILL.md` for the reporting rule.

### Funds mid-flight (`FAILED` with money in between)

A `FAILED` job whose burn landed but whose mint never did leaves USDC on neither chain. That response carries `funds_mid_flight: true` and a `recovery` text.

**Relay the `recovery` text to the user verbatim.** The job exists only in this machine's local SQLite — no server can reconstruct it — so the user's own `bridge-usdc-status` output is the only recovery input support will ever get. Nothing is lost; the transfer can be finished manually from that output.

### Error codes

| Code | Meaning / action |
|---|---|
| `BRIDGE_NOT_CONFIGURED` | This build has no bridge. Nothing the user can fix. |
| `BRIDGE_AMOUNT_INVALID` | Not a decimal USDC amount (digits, at most 6 decimal places, no sign or exponent). |
| `BRIDGE_AMOUNT_BELOW_MIN` | Below `TADA_AGENT_BRIDGE_MIN_USDC`. Nothing was submitted. |
| `BRIDGE_INSUFFICIENT_USDC` | Source-chain USDC is short of `amount + maxFee`. Nothing was submitted; the message breaks out both parts. |
| `BRIDGE_JOB_IN_FLIGHT` | A bridge is already running for this wallet. Resume it instead (`tada bridge-usdc <wallet>`). |
| `BRIDGE_NO_ACTIVE_JOB` | Resume was called but nothing is unfinished. Pass an amount to start one. |
| `BRIDGE_JOB_NOT_FOUND` | That `job_id` does not belong to that wallet. |
| `BRIDGE_SPONSOR_NOT_ALLOWED` | **Operational, not the user's fault.** The gas sponsor rejected the batch (403) because the CCTP rules are not deployed to the sponsor allowlist for this environment. **No USDC was burned.** Retrying will not help — report it. |
| `BRIDGE_CLOCK_SKEW` | This machine's clock has drifted more than 5 minutes from the server's, so the request was rejected as expired. **Retrying fails identically** — sync the system clock (enable NTP), then re-run. It was deliberately not retried. |
| `BRIDGE_NOT_ATTESTED` | Internal: a mint was attempted with no message/attestation stored yet. Resume. |
| `BRIDGE_NO_TRANSACTION_ID` | The mint was submitted but the server returned no transaction id, so its hash cannot be resolved. Resume and report if it repeats. |

Exit codes follow the `deposit` convention: `0` for `COMPLETED` or a normal unfinished return, `1` for pre-flight/config/network errors, `2` for a `FAILED` job.

## Collateral Management

### supported_tokens - List supported deposit tokens

```bash
tada deposit-tokens [network]
```

Returns Path B (router whitelist) tokens supported for deposit, with the global MVL minimum required balance.
- v2 model: the router holds an `address[]` whitelist (`router.supportedTokens()`). The minimum threshold is a single MVL-denominated ledger balance (`router.minRequiredBalance()`), not per-token.
- If `network` is specified, shows tokens for that network only.
- If omitted, shows all configured deposit networks.

Output shape (`tada deposit-tokens BASE_SEPOLIA`):
```json
{
  "networks": [
    {
      "network": "BASE_SEPOLIA",
      "tokens": [
        { "token": "0x036C...", "symbol": "USDC", "name": "USD Coin", "decimals": 6 }
      ],
      "minRequiredMvl": "10000000000000000000"
    }
  ],
  "errors": []
}
```
- `minRequiredMvl`: raw wei units of MVL the agent ledger must hold for the deposit to be considered active.
- `errors`: per-network RPC failures (the other networks still appear in `networks`).

### deposit_check - Check collateral balance

```bash
tada deposit-status <wallet_address>
```

Returns per-network collateral status. v2 model: a single MVL ledger balance (`deposited`) is compared against a global `minRequired` threshold; there is no per-token active flag.

The top-level `anyActive` is `true` if **any network** has `isActive: true` (OR condition).

Output shape (`tada deposit-status <wallet>`):
```json
{
  "anyActive": false,
  "networks": [
    {
      "network": "BASE_SEPOLIA",
      "isActive": false,
      "deposited": "0",
      "minRequired": "10000000000000000000",
      "nextWithdrawAt": 0,
      "mvlReserve": "5000000000000000000000",
      "mvlGap": "10000000000000000000",
      "requiredToActivate": [
        {
          "tokenAddress": "0xabc...",
          "symbol": "USDC",
          "tokenWei": "4000000",
          "ratePreview": "1000",
          "display": "~4.00 USDC to activate"
        }
      ],
      "requiredToActivateReason": null
    }
  ],
  "errors": []
}
```
- `deposited`: raw wei of MVL currently in the agent's ledger slot.
- `minRequired`: raw wei threshold (same as `minRequiredMvl` from `deposit-tokens`).
- `nextWithdrawAt`: Unix timestamp (seconds) after which withdrawal is permitted; `0` means no cooldown / no prior withdraw.
- `mvlReserve`: raw wei of MVL held by the router as the global reserve backing convertible-token deposits (Path B). Diagnostic — most agents can ignore this; surfaced for ops debugging when a convertible-token deposit fails with insufficient reserve.
- `errors`: per-network RPC failures.

Each network entry also includes activation guidance:

- `mvlGap`: MVL wei (string) still needed to reach `minRequired`; `"0"` when the threshold is already met.
- `requiredToActivate`: best-effort array of `{ tokenAddress, symbol, tokenWei, ratePreview, display }` — how much of each supported convertible token (e.g. USDC) to deposit to activate. `display` is a human-readable string like `"~4.00 USDC to activate"`; `ratePreview` is a display-only USDC→MVL rate string, present only when a funding gap exists / the agent is not yet active. The field is `null` when the gap is `0` or the rate could not be fetched.
- `requiredToActivateReason`: `null` | `"NO_JWT"` (no SIWE login — run `siwe-request-message` then `siwe-submit`) | `"RATE_UNAVAILABLE"` (rate service error / no supported tokens).
- `requiredToActivateHint`: present only for `NO_JWT`; a one-line next-step string. Absent (or `null`) in all other cases.

This data is best-effort: it requires a SIWE JWT and the server rate endpoint. Failure to fetch it never blocks the rest of `deposit-status` (chain reads always render).

### deposit_token - Deposit token collateral

```bash
tada deposit-add <wallet_address> <network> <token_address> <amount> [--no-wait]
```

- `wallet_address`: Wallet address (0x...)
- `network`: Deposit network name (e.g. `BASE_SEPOLIA`, `ETHEREUM`)
- `token_address`: Token contract address. The command picks a path automatically from the token: the network's **MVL token** takes **Path A** (direct deposit); **any other whitelisted convertible token** (e.g. USDC) takes **Path B** (gasless relay). List the convertible tokens for a network with `tada deposit-tokens <network>`; obtain the MVL address via the router's `router.mvlToken()` view.
- `amount`: Raw units in the token's own decimals (MVL has 18 decimals → 1 MVL = "1000000000000000000"; USDC has 6 decimals → 1 USDC = "1000000").

**Path A — MVL direct deposit:**

When `token_address` matches the MVL token for the specified network, the command executes a `wallet_sendCalls` batch containing:
1. MVL `approve` (agent router as spender)
2. Router `depositMVL` (move MVL from agent wallet to agent ledger)

Both calls are executed in a single batch with Privy sponsorship (`sponsor: true`). The agent's native token balance remains 0 (gas is covered).

Success response:
```json
{
  "path": "mvl-direct",
  "token": "0x1234...",
  "agent": "0x5678...",
  "amount": "1000000000000000000",
  "batch_tx": {
    "kind": "transaction_id",
    "transaction_id": "tx_abc123",
    "caip2": "eip155:84532"
  }
}
```

- `batch_tx.transaction_id`: Blockchain transaction identifier (not a user-operation hash).
- To confirm the deposit landed, run `tada deposit-status <wallet_address>` (reads on-chain ledger state).

**Path B — Convertible token deposit (e.g. USDC), gasless relay:**

When `token_address` is **not** the MVL token, the command routes the deposit through the agent-deposit relay: it fetches a backend-signed PriceQuote (token→MVL conversion), wraps an EIP-3009 `transferWithAuthorization` for the agent's Kernel smart account, and submits it via the relayer. No native gas is needed — the relayer pays. Requires a valid SIWE JWT (run `tada siwe-auth` first if the cached token is missing/expired).

> - **Credited as MVL** — the deposited token is converted to an MVL ledger credit at the backend's quoted rate. The blocking response includes `mvl_amount` (the quoted MVL credit, wei). A later `deposit-withdraw` returns MVL, not the token you deposited.

By default the command **blocks**, polling the relay until it reaches a terminal state, then emits:
```json
{
  "path": "relay",
  "request_id": "req_abc123",
  "status": "CONFIRMED",
  "mvl_amount": "959000000000000000000",
  "tx_hash": "0x..."
}
```

- `mvl_amount`: quoted MVL credit (wei) that will be credited on CONFIRMED.

With `--no-wait` it returns immediately with the PENDING relay result (`{ "path": "relay", "request_id": "req_abc123", "status": "PENDING", "mvl_amount": "959000000000000000000" }`); poll it yourself with `tada deposit-relay-status <wallet_address> <request_id>` until `CONFIRMED` or `FAILED`.

If the relay capability is not reachable (gateway down, or the token is not relay-supported on this network), the command fails with:
```
error: RELAY_UNAVAILABLE: token <token_address> is not MVL and the relay capability probe failed for <network>. Convertible-token deposit needs the agent-deposit relay endpoint reachable (check JWT + gateway).
```

Either way, confirm the deposit landed with `tada deposit-status <wallet_address>` (reads the on-chain MVL ledger).

### deposit_relay_status - Poll a gasless relay deposit

```bash
tada deposit-relay-status <wallet_address> <request_id>
```

- `request_id`: from a `deposit-add` response when `path: "relay"`.
- Prints `{ request_id, status, tx_hash?, error_code?, error_message? }`. Exits non-zero when `status` is `FAILED`. Poll every ~3s until `CONFIRMED` or `FAILED`.

### withdraw - Withdraw collateral

```bash
tada deposit-withdraw <wallet_address> <network>
```

- `network`: Deposit network name (e.g. `BASE_SEPOLIA`, `ETHEREUM`).

v2 withdraws the **full MVL ledger balance** in one call — there is no token arg. The router calls `withdraw()` (no args); the agent-deposit ledger then transfers all credited MVL back to the agent EOA. Gas is Privy-sponsored.

> - **Returns MVL** — withdrawal always returns the **MVL token**, regardless of which token you originally deposited (e.g. a USDC deposit is refunded as MVL).

**Cooldown.** The ledger enforces a per-agent withdraw cooldown. Before sending the tx, the CLI reads `nextWithdrawAt(agent)`; if it is in the future, the command fails immediately with:

```
error: WITHDRAW_COOLDOWN: next withdraw allowed at unix <ts> (~<N> min from now). v2 enforces a per-agent withdraw cooldown.
```

Run `tada deposit-status <wallet_address>` to see the current `nextWithdrawAt`.

**Success response:**
```json
{
  "path": "mvl-withdraw",
  "agent": "0x5678...",
  "withdraw_tx": {
    "kind": "tx_hash",
    "tx_hash": "0xabc...",
    "explorer_url": "https://sepolia.basescan.org/tx/0xabc..."
  }
}
```

- `withdraw_tx`: same `WalletSendTxResult` shape as other sponsored ops — `kind: 'tx_hash'` when the chain accepts immediately, `kind: 'user_operation_hash'` while the userOp is in flight.

**Back-compat.** Previous releases required a 3rd `<token>` positional. v2 ignores any value passed there and prints a stderr deprecation warning. The form will be removed in a later release; new scripts should drop it now.
