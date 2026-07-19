# TADA/Throo Ride Skill — Usage Guide

> This document is for the agent to consult when a user asks **what this skill is, how to get started, or why the skill is structured the way it is**. It is *not* a command reference — see `wallet.md`, `ride.md`, `tip.md`, and `chat.md` for command-level details. When answering a user, paraphrase from this document rather than pasting it back verbatim.

## Overview

### What this skill does

This skill lets you interact with **TADA/Throo** (TADA: [tada.global](https://tada.global); Throo: [ridethroo.ai](https://ridethroo.ai)), a ride-hailing service, through natural conversation with the agent. It covers most of the ride lifecycle:

- Searching available rides between two places
- Requesting and cancelling a ride
- Paying for the ride with USDC, via the [x402](https://www.x402.org) HTTP payment standard
- Chatting with the assigned driver in real time
- Tipping after the ride
- *(Coming soon)* Reviewing past rides

### Where it works

The underlying app itself operates in a number of cities — **TADA** in New York, Denver, Singapore, Bangkok, Ho Chi Minh, Hanoi, Phnom Penh, Siem Reap, and Hong Kong, and **Throo** currently in New York only.

**However, this skill currently supports rides in New York (NYC) and Singapore (SIN) only.** Support for additional cities is rolling out over time.

### Who's behind it

TADA/Throo is operated by the TADA team — see [tada.global](https://tada.global) (Throo: [ridethroo.ai](https://ridethroo.ai)) for the official site. This skill is the official integration that lets agents (Claude Code, OpenClaw, …) interact with TADA/Throo on the user's behalf. Bug reports and feedback should go through the repository this skill ships from.

### What you need to get started

- **Node.js 18+** on the host that runs the agent
- A host environment that supports skills (Claude Code, OpenClaw, …)
- A wallet — the built-in **Privy** embedded wallet the skill creates for you (no wallet of your own is needed)
- A small amount of **USDC** or **MVL token** to deposit as collateral, plus a small amount of the **native gas token** of the deposit chain to pay transaction fees during the deposit transaction
- A separate small amount of **USDC** to actually pay for ride fares afterwards (collateral and fares are different things — see below)

You do not need any other crypto knowledge to use the skill — the agent walks you through every signing step.

---

## First ride walkthrough

This section explains *what happens at each step* and *why the order matters*. For the actual commands, see the per-feature references.

### 1. Create your wallet
The skill needs a wallet because both the collateral deposit and the ride payment are on-chain operations. The agent creates a Privy embedded wallet for you — see *How wallets work in this skill* below for what that actually means.

### 2. Sign in with your wallet (SIWE)
The first time the agent talks to TADA's backend, it has to prove that you control the wallet you registered. It does this with a **Sign-In With Ethereum (SIWE)** message — a short text the wallet signs once, which the backend exchanges for a session. There is no password and no email/SMS code at this step; the wallet itself is your identity.

### 3. Verify your phone number
TADA/Throo accounts are tied to a verified phone number, mostly so drivers can contact riders if needed. The agent triggers an SMS OTP and asks you to type the code back. This only happens once per phone number.

### 4. Deposit collateral into TADA's deposit contract
Before you are eligible to request rides, you stake collateral — **USDC or MVL token** — into TADA's on-chain deposit contract. This is a one-time on-chain transfer to the deposit contract. **It is *not* a prepaid balance that ride fares are deducted from.** Your collateral stays on-chain in the deposit contract and can be withdrawn later when you no longer need access. This step requires the collateral itself plus a small amount of the chain's native gas token to pay the deposit transaction fee. Note: whichever token you deposit, your collateral is credited and returned as the **MVL token** — a USDC deposit is converted to an MVL credit, and a withdrawal returns MVL, not USDC.

### 5. Search for a ride
You tell the agent where you are and where you want to go. The skill resolves both into TADA "places" via autocomplete + an interactive map session, then queries available cars: how long the wait is, which classes are available, and what each one costs. (Origin and destination must currently be inside a city this skill supports — NYC or SIN.)

### 6. Request a ride
Once you pick a class, the skill submits a ride request. Driver assignment is asynchronous — TADA/Throo matches you with a nearby driver, and the skill polls for status updates.

### 7. Pay for the ride with x402 (USDC)
Ride payment is **completely separate from collateral**. After the ride completes, the agent settles the fare using **x402**, an HTTP-native payment protocol where the server tells the client exactly how much to pay and the client pays inline as part of the same request. The fare is paid out of your wallet's USDC balance — it does **not** draw from the deposit contract. Your collateral stays put.

### 8. Chat, tip, history
While the ride is active, you can chat with the driver in real time. After payment, you can send a tip in USDC. Past-ride review is currently in development.

---

## How wallets work in this skill

Understanding this is optional for casual use, but useful if you want to know exactly where keys live.

### Privy embedded wallets
The skill uses [Privy](https://privy.io), an embedded-wallet provider that splits a wallet's signing capability across multiple parties so no single place holds a complete private key.

- **The skill never stores a raw private key on disk.** Anywhere.
- Instead, the skill holds a local **quorum key** — a credential that authorises the skill to ask Privy to co-sign on your behalf. The quorum key alone cannot sign anything; signing requires both the local quorum key *and* Privy's side together.
- The quorum key lives in `TADA_AGENT_KEYS_DIR` (default `~/.tada-ride-agent/keys`) and is bound to your local agent installation.
- **If you delete the keys directory, this machine loses the ability to ask Privy to sign for that wallet.** The wallet still exists on Privy's side, but you would need to recover access through Privy's normal flow rather than from this skill alone. Treat the keys directory like an SSH key folder — back it up if you care about the wallet.

---

## FAQ

### About

**What is TADA/Throo?**
TADA/Throo is a ride-hailing service — see [tada.global](https://tada.global) (TADA) or [ridethroo.ai](https://ridethroo.ai) (Throo). The skill is a connector that lets an agent book and pay for TADA/Throo rides on your behalf.

**Where can I use TADA/Throo through this skill?**
The underlying app operates in multiple cities — **TADA** in New York, Denver, Singapore, Bangkok, Ho Chi Minh, Hanoi, Phnom Penh, Siem Reap, and Hong Kong, and **Throo** in New York only — but **this agent skill currently supports only New York (NYC) and Singapore (SIN)**. More cities will be added over time.

**Is this skill official?**
Yes — it is the official integration shipped by the TADA team.

**Where do I report bugs or send feedback?**
Through the repository this skill ships from. Issues filed there are seen by the maintainers.

### Getting started

**I'm new — what's the first thing I should do?**
Tell the agent something like *"install tada-ride"*. The agent will run the install script, then walk you through wallet setup, SIWE login, phone verification, and the initial collateral deposit. After that, you can ask for a ride directly.

**Do I really need crypto to use this?**
Yes — both the deposit step (eligibility) and ride payment are on-chain. You need:
- a small amount of **USDC** or **MVL token** to deposit as collateral,
- a small amount of the deposit chain's **native gas token** to pay the deposit transaction fee, and
- some **USDC** for actually paying ride fares afterwards.

You do not need any crypto knowledge beyond approving the steps the agent walks you through.

**Can I use my own wallet instead of the built-in one?**
Not at the moment — the skill creates and uses its own Privy embedded wallet. Bringing your own wallet address is not currently offered.

### How it works — concepts

**Why USDC for ride payment?**
USDC is a USD-pegged stablecoin available across the chains TADA/Throo supports. That keeps the price you see stable from quote to settlement, and lets the same payment flow work in every supported region without per-currency conversion.

**Why do I have to deposit anything up front? Isn't paying per ride enough?**
The deposit is a **separate, one-time eligibility step** — not a prepaid fare balance. TADA/Throo requires registered users to stake some collateral (USDC or MVL token) into its on-chain deposit contract before they can request rides. Per-ride fares are paid separately at the end of each ride out of your wallet's USDC balance, and **do not** draw from the deposit. Your collateral stays in the deposit contract and can be withdrawn whenever you want.

**Can I deposit something other than USDC as collateral?**
Yes — both USDC and the MVL token are accepted. Run the `deposit-tokens.js` command to see the current list of supported deposit tokens and their on-chain addresses.

**If I deposit USDC, do I get USDC back when I withdraw?**
No. Collateral is held as an **MVL credit** regardless of the token you deposit — a USDC deposit is converted to MVL at deposit time (at the backend's quoted rate), and `deposit-withdraw` returns that balance as the **MVL token**, not USDC.

**What is x402?**
[x402](https://www.x402.org) is an HTTP-native payment standard: the server returns a special response telling the client exactly how much to pay, and the client pays inline as part of the same request flow. As a user, you do not need to know x402 exists — the skill speaks it on your behalf, and it applies only to **ride-fare payment**, not to the collateral deposit.

**What is Privy and why does the skill use it?**
[Privy](https://privy.io) is an embedded-wallet provider that splits signing across multiple parties so no single place holds a complete private key. The skill stores only a local **quorum key** — see *How wallets work in this skill* above for the full picture.

**Why does the agent ask me to sign a "SIWE" message at login?**
SIWE = Sign-In With Ethereum. It is a way to prove ownership of a wallet to a backend without using a password. The signed message has no on-chain effect, costs no gas, and only authenticates your session.

### Privacy & security

**Where is my private key stored?**
There is no single "your private key" — Privy uses a split-signing model. The skill stores a local **quorum key** that lets it co-sign with Privy. See *How wallets work in this skill*.

**What is `TADA_AGENT_PASSPHRASE`?**
A passphrase the install script generates and stores in your local agent config. The skill uses it to encrypt the local database and any sensitive material kept on disk. **If you lose it, you lose access to that local state** — you will need to re-run wallet setup. Treat it like a password.

**What data leaves my machine and where does it go?**
The skill only talks to **TADA-operated servers**. Two logical surfaces:
- **Auth / wallet** — wallet creation, SIWE login, phone OTP verification.
- **Ride** — place search, ride search/request/status/cancel, payment, chat messages, tipping, history.

That's it. The skill does not call third parties for analytics or tracking.

**How do I uninstall and remove all my data?**
Remove the skill directory, then delete the data and key directories — by default `~/.tada-ride-agent/data` and `~/.tada-ride-agent/keys` (or whatever you set `TADA_AGENT_DATA_DIR` / `TADA_AGENT_KEYS_DIR` to).

⚠️ **Important:** the keys directory holds your **quorum key for the embedded Privy wallet**. Deleting it means this machine can no longer ask Privy to sign for that wallet. The wallet still exists on Privy's side, but you would need to go through Privy's recovery flow to use it again. If you want to keep the wallet usable, back up the keys directory before deleting.

### Other

**Does the agent ask me to confirm every booking and payment?**
Not necessarily. With the current design, an agent *can* be configured to act autonomously — for example, it can request a ride between previously-saved locations and settle the fare without an explicit per-step prompt. Whether confirmations are required depends on how the host environment (and you) have set the agent's autonomy. If you want a confirmation gate before every paying step, configure that at the agent level rather than expecting the skill itself to enforce it.

**Why can't I find rides where I am?**
Most likely the city is not yet supported by **this skill** — currently only NYC and SIN are wired up. Other possibilities: no driver is currently within range, or your origin/destination did not resolve to a valid TADA place. Try a more specific address or a nearby landmark.

---

## Where to go next

- **`wallet.md`** — wallet management, signing, SIWE, phone verification, balance, deposit / withdrawal
- **`ride.md`** — place search, ride search/request/status/cancel/payment, history, error codes, supported city codes
- **`tip.md`** — tip configuration and payment flow
- **`chat.md`** — driver chat, real-time daemon, image sending
