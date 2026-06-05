import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

describe("website deployment preservation", () => {
  test("keeps GitHub Pages build output and custom domain", () => {
    const workflow = readFileSync(join(process.cwd(), ".github/workflows/pages.yml"), "utf8");
    const cname = readFileSync(join(process.cwd(), "public/CNAME"), "utf8").trim();

    expect(workflow).toContain("bun run build:site");
    expect(workflow).toContain("path: dist/site");
    expect(cname).toBe("stasium.io");
  });
});
