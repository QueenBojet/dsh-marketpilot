# Executed command evidence

Captured on 2026-10-13 in `E:\PythonProjects\Work_Platform\marketpilot`.
Text logs preserve terminal output with newline/trailing whitespace normalized
for Git. SHA values refer to data/artifact bytes, not these text logs.

| File | Executed command / procedure |
| --- | --- |
| `01-before-fix.log` | `npx vitest run tests/v4-downgrade.spec.ts`, expected old-version reopen, exit 1 |
| `02-after-fix.log` | Same command, after fix, with `MARKETPILOT_LEGACY_STORE=E:/PythonProjects/Work_Platform/marketpilot-backups/20261012-225649-v4-m0`, exit 0 |
| `03-typecheck.log` | `npx tsc --noEmit -p .`, exit 0 |
| `04-regression.log` | `npx vitest run`, same legacy-copy environment variable, exit 0 |
| `05-build.log` | `npm run build`, exit 0 |
| `06-cli.log` | `node scripts/verify-v4-storage.mjs`, exit 0; invokes the PowerShell wrapper 11 times and kills a real conversion worker |
| `07-desktop-preflight.log` | `node scripts/prepare-v4-isolated.mjs --profile C:/Users/zjdzc/AppData/Roaming/dsh-desktop/harness/profiles/web --backup E:/PythonProjects/Work_Platform/marketpilot-backups/20261012-225649-v4-m0/marketpilot.json`, exit 0 |
| `08-installed-runtime.log` | Installed `.desktop-bin/node.cmd` runs `scripts/v4-storage.mjs --mode downgrade --source <isolated storage>/marketpilot.json --output <isolated root>/runtime-dry-run --dry-run`; whitelist summary plus read-only config/runtime/PID checks |

The two-round trace includes complete-record hashes and DOCX/baseline SHA values.
The real backup trace contains only counts and hashes; no original project text
or credentials are saved. Production Desktop JSON was not loaded or written.
The preflight directory is local and temporary; GUI startup remains unverified.
