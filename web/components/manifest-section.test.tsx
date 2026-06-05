import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { manifestExample } from "../data/manifest-example";
import { ManifestSection } from "./manifest-section";

const manifestImplementation = readFileSync(join(process.cwd(), "src/manifest.ts"), "utf8");

describe("ManifestSection", () => {
  test("explains accepted candidates become editable manifest process definitions", () => {
    render(<ManifestSection />);

    expect(screen.getByText(/accepted Candidates become Process Definitions/i)).toBeInTheDocument();
    expect(screen.getByText(/plain TOML/i)).toBeInTheDocument();
    expect(screen.getByText(/edit the Manifest directly/i)).toBeInTheDocument();
    expect(screen.queryByText(/write a Manifest first/i)).not.toBeInTheDocument();
  });

  test("shows a small mixed-stack manifest example", () => {
    render(<ManifestSection />);

    expect(screen.getByText(/stasium.toml/i)).toBeInTheDocument();
    expect(screen.getByText(/name = "web"/i)).toBeInTheDocument();
    expect(screen.getByText(/command = \["bun", "run", "dev"\]/i)).toBeInTheDocument();
    expect(screen.getByText(/name = "queue"/i)).toBeInTheDocument();
    expect(screen.getByText(/command = \["php", "artisan", "queue:work"\]/i)).toBeInTheDocument();
    expect(screen.getByText(/depends_on = \["web"\]/i)).toBeInTheDocument();
  });

  test("example uses keys accepted by the current manifest implementation", () => {
    for (const key of ["name", "command", "working_dir", "restart_policy", "depends_on"]) {
      expect(manifestExample).toContain(key);
      expect(manifestImplementation).toContain(`"${key}"`);
    }

    expect(manifestExample).toContain("[[service]]");
    expect(manifestImplementation).toContain("service?: RawServiceConfig[]");
  });
});
