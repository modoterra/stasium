import { chmodSync, copyFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const hooks = ["commit-msg", "pre-commit"];
const repoRoot = process.cwd();
const gitDir = resolve(repoRoot, ".git");

if (!existsSync(gitDir)) {
  console.error("Not a git repository. Skipping hook install.");
  process.exit(0);
}

const targetHooksDir = resolve(gitDir, "hooks");
for (const hook of hooks) {
  const source = resolve(repoRoot, ".githooks", hook);
  const target = resolve(targetHooksDir, hook);
  try {
    copyFileSync(source, target);
    chmodSync(target, 0o755);
  } catch (error) {
    console.error(`Failed to install ${hook}`);
    process.exit(1);
  }
}

console.log("Git hooks installed in .git/hooks.");
