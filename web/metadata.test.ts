import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "vitest";

const indexHtml = readFileSync(join(process.cwd(), "index.html"), "utf8");

describe("website metadata", () => {
  test("sets production title and descriptions", () => {
    expect(indexHtml).toContain("<title>Stasium - Start your project from one terminal</title>");
    expect(indexHtml).toContain("discovers the commands your Project needs");
    expect(indexHtml).toContain("saves them to a Manifest");
    expect(indexHtml).toContain("Development Stack from one terminal Workspace");
  });

  test("sets canonical, Open Graph, and Twitter metadata without images", () => {
    expect(indexHtml).toContain('rel="canonical" href="https://stasium.io"');
    expect(indexHtml).toContain('property="og:title"');
    expect(indexHtml).toContain('property="og:description"');
    expect(indexHtml).toContain('property="og:url" content="https://stasium.io"');
    expect(indexHtml).toContain('property="og:type" content="website"');
    expect(indexHtml).toContain('name="twitter:card" content="summary"');
    expect(indexHtml).toContain('name="twitter:title"');
    expect(indexHtml).toContain('name="twitter:description"');
    expect(indexHtml).not.toContain("og:image");
    expect(indexHtml).not.toContain("twitter:image");
  });

  test("keeps favicon reference valid", () => {
    expect(indexHtml).toContain('href="/favicon.svg"');
    expect(existsSync(join(process.cwd(), "public/favicon.svg"))).toBe(true);
  });
});
