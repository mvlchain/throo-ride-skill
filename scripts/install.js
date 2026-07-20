#!/usr/bin/env node

// src/scripts/install.ts
import os2 from "os";
import path2 from "path";

// src/lib/install/cli-bootstrap.ts
import fs from "fs";
import path from "path";
import { execFileSync as nodeExecFileSync } from "child_process";
import os from "os";
function ensureCliClone(opts) {
  const deps = opts.deps ?? {
    execSync: (file, args) => nodeExecFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] })
  };
  const gitDir = path.join(opts.cliDir, ".git");
  if (fs.existsSync(gitDir)) {
    deps.execSync("git", ["-C", opts.cliDir, "fetch"]);
    deps.execSync("git", ["-C", opts.cliDir, "reset", "--hard", `origin/${opts.branch}`]);
    return;
  }
  fs.mkdirSync(path.dirname(opts.cliDir), { recursive: true });
  deps.execSync("git", ["clone", "-b", opts.branch, opts.repoUrl, opts.cliDir]);
}
function ensureSymlink(opts) {
  fs.chmodSync(opts.src, 493);
  fs.mkdirSync(path.dirname(opts.dst), { recursive: true });
  try {
    fs.unlinkSync(opts.dst);
  } catch {
  }
  fs.symlinkSync(opts.src, opts.dst);
}
function checkPath(targetDir, pathEnv, home = os.homedir()) {
  const expanded = targetDir.startsWith("~/") ? path.join(home, targetDir.slice(2)) : path.resolve(targetDir);
  const segs = pathEnv.split(":").map((s) => path.resolve(s.replace(/^~\//, home + "/")));
  return segs.includes(expanded);
}

// src/lib/install/cli-verify.ts
function parseVersionLine(line) {
  const trimmed = line.trim();
  const obj = JSON.parse(trimmed);
  if (typeof obj.version !== "string" || typeof obj.git_sha !== "string") {
    throw new Error(`tada --version returned unexpected shape: ${trimmed}`);
  }
  return obj;
}
function cmpSemver(a, b) {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da < db) return -1;
    if (da > db) return 1;
  }
  return 0;
}
function check(opts, version, git_sha) {
  if (opts.mode === "git") {
    if (git_sha === opts.expectedSha) return { ok: true };
    return {
      ok: false,
      error: "SHA_MISMATCH",
      message: `expected git_sha=${opts.expectedSha}, actual git_sha=${git_sha} (version=${version})`
    };
  }
  if (cmpSemver(version, opts.minVersion) >= 0) return { ok: true };
  return {
    ok: false,
    error: "VERSION_MISMATCH",
    message: `expected version >= ${opts.minVersion}, actual version=${version}`
  };
}
function verifyCli(opts) {
  const out1 = opts.deps.runVersion();
  const v1 = parseVersionLine(out1);
  const r1 = check(opts, v1.version, v1.git_sha);
  if (r1.ok) return r1;
  opts.deps.runRetry();
  const out2 = opts.deps.runVersion();
  const v2 = parseVersionLine(out2);
  return check(opts, v2.version, v2.git_sha);
}

// src/lib/install/cli-install-delegate.ts
import { spawnSync as nodeSpawnSync } from "child_process";
function delegateTadaInstall(opts = {}) {
  const tadaCmd = opts.tadaCmd ?? "tada";
  const deps = opts.deps ?? {
    spawnSync: () => nodeSpawnSync(tadaCmd, ["install"], { encoding: "utf8" })
  };
  const result = deps.spawnSync();
  const code = result.status;
  if (code === 0) {
    return { ok: true, stdout: result.stdout ?? "" };
  }
  const spawnError = result.error;
  const message = (result.stderr ?? "").trim() || (spawnError ? `tada spawn failed: ${spawnError.message}` : `tada install exited with code ${code}`);
  return {
    ok: false,
    error: "TADA_INSTALL_FAILED",
    message
  };
}

// src/lib/install/errors.ts
function writeFatalError(error, message) {
  const flat = message.replace(/\s*[\r\n]+\s*/g, " ");
  process.stderr.write(JSON.stringify({ error, message: flat }) + "\n");
}

// src/scripts/install.ts
import { execFileSync as nodeExecFileSync2, spawnSync as nodeSpawnSync2 } from "child_process";
var REPO_URL = "git@github.com:mvlchain/tada-cli";
var NPM_PACKAGE = "@mvlchain/tada-cli";
var SYMLINK_DIR = "~/.local/bin";
var SYMLINK_TARGET = "tada";
function defaultDeps() {
  return {
    ensureCliClone,
    ensureSymlink,
    checkPath,
    verifyCli,
    delegateTadaInstall: () => delegateTadaInstall(),
    // Intentional: npm registers the bin via package.json, so we don't need a
    // separate symlink step in npm mode. installNpm is one shell call only.
    installNpm: () => {
      nodeExecFileSync2("npm", ["i", "-g", `${NPM_PACKAGE}@latest`], { encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] });
    },
    installDeps: (cliDir) => {
      nodeExecFileSync2("npm", ["install", "--omit=dev", "--silent"], {
        cwd: cliDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "inherit"]
      });
    },
    resolveTada: () => {
      const r = nodeSpawnSync2("which", ["tada"], { encoding: "utf8" });
      if (r.status === 0 && r.stdout.trim() !== "") return r.stdout.trim();
      return null;
    },
    npmGlobalBinDir: () => {
      try {
        const prefix = nodeExecFileSync2("npm", ["config", "get", "prefix"], { encoding: "utf8" }).trim();
        if (prefix === "") return null;
        return path2.join(prefix, "bin");
      } catch {
        return null;
      }
    }
  };
}
function ensureBaked(name, value) {
  if (value === void 0 || value === "") {
    throw new Error(`Missing baked env: ${name} \u2014 was this built with tsup?`);
  }
  return value;
}
function expandHome(p) {
  if (p.startsWith("~/")) return path2.join(os2.homedir(), p.slice(2));
  return p;
}
async function runInstall(depsOverride) {
  const deps = depsOverride ?? defaultDeps();
  const mode = ensureBaked("TADA_AGENT_INSTALL_MODE", "npm");
  const branch = ensureBaked("TADA_AGENT_CLI_REPO_BRANCH", "main");
  const expectedSha = ensureBaked("TADA_AGENT_EXPECTED_CLI_SHA", "125cad9");
  const minVersion = ensureBaked("TADA_AGENT_MIN_VERSION", "1.2.1");
  const cliDir = expandHome("~/.tada/cli");
  const binDir = expandHome(SYMLINK_DIR);
  const linkPath = path2.join(binDir, SYMLINK_TARGET);
  if (mode === "git") {
    try {
      deps.ensureCliClone({ cliDir, branch, repoUrl: REPO_URL });
    } catch (e) {
      writeFatalError("SSH_KEY_MISSING", `git clone failed: ${e.message}`);
      return 1;
    }
    try {
      deps.installDeps(cliDir);
    } catch (e) {
      writeFatalError("TADA_INSTALL_FAILED", `npm install --omit=dev failed: ${e.message}`);
      return 1;
    }
    try {
      deps.ensureSymlink({ src: path2.join(cliDir, "tada"), dst: linkPath });
    } catch (e) {
      writeFatalError("SYMLINK_FAILED", e.message);
      return 1;
    }
  } else {
    try {
      deps.installNpm();
    } catch (e) {
      writeFatalError("TADA_INSTALL_FAILED", `npm install failed: ${e.message}`);
      return 1;
    }
  }
  if (mode === "git") {
    const pathOk = deps.checkPath(SYMLINK_DIR, process.env["PATH"] ?? "");
    if (!pathOk) {
      writeFatalError(
        "PATH_MISSING",
        `~/.local/bin is not in $PATH. Add 'export PATH="$HOME/.local/bin:$PATH"' to your shell profile (.bashrc / .zshrc) and reopen the shell.`
      );
      return 1;
    }
  } else {
    const resolved = deps.resolveTada();
    if (!resolved) {
      const npmBin = deps.npmGlobalBinDir();
      const hint = npmBin ? `'tada' is not on your $PATH. Add npm's global bin dir to your $PATH: export PATH="${npmBin}:$PATH" (put it in your .bashrc / .zshrc and reopen the shell).` : `'tada' is not on your $PATH after 'npm i -g'. Find npm's global bin dir with 'npm config get prefix' (append /bin), add it to your $PATH in your .bashrc / .zshrc, then reopen the shell.`;
      writeFatalError("PATH_MISSING", hint);
      return 1;
    }
  }
  let verify;
  try {
    verify = deps.verifyCli({
      mode,
      expectedSha,
      minVersion,
      deps: {
        runVersion: () => {
          const r = nodeSpawnSync2("tada", ["--version", "--json"], { encoding: "utf8" });
          if (r.error) {
            throw new Error(`tada --version spawn failed: ${r.error.message}`);
          }
          if (r.status !== 0) {
            throw new Error(`tada --version exited ${r.status}: ${r.stderr}`);
          }
          return r.stdout;
        },
        runRetry: () => {
          if (mode === "git") {
            deps.ensureCliClone({ cliDir, branch, repoUrl: REPO_URL });
          } else {
            deps.installNpm();
          }
        }
      }
    });
  } catch (e) {
    writeFatalError("SHA_MISMATCH", `tada --version unparseable or spawn failed: ${e.message}`);
    return 1;
  }
  if (!verify.ok) {
    writeFatalError(verify.error, verify.message);
    return 1;
  }
  const delegated = await deps.delegateTadaInstall();
  if (!delegated.ok) {
    writeFatalError(delegated.error, delegated.message);
    return 1;
  }
  process.stdout.write(delegated.stdout);
  return 0;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  runInstall().then((code) => process.exit(code));
}
export {
  runInstall
};
