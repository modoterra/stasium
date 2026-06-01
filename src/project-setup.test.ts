import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DiscoverySelection } from "./discovery";
import { loadManifest } from "./manifest";
import { normalizeProcessDefinition } from "./process-definition";
import { createProjectManifest } from "./project-setup";
import type { DetectedCandidate } from "./discovery";

describe("createProjectManifest", () => {
  test("creates an empty Manifest without requiring a Workspace", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-setup-"));
    const manifestPath = join(dir, "stasium.toml");
    try {
      const result = await createProjectManifest(manifestPath, null);
      const manifest = await loadManifest(manifestPath);

      expect(result.services).toEqual([]);
      expect(manifest.services).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("creates a Manifest from selected Candidates", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-setup-"));
    const manifestPath = join(dir, "stasium.toml");
    try {
      const candidate: DetectedCandidate = {
        strategyId: "node",
        label: "Node",
        priority: 10,
        defaultSelected: true,
        service: normalizeProcessDefinition({ name: "web", command: "bun run dev" }),
        dependsOnIds: [],
      };
      const selection = new DiscoverySelection([candidate]);

      const result = await createProjectManifest(manifestPath, selection);
      const manifest = await loadManifest(manifestPath);

      expect(result.services.map((service) => service.name)).toEqual(["web"]);
      expect(manifest.services.map((service) => service.name)).toEqual(["web"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
