import { readFileSync } from "node:fs";
import { join } from "node:path";

import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { detectedStacks, packageManagers } from "../data/detects";
import { DetectsSection } from "./detects-section";

const strategiesToml = readFileSync(join(process.cwd(), "src/discovery/strategies.toml"), "utf8");
const capturesTs = readFileSync(join(process.cwd(), "src/discovery/captures.ts"), "utf8");
const dockerTs = readFileSync(join(process.cwd(), "src/docker.ts"), "utf8");

describe("DetectsSection", () => {
  test("uses detects and shows language without broad support claims", () => {
    render(<DetectsSection />);

    expect(screen.getByText(/Detects common setups/i)).toBeInTheDocument();
    expect(screen.getByText(/Shows what it finds/i)).toBeInTheDocument();
    expect(screen.getByText(/accept, edit, or skip/i)).toBeInTheDocument();
    expect(screen.queryByText(/supports/i)).not.toBeInTheDocument();
  });

  test("renders current discovery coverage", () => {
    render(<DetectsSection />);

    for (const stack of detectedStacks) {
      expect(screen.getByText(stack.title)).toBeInTheDocument();
    }

    for (const term of [
      /app/i,
      /queue/i,
      /scheduler/i,
      /Reverb/i,
      /Octane/i,
      /Horizon/i,
      /Pulse/i,
      /Rails/i,
      /Django/i,
      /FastAPI/i,
      /dev, start, watch, or serve/i,
      /worker, queue, jobs, or background/i,
      /air/i,
      /go run/i,
      /make dev/i,
      /External Runtime Visibility/i,
      /Direct Managed Processes/i,
      /Stasium Process Ownership/i,
      /add missing commands to the Manifest/i,
    ]) {
      expect(screen.getAllByText(term).length).toBeGreaterThan(0);
    }
  });

  test("content maps to current Discovery and External Runtime Visibility code", () => {
    for (const strategyId of [
      "laravel-app",
      "laravel-queue",
      "laravel-scheduler",
      "laravel-reverb",
      "laravel-octane",
      "laravel-horizon",
      "laravel-pulse-check",
      "rails-app",
      "django-app",
      "fastapi-main",
      "fastapi-app-main",
      "node-dev",
      "node-worker",
      "go-air",
      "go-run",
      "make-dev",
    ]) {
      expect(strategiesToml).toContain(`id = "${strategyId}"`);
    }

    for (const manager of packageManagers) {
      expect(capturesTs).toContain(`"${manager}"`);
    }

    expect(dockerTs).toContain("createDockerComposeExternalRuntimeAdapter");
    expect(dockerTs).toContain("docker-compose");
  });
});
