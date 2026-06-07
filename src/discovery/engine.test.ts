import { describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { detectDiscoveryCandidates } from "./engine";
import { loadDiscoveryStrategies } from "./strategy-loader";
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
            kind: "json_first_existing_key",
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
      expect(detected.candidates[0]?.service.launchInstruction).toEqual({
        executable: "bun",
        arguments: ["run", "dev"],
      });
      expect(detected.candidates[0]?.service.workingDir).toBe(resolve(dir));
      expect(detected.candidates[0]?.service.environment).toEqual({});
      expect(detected.candidates[0]?.service.restartRule).toBe("never");
      expect(detected.candidates[0]?.service.startupDependencies).toEqual([]);
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
            kind: "json_first_existing_key",
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

  test("drops invalid raw candidate proposals with warnings", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));

    try {
      const strategy: DiscoveryStrategy = {
        id: "shell-style",
        label: "Shell style",
        priority: 100,
        default_selected: true,
        when: emptyWhen(),
        capture: [],
        service: {
          name: "api",
          command: "bun run dev && bun run worker",
        },
      };

      const detected = await detectDiscoveryCandidates(dir, [strategy]);

      expect(detected.candidates).toEqual([]);
      expect(detected.warnings).toEqual([
        "Strategy 'shell-style' produced an invalid Process Definition: command contains shell operator '&'. Use an argv array instead of shell syntax.",
      ]);
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

  test("detects laravel queue and scheduler from framework presence", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));

    try {
      await Bun.write(join(dir, "artisan"), "#!/usr/bin/env php\n");
      await Bun.write(
        join(dir, "composer.json"),
        JSON.stringify(
          {
            require: {
              "laravel/framework": "^11.0",
            },
          },
          null,
          2,
        ),
      );

      const loaded = await loadDiscoveryStrategies(dir);
      const detected = await detectDiscoveryCandidates(dir, loaded.strategies);
      const strategyIds = new Set(detected.candidates.map((candidate) => candidate.strategyId));

      expect(strategyIds.has("laravel-app")).toBe(true);
      expect(strategyIds.has("laravel-queue")).toBe(true);
      expect(strategyIds.has("laravel-scheduler")).toBe(true);
      expect(strategyIds.has("laravel-horizon")).toBe(false);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("detects fresh laravel frontend as npm run dev", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));

    try {
      await Bun.write(join(dir, "artisan"), "#!/usr/bin/env php\n");
      await Bun.write(
        join(dir, "composer.json"),
        JSON.stringify(
          {
            require: {
              "laravel/framework": "^11.0",
            },
          },
          null,
          2,
        ),
      );
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

      const loaded = await loadDiscoveryStrategies(dir);
      const detected = await detectDiscoveryCandidates(dir, loaded.strategies);
      const frontend = detected.candidates.find((candidate) => candidate.strategyId === "node-dev");

      expect(frontend?.service.launchInstruction).toEqual({
        executable: "npm",
        arguments: ["run", "dev"],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("detects modern javascript framework strategies from package dependencies", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));

    try {
      await Bun.write(
        join(dir, "package.json"),
        JSON.stringify(
          {
            scripts: {
              dev: "vite --host 0.0.0.0",
              start: "next start",
              "start:dev": "nest start --watch",
            },
            dependencies: {
              next: "^16.0.0",
              astro: "^5.0.0",
              "@sveltejs/kit": "^2.0.0",
              nuxt: "^4.0.0",
              vite: "^8.0.0",
              vue: "^3.0.0",
              "@angular/cli": "^21.0.0",
              "@nestjs/core": "^11.0.0",
            },
          },
          null,
          2,
        ),
      );
      await Bun.write(join(dir, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");

      const loaded = await loadDiscoveryStrategies(dir);
      const detected = await detectDiscoveryCandidates(dir, loaded.strategies);
      const byId = new Map(
        detected.candidates.map((candidate) => [candidate.strategyId, candidate]),
      );

      expect(byId.get("next-app")?.service.launchInstruction).toEqual({
        executable: "pnpm",
        arguments: ["run", "dev"],
      });
      expect(byId.get("astro-app")?.service.launchInstruction).toEqual({
        executable: "pnpm",
        arguments: ["run", "dev"],
      });
      expect(byId.get("sveltekit-app")?.service.launchInstruction).toEqual({
        executable: "pnpm",
        arguments: ["run", "dev"],
      });
      expect(byId.get("nuxt-app")?.service.launchInstruction).toEqual({
        executable: "pnpm",
        arguments: ["run", "dev"],
      });
      expect(byId.get("vite-app")?.service.launchInstruction).toEqual({
        executable: "pnpm",
        arguments: ["run", "dev"],
      });
      expect(byId.get("vue-app")?.service.launchInstruction).toEqual({
        executable: "pnpm",
        arguments: ["run", "dev"],
      });
      expect(byId.get("angular-app")?.service.launchInstruction).toEqual({
        executable: "pnpm",
        arguments: ["run", "start"],
      });
      expect(byId.get("nestjs-app")?.service.launchInstruction).toEqual({
        executable: "pnpm",
        arguments: ["run", "start:dev"],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("detects rails bin/dev and phoenix servers", async () => {
    const railsDir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));
    const phoenixDir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));

    try {
      await mkdir(join(railsDir, "config"));
      await mkdir(join(railsDir, "bin"));
      await Bun.write(join(railsDir, "Gemfile"), "gem 'rails'\n");
      await Bun.write(join(railsDir, "config/application.rb"), "module App\nend\n");
      await Bun.write(join(railsDir, "bin/rails"), "#!/usr/bin/env ruby\n");
      await Bun.write(join(railsDir, "bin/dev"), "#!/usr/bin/env sh\n");

      const railsLoaded = await loadDiscoveryStrategies(railsDir);
      const railsDetected = await detectDiscoveryCandidates(railsDir, railsLoaded.strategies);
      const railsById = new Map(
        railsDetected.candidates.map((candidate) => [candidate.strategyId, candidate]),
      );

      expect(railsById.get("rails-bin-dev")?.service.launchInstruction).toEqual({
        executable: "bin/dev",
        arguments: [],
      });
      expect(railsById.has("rails-app")).toBe(true);

      await Bun.write(join(phoenixDir, "mix.exs"), `def deps do\n  [{:phoenix, "~> 1.8"}]\nend\n`);

      const phoenixLoaded = await loadDiscoveryStrategies(phoenixDir);
      const phoenixDetected = await detectDiscoveryCandidates(phoenixDir, phoenixLoaded.strategies);
      const phoenix = phoenixDetected.candidates.find(
        (candidate) => candidate.strategyId === "phoenix-app",
      );

      expect(phoenix?.service.launchInstruction).toEqual({
        executable: "mix",
        arguments: ["phx.server"],
      });
    } finally {
      await rm(railsDir, { recursive: true, force: true });
      await rm(phoenixDir, { recursive: true, force: true });
    }
  });

  test("detects laravel package services and keeps queue with horizon", async () => {
    const dir = await mkdtemp(join(tmpdir(), "stasium-discovery-engine-"));

    try {
      await Bun.write(join(dir, "artisan"), "#!/usr/bin/env php\n");
      await Bun.write(
        join(dir, "composer.json"),
        JSON.stringify(
          {
            require: {
              "laravel/framework": "^11.0",
              "laravel/horizon": "^5.0",
              "laravel/reverb": "^1.0",
            },
            "require-dev": {
              "laravel/octane": "^2.0",
              "laravel/pulse": "^1.0",
            },
          },
          null,
          2,
        ),
      );

      const loaded = await loadDiscoveryStrategies(dir);
      const detected = await detectDiscoveryCandidates(dir, loaded.strategies);
      const byId = new Map(
        detected.candidates.map((candidate) => [candidate.strategyId, candidate]),
      );

      expect(byId.has("laravel-queue")).toBe(true);
      expect(byId.get("laravel-app")?.service.launchInstruction).toEqual({
        executable: "php",
        arguments: ["artisan", "serve", "--host=127.0.0.1", "--port=8000"],
      });
      expect(byId.get("laravel-queue")?.service.launchInstruction).toEqual({
        executable: "php",
        arguments: ["artisan", "queue:work", "--sleep=3", "--tries=3", "--timeout=90"],
      });
      expect(byId.has("laravel-horizon")).toBe(true);
      expect(byId.get("laravel-horizon")?.service.launchInstruction).toEqual({
        executable: "php",
        arguments: ["artisan", "horizon"],
      });
      expect(byId.get("laravel-reverb")?.service.launchInstruction).toEqual({
        executable: "php",
        arguments: ["artisan", "reverb:start", "--host=127.0.0.1", "--port=8080"],
      });
      expect(byId.get("laravel-octane")?.service.launchInstruction).toEqual({
        executable: "php",
        arguments: ["artisan", "octane:start", "--host=127.0.0.1", "--port=8000", "--watch"],
      });
      expect(byId.get("laravel-pulse-check")?.service.launchInstruction).toEqual({
        executable: "php",
        arguments: ["artisan", "pulse:check"],
      });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
