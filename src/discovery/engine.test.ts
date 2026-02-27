import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { detectDiscoveryCandidates } from "./engine";
import type { DiscoveryStrategy, StrategyWhen } from "./types";

const emptyWhen = (): StrategyWhen => ({
  all_files: [],
  any_files: [],
  all_json_paths: [],
  any_json_paths: [],
  all_toml_paths: [],
  any_toml_paths: [],
  all_regex: [],
  any_regex: [],
});

describe("discovery engine", () => {
  test("detects candidates and interpolates captures", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));

    try {
      await Bun.write(
        join(dir, "package.json"),
        JSON.stringify(
          {
            scripts: {
              dev: "vite",
            },
          },
          null,
          2,
        ),
      );
      await Bun.write(join(dir, "bun.lock"), "");

      const strategy: DiscoveryStrategy = {
        id: "node-dev",
        label: "Node dev",
        priority: 100,
        default_selected: true,
        when: {
          ...emptyWhen(),
          all_files: ["package.json"],
        },
        capture: [
          {
            name: "package_manager",
            kind: "lockfile_package_manager",
          },
          {
            name: "script",
            kind: "json_first_existing",
            file: "package.json",
            paths: ["scripts.dev"],
          },
        ],
        service: {
          name: "frontend",
          command: ["${package_manager}", "run", "${script}"],
        },
      };

      const detected = await detectDiscoveryCandidates(dir, [strategy]);
      expect(detected.warnings).toHaveLength(0);
      expect(detected.candidates).toHaveLength(1);
      expect(detected.candidates[0]?.service.command).toEqual(["bun", "run", "vite"]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("skips candidates when required capture is missing", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));

    try {
      await Bun.write(join(dir, "package.json"), JSON.stringify({ scripts: {} }, null, 2));

      const strategy: DiscoveryStrategy = {
        id: "node-dev",
        label: "Node dev",
        priority: 100,
        default_selected: true,
        when: {
          ...emptyWhen(),
          all_files: ["package.json"],
        },
        capture: [
          {
            name: "script",
            kind: "json_first_existing",
            file: "package.json",
            paths: ["scripts.dev"],
          },
        ],
        service: {
          name: "frontend",
          command: ["bun", "run", "${script}"],
        },
      };

      const detected = await detectDiscoveryCandidates(dir, [strategy]);
      expect(detected.candidates).toHaveLength(0);
      expect(detected.warnings).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("supports TOML path and regex predicates", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));

    try {
      await Bun.write(
        join(dir, "pyproject.toml"),
        `
[project]
name = "demo"
`,
      );
      await Bun.write(
        join(dir, "main.py"),
        `
from fastapi import FastAPI

app = FastAPI()
`,
      );

      const strategy: DiscoveryStrategy = {
        id: "fastapi-main",
        label: "FastAPI",
        priority: 100,
        default_selected: true,
        when: {
          ...emptyWhen(),
          all_toml_paths: [{ file: "pyproject.toml", path: "project.name" }],
          all_regex: [{ file: "main.py", pattern: "FastAPI\\s*\\(" }],
        },
        capture: [],
        service: {
          name: "api",
          command: ["python", "-m", "uvicorn", "main:app", "--reload"],
        },
      };

      const detected = await detectDiscoveryCandidates(dir, [strategy]);
      expect(detected.warnings).toHaveLength(0);
      expect(detected.candidates).toHaveLength(1);
      expect(detected.candidates[0]?.strategyId).toBe("fastapi-main");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
