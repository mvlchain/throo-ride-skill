# Tip Reference

> All agent-facing operations use `tada <subcommand> [args…]` (PATH-resident). Two scripts that cannot live on PATH (`ride-relay.js`, `install.js`) are invoked via `node ${SKILL_DIR}/scripts/<name>.js` — see `../SKILL.md` for the path convention.

The tip surface is two commands: `tip-config` (read the region's tip settings) and `tip` (pay a tip). A single `tip` command serves both modes — member (card) and crypto (wallet). Run `tada whoami` to confirm `mode` if you need to anticipate the payment path, but `tip` dispatches on the ride's recorded mode automatically.

## tip-config - Get tip configuration for a region

```bash
tada tip-config <region>
```

- `region`: region code (`SG` = Singapore, `NY` = New York). Infer from the ride / conversation context. (Member mode resolves the active account; crypto uses the registered wallet.)
- Returns `{ enabled, minAmount, maxAmount?, currency, presets? }`.
  - `presets` is an array of suggested amounts (e.g. NY returns `[2, 3, 5, 10]`).
  - `maxAmount` may be absent when the region has no maximum (e.g. NY has no max; SG has a finite max).
- If `enabled: false`, tipping is not available in this region — do not proceed with the tip flow.

## tip - Pay a tip for a finished ride

```bash
tada tip <ride_id> <amount> [--currency C] [--card uuid]
```

- One command for both modes. Returns `{ tipStatus, txHash? }`.
- `amount`: tip amount as a number in the config currency unit (e.g. `3`). Keep it within the `tip-config` `minAmount`/`maxAmount` range.
- **Member (card):** the card is auto-selected when `--card` is omitted — the same behavior as ride booking (`NO_CARD` if you have no usable card, or a `needs_card_selection` response listing candidate cards when the choice is ambiguous; ask the user to pick, then re-run with `--card <uuid>`). `--currency` defaults to the region's configured currency.
- **Crypto (wallet):** `tip` signs and pays from the wallet internally — there is no separate `wallet-sign`/prepare/confirm step. `--currency` / `--card` are ignored.
- `txHash` is returned only for crypto tips (member/card tips have no on-chain transaction).

## Ride History Commands

For `ride-history` and `ride-history-detail` usage, see `references/ride.md#ride-history`.

- For tip selection, filter `ride-history` results to rides where `tipPaymentAvailable: true`.
- Use `ride-history-detail` to verify tip eligibility when the user specifies a ride ID directly.

---

## Tip Flow — Auto-suggest after ride completion

After ride status becomes `FINISHED`:
1. Call `tada tip-config` with the ride's region (known from ride context).
2. If `enabled: false` → show the completion message only.
3. If `enabled: true` → prompt: "Would you like to leave a tip for [driverInfo.name]?" (driver name comes from the FINISHED poll response; if not in context, call `tada ride-history-detail` to retrieve it). For member rides, phrase the offer as available once payment settles (see the settlement note below).
4. Present preset amounts:
   - If `tip-config` returned `presets`, offer those directly.
   - Otherwise suggest `minAmount` and a couple of higher values, and let the user enter a custom amount (up to `maxAmount` `currency` when a max exists).
5. Validate the amount is within range (`>= minAmount`, and `<= maxAmount` when a max exists); re-prompt if not.
6. Run the payment: `tada tip <ride_id> <amount>` (add `--currency`/`--card` only when needed).

## Tip Flow — User-initiated

If the user says they want to tip (no specific ride):
1. Call `tada ride-history` → show rides where `tipPaymentAvailable: true` (date, pickup → destination).
2. If none → "No rides available for tipping right now".
3. User selects a ride → call `tada ride-history-detail` to get the driver name.
4. Proceed to amount selection (same as above, step 4 onward), then pay with `tada tip <ride_id> <amount>`.

If the user specifies a ride ID directly:
1. Call `tada ride-history-detail` to verify `tipInfo.tipPaymentAvailable`.
2. If `false` → "Tipping is not available for this ride (time limit passed or already tipped)".
3. If `true` → proceed to amount selection, then `tada tip <ride_id> <amount>`.

## Settlement note (member)

Right after a ride reaches `FINISHED`, the fare may still be settling (the card charge is not yet captured). A member tip during this window can return `TIP_NOT_AVAILABLE` even though tipping is allowed for the region. If the user wants to tip immediately and it isn't available yet, wait a moment and retry — the tip becomes available once payment settles. When auto-suggesting after `FINISHED`, phrase the offer as available "once payment settles" rather than implying it must happen this instant.

## Error handling

**Member (card):**
- `TIP_NOT_AVAILABLE` → tipping isn't available yet (fare may still be settling — wait a moment and retry), the tip window has passed, or the region is disabled.
- `TIP_ALREADY_PAID` → this ride has already been tipped.
- `TIP_PAYMENT_FAILED` → payment failed; check the card and try again.
- `TIP_AMOUNT_INVALID` → amount is outside the allowed range; re-check `tada tip-config <region>`.
- `NO_CARD` → no usable payment card; add or update a card in the TADA/Throo app.
- `SESSION_EXPIRED` → the TADA/Throo session expired; run `tada login` again.

**Crypto (wallet):**
- `INSUFFICIENT_BALANCE` → run `tada wallet-balance` and top up the wallet.
