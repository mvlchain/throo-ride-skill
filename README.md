# TADA/Throo Ride Skill

### What if over 52,000+ NYC drivers were instantly accessible by your AI agent? Introducing 🚕 Ambient Hailing  Your AI agent can now hail a real taxi.

Not a simulation. Not a demo network. A real driver, in a real car, pulling up to your curb, booked and paid for by your agent while you finish your coffee.

**Ambient Hailing** is an open-source skill that connects AI agents to two live ride-hailing fleets: **Throo in New York** and **TADA in Singapore**. Install it in Claude Code or OpenClaw, and your agent can search rides, compare fares, book, pay, chat with your driver, and tip, with your explicit approval at every step that matters.

```
You:    "Get me to JFK by 3pm."
Normal Agent:  "Found 3 cars nearby. Fastest is 4 min away, $52, arrives JFK 2:40pm. Book it?"
You:    "Yes."
Normal Agent:  "Booked. Marcus, white Camry, plate T7X-2041. He's 4 minutes out."
```

That's the whole UX. No app. No map-dragging. No surge-price roulette at 7am.

## Why this exists

Apps are just channels. In the agent era, your assistant won't open apps, it will talk to mobility infrastructure directly. We think ride-hailing is the perfect stress test for real-world agent commerce: it's real-time, safety-sensitive, and involves actual money. So we built it, open-sourced it, and connected it to fleets we actually operate.

This is what "agents doing things in the physical world" looks like when it's real.

## Overview

Book TADA/Throo rides through your AI agent — in Claude Code or OpenClaw (Telegram).

All runtime state (wallet keys, encrypted passphrase, ride DB) lives in `~/.tada/state/{data,keys}/` — independent of the skill's install directory since Phase 1. Installation does not touch `~/.openclaw/openclaw.json` or `.claude/settings.json`.

## Install

Pick the install location for your agent and run:

### Claude Code (user-level)

```bash
git clone https://github.com/mvlchain/throo-ride-skill.git ~/.claude/skills/tada-ride
node ~/.claude/skills/tada-ride/scripts/install.js
```

Restart Claude Code after the install script finishes.

### Claude Code (project-level)

```bash
git clone https://github.com/mvlchain/throo-ride-skill.git .claude/skills/tada-ride
node .claude/skills/tada-ride/scripts/install.js
```

### OpenClaw

```bash
git clone https://github.com/mvlchain/throo-ride-skill.git ~/.openclaw/skills/tada-ride
node ~/.openclaw/skills/tada-ride/scripts/install.js
```

After install completes, restart the gateway:
```bash
openclaw gateway restart
```

## What `install.js` does

L1 bootstrap (skill side): fetches the `tada` CLI binary and puts it on `$PATH`. Depending on the build, the CLI is installed one of two ways:

**git builds (dev/staging):**

1. Clones `mvlchain/tada-cli` (dev/staging branch) into `~/.tada/cli/` — or runs `git fetch + reset --hard` if it already exists.
2. Runs `npm install --omit=dev` in that directory — the CLI's native dependencies (`better-sqlite3` and friends) live outside the bundled binary and must be resolved separately. (The skill bundle itself has no dependencies — its scripts import nothing outside Node's builtins, so nothing is installed inside the skill directory.)
3. `chmod +x ~/.tada/cli/tada` and creates a symlink at `~/.local/bin/tada` (overwriting any existing one).
4. Verifies `~/.local/bin` is on `$PATH` (fatal exit with guidance if not).

**npm builds (prod):**

