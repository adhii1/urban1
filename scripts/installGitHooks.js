#!/usr/bin/env node
/**
 * Installs a pre-push hook that runs `npm test`, so a failing suite blocks the
 * push instead of being noticed later.
 *
 * Runs from npm's `prepare` lifecycle — i.e. automatically on `npm install`, on
 * every machine, with no extra step for anyone to forget. That's deliberate: a
 * test suite nobody is obliged to run is documentation, not a gate.
 *
 * No husky, no new dependency: this writes one file into .git/hooks. It is
 * intentionally forgiving — a missing .git directory, a hook already installed
 * by someone else, or a read-only checkout all exit 0 with a note. `npm install`
 * failing because hook installation failed would be a worse outcome than an
 * uninstalled hook.
 *
 * Escape hatches, for when you genuinely need them:
 *   git push --no-verify      skip the hook for one push
 *   SKIP_TESTS=1 git push     same, without disabling other hooks
 */
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const MARKER = '# torqq-managed-hook';

const HOOK = `#!/bin/sh
${MARKER}
# Installed by scripts/installGitHooks.js. Bypass with 'git push --no-verify'.
if [ -n "$SKIP_TESTS" ]; then
  echo "pre-push: SKIP_TESTS set, skipping npm test"
  exit 0
fi
echo "pre-push: running npm test"
npm test --silent || {
  echo ""
  echo "pre-push: tests failed, push aborted."
  echo "  Fix the failures, or bypass deliberately with: git push --no-verify"
  exit 1
}
`;

function main() {
  const gitDir = path.join(ROOT, '.git');
  if (!fs.existsSync(gitDir)) {
    // Installed as a dependency, or a tarball export. Nothing to hook.
    return;
  }

  // A worktree or submodule has a .git *file* pointing elsewhere; resolve it.
  let hooksDir = path.join(gitDir, 'hooks');
  if (fs.statSync(gitDir).isFile()) {
    const pointer = fs.readFileSync(gitDir, 'utf8').match(/^gitdir:\s*(.+)$/m);
    if (!pointer) return;
    hooksDir = path.join(path.resolve(ROOT, pointer[1].trim()), 'hooks');
  }

  const hookPath = path.join(hooksDir, 'pre-push');

  if (fs.existsSync(hookPath)) {
    const existing = fs.readFileSync(hookPath, 'utf8');
    if (!existing.includes(MARKER)) {
      // Someone else's hook. Overwriting it would silently break their setup.
      console.log(
        `[hooks] pre-push already exists and is not ours — left alone.\n`
        + `        To enable the test gate, merge in the contents of\n`
        + `        scripts/installGitHooks.js, or delete ${hookPath} and re-run 'npm install'.`
      );
      return;
    }
    if (existing === HOOK) return; // already current
  }

  fs.mkdirSync(hooksDir, { recursive: true });
  fs.writeFileSync(hookPath, HOOK, { mode: 0o755 });
  console.log('[hooks] pre-push installed — npm test now gates every push.');
}

try {
  main();
} catch (error) {
  // Never fail `npm install` over a hook.
  console.log(`[hooks] could not install pre-push hook: ${error.message}`);
}
