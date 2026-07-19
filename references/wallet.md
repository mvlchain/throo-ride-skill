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

Returns ETH + USDC balance of the payment wallet (actual wallet balance, not deposit contract balance).

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