1. Runs `npm i -g @mvlchain/tada-cli@latest` — npm registers the `tada` binary in its own global bin dir (`npm config get prefix` appended with `/bin`), which is normally already on `$PATH`.
2. Verifies `tada` actually resolves on `$PATH` (fatal exit with guidance to add npm's global bin dir if not).

Then, regardless of mode:

- Calls `tada --version` and checks the baked expected version matches (git: `git_sha`; npm: semver against `TADA_AGENT_MIN_VERSION`) — on mismatch, retries the install step (`git fetch + reset --hard` or `npm i -g`) once automatically.

L2 delegation (`tada install`):

1. Creates `~/.tada/state/{data,keys}/`.
2. Generates (if absent) or preserves (if present) `TADA_AGENT_PASSPHRASE`, writing it to `~/.tada/state/data/.env` (mode `0600`). **Existing passphrase is never overwritten** — losing it would brick wallet keys.
3. Migrates legacy state (`~/.tada-ride-agent/` etc.) into `~/.tada/state/` via non-destructive copy + `.migrated-from-legacy` marker.
4. Cleans up any legacy env entries this skill previously injected into `~/.openclaw/openclaw.json` or `.claude/settings.json`.

No new entries are added to platform config files. Every step is idempotent — re-running skips anything already in place.

On success, stdout emits a single-line JSON: `{"status":"installed" | "already_installed", ...}`. On failure, stderr emits a single-line JSON: `{"error":"<CODE>","message":"..."}`.

## Requirements

- Node.js 18 or newer
- `npm` (ships with Node — git builds invoke `npm install --omit=dev` inside `~/.tada/cli/`; npm builds invoke `npm i -g @mvlchain/tada-cli@latest`)
- `git` — needed to clone this skill bundle itself; git builds additionally use it to clone `mvlchain/tada-cli` (npm builds don't)
- The `tada` binary must end up on `$PATH`:
  - **git builds**: `~/.local/bin` must be on `$PATH` — usually automatic on modern Linux/macOS; otherwise add `export PATH="$HOME/.local/bin:$PATH"` to your shell profile and open a new shell
  - **npm builds**: npm's global bin dir (`npm config get prefix` + `/bin`) must be on `$PATH` — normally automatic for any working npm install; otherwise add it to your shell profile and open a new shell

If `better-sqlite3` install fails (corporate proxy / missing build tools):
- If the prebuilt binary cannot be downloaded, build from source: install `apt install build-essential python3` on Linux, Xcode Command Line Tools on macOS, or Visual Studio Build Tools on Windows, then re-run `install.js`.
- Or set an internal mirror: `npm config set better_sqlite3_binary_host_mirror <internal_mirror>` then retry.

For ABI mismatch (`Error: ... NODE_MODULE_VERSION`): make sure Node ≥ 18 is active (`node --version`), then `rm -rf ~/.tada/cli && node <SKILL_DIR>/scripts/install.js` (re-clone + re-install).

## Install error codes

When `install.js` fails it exits non-zero and writes a single-line JSON to stderr: `{"error":"<CODE>","message":"..."}`. Each code maps to a specific recovery action:

| Code | Meaning | Recovery |
|---|---|---|
| `SSH_KEY_MISSING` | `git clone` of `mvlchain/tada-cli` failed (SSH auth rejected, or repo not reachable) | Register your GitHub SSH key (`ssh-add ~/.ssh/id_*`); verify access to the `mvlchain` org with `ssh -T git@github.com`; then re-run `install.js`. |
| `SYMLINK_FAILED` | Cannot write to `~/.local/bin/tada` | `mkdir -p ~/.local/bin` then check write permission (`ls -la ~/.local/bin`); re-run `install.js`. |
| `PATH_MISSING` | `tada` did not resolve on `$PATH` after install. **git builds**: `~/.local/bin` is not on `$PATH`. **npm builds**: npm's global bin dir (`npm config get prefix` + `/bin`) is not on `$PATH` | **git builds**: add `export PATH="$HOME/.local/bin:$PATH"` to your shell profile (`.bashrc` / `.zshrc` / `.profile`). **npm builds**: add npm's global bin dir instead — run `npm config get prefix`, append `/bin`, and add `export PATH="<that dir>:$PATH"` to your shell profile. Either way, open a new shell, then re-run `install.js`. |
| `SHA_MISMATCH` | `tada --version`'s `git_sha` doesn't match the sha baked into this skill bundle, even after one `git fetch + reset --hard` retry | The skill bundle expects a newer CLI than what `mvlchain/tada-cli` has on its dev/staging branch — usually a transient state during a deploy. Wait a moment and re-run; if it persists, the CLI push lagged or failed and needs operator attention. |
| `VERSION_MISMATCH` | (`'npm'` mode only) `tada --version`'s `version` is below the baked `TADA_AGENT_MIN_VERSION` after one `npm i -g` retry | Run `npm i -g @mvlchain/tada-cli@latest` manually and re-run `install.js`. If it still fails, your npm prefix may differ — check `npm config get prefix` and verify the registered `tada` binary. |
| `TADA_INSTALL_FAILED` | One of three sub-failures (the `message` field disambiguates): (a) `npm install --omit=dev failed: ...` — git builds: native deps did not install, (b) `npm install failed: ...` — npm builds: `npm i -g @mvlchain/tada-cli` failed, or (c) `tada install` child process exited non-zero — state init failed | (a) See the `better-sqlite3` notes in **Requirements** above. (b) Check network/registry access and npm auth, then retry `npm i -g @mvlchain/tada-cli@latest`. (c) The child's stderr is passed through in `message`; act on that. Re-run `install.js` once the underlying issue is fixed. |

`install.js` is idempotent. After fixing the underlying issue, simply re-run it.

## Updating the skill

To pick up a newer version of the skill:

```bash
cd <install_dir>
git pull
node scripts/install.js   # idempotent — re-syncs ~/.tada/cli + preserves passphrase + DB + keys
```

`install.js` is safe to re-run; it never regenerates an existing passphrase, and `~/.tada/cli` is brought up to the latest baked sha automatically via `git fetch + reset --hard`.

## Account modes (TADA/Throo member vs crypto wallet)

After install, the skill operates in one of two account modes. Day to day you don't run these commands yourself — the agent drives onboarding from your answers (see `SKILL.md`) — but this is what happens underneath.

Check the current mode at any time:

```bash
tada whoami     # JSON: { "mode": "tada" | "wallet" | null, "member_available": <bool>, ... }
```

- `mode: "tada"` — signed in to a **TADA/Throo member account**; rides are paid with your registered card.
- `mode: "wallet"` — **crypto wallet** mode; rides are paid from the wallet.
- `mode: null` — not onboarded yet.

`member_available` reports whether this build ships TADA/Throo member support. When it is `false`, only crypto wallet mode is offered (member commands return `status: "unavailable"`).

`tada install` is non-interactive and does **not** pick a mode — onboarding (member vs wallet) happens on first use, driven by the agent.

### Sign in to a TADA/Throo member account

Member sign-in uses the TADA/Throo app (device-flow); there is no CLI password:

```bash
tada login      # interactive: prints an approval link, then prompts for the 4-digit code
```

Open the printed link in the TADA/Throo app, approve it, and the app shows a 4-digit code; enter it when prompted. `tada whoami` then reports `mode: "tada"`.

For non-interactive / agent use, the same flow is split into two calls:

```bash
tada login --no-wait             # → { "status": "auth_required", "approval_url": "…" }
tada login-verify --code <code>  # → { "status": "logged_in" | "invalid_code" | "session_expired" }
```

Sign out of the member account (wallet state is untouched):

```bash
tada logout
```

For crypto wallet setup (`tada wallet-setup` / `tada wallet-add-external`) and the full ride/tip/chat command surface, see `SKILL.md` and `references/`.

## State Layout

All skill runtime state lives under `~/.tada/state/` — independent of the skill install directory since Phase 1:

```
~/.tada/state/
├── data/
│   ├── tada-ride-agent.db    SQLite (wallet metadata, ride state, dedup, ...)
│   └── .env                  TADA_AGENT_PASSPHRASE (created/preserved by install.js)
└── keys/
    └── <wallet_id>_private.enc, <wallet_id>_public.pem
                              Encrypted Privy keys (decryptable only with the passphrase)
```

To use the same wallets from a different location, `cp -r ~/.tada /target/.tada` is enough (`k_i_key_path` is stored as a relative path, so there are no absolute-path conflicts).

Old locations (`~/.tada-ride-agent/`, `<SKILL_DIR>/.tada-state/`) are auto-migrated on the first `loadConfig()` call (backup-first, idempotent).

## Optional runtime overrides

The defaults work without any env vars. Only override in special cases.

| Env var | Default | Purpose |
|---|---|---|
| `TADA_AGENT_STATE_DIR` | `~/.tada` | State root; `data/keys` live under `state/{data,keys}` automatically. |
| `TADA_AGENT_DATA_DIR` | `<STATE_DIR>/state/data` | SQLite + `.env` location. |
| `TADA_AGENT_KEYS_DIR` | `<STATE_DIR>/state/keys` | Encrypted keys location. |
| `TADA_AGENT_PASSPHRASE` | (generated by `install.js`) | Wallet-key encryption passphrase. If you move state without moving this, the keys can no longer be decrypted. |
| `TADA_AGENT_DEPOSIT_RPC_URL_<NETWORK>` | public RPC | Per-network RPC override (e.g. `..._BASE_SEPOLIA`). |
| `TADA_AGENT_PAYMENT_RPC_URL` | the payment network's default | Payment RPC override. |

## Repository layout

- `scripts/`, `references/`, `SKILL.md`, `package.json` — the skill itself
- Runtime state lives under `~/.tada/state/` — see State Layout above

## License

Two artifacts, two licenses:

| Artifact | License |
| --- | --- |
| **Skill bundle** — `SKILL.md`, `references/`, `scripts/` (this repo) | **MIT** — see `LICENSE` |
| **CLI** — `@mvlchain/tada-cli` (installed separately) | **Proprietary** — install and run only; no redistribution, modification, or reverse engineering. See the `LICENSE` file inside the npm package, or run `tada --version` |

Using the CLI to access TADA/Throo services is additionally governed by the TADA/Throo Terms of Service.
