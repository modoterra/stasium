import { describe, expect, test } from "bun:test";
import { normalizeProcessDefinition } from "../process-definition";
import { DiscoverySelection, finalizeSelectedCandidates, finalizeSelection } from "./selection";
import type { DetectedCandidate } from "./types";

const makeCandidate = (
  strategyId: string,
  name: string,
  defaultSelected = true,
  dependsOnIds: string[] = [],
): DetectedCandidate => ({
  strategyId,
  label: strategyId,
  priority: 100,
  defaultSelected,
  dependsOnIds,
  service: normalizeProcessDefinition({
    name,
    launchInstruction: ["bun", "run", "dev"],
  }),
});

describe("discovery selection", () => {
  test("moves cursor and toggles selections", () => {
    const selection = new DiscoverySelection([
      makeCandidate("app", "app", true),
      makeCandidate("worker", "worker", false),
    ]);

    expect(selection.getCursor()).toBe(0);
    expect(selection.getSelectedCount()).toBe(1);

    selection.moveCursor(1);
    expect(selection.getCursor()).toBe(1);
    selection.toggleCursor();
    expect(selection.getSelectedCount()).toBe(2);

    selection.moveCursor(1);
    expect(selection.getCursor()).toBe(0);
  });

  test("finalizes unique names and resolves dependency ids", () => {
    const finalized = finalizeSelectedCandidates([
      makeCandidate("app", "app"),
      makeCandidate("worker", "app", true, ["app"]),
    ]);

    expect(finalized.services[0]?.name).toBe("app");
    expect(finalized.services[1]?.name).toBe("app-2");
    expect(finalized.services[1]?.startupDependencies).toEqual(["app"]);
    expect(finalized.warnings).toContain("Candidate 'worker' was renamed from 'app' to 'app-2'.");
  });

  test("finalizeSelection uses current selected state", () => {
    const selection = new DiscoverySelection([
      makeCandidate("app", "app", true),
      makeCandidate("worker", "worker", true),
    ]);

    selection.selectNone();
    selection.toggleCursor();

    const finalized = finalizeSelection(selection);
    expect(finalized.services).toHaveLength(1);
    expect(finalized.services[0]?.name).toBe("app");
  });

  test("finalization avoids names already present in manifest", () => {
    const selection = new DiscoverySelection([
      makeCandidate("app", "app", true),
      makeCandidate("worker", "worker", true),
    ]);

    const finalized = finalizeSelection(selection, { usedNames: ["app"] });

    expect(finalized.services[0]?.name).toBe("app-2");
    expect(finalized.services[1]?.name).toBe("worker");
    expect(finalized.warnings).toContain("Candidate 'app' was renamed from 'app' to 'app-2'.");
  });

  test("allows empty finalized results", () => {
    const finalized = finalizeSelectedCandidates([]);

    expect(finalized.services).toEqual([]);
    expect(finalized.warnings).toEqual([]);
  });

  test("skips unaccepted candidate dependencies", () => {
    const finalized = finalizeSelectedCandidates([
      makeCandidate("worker", "worker", true, ["app"]),
    ]);

    expect(finalized.services[0]?.startupDependencies).toEqual([]);
    expect(finalized.warnings).toEqual([]);
  });

  test("rejects finalized process definitions with invalid dependencies", () => {
    expect(() =>
      finalizeSelectedCandidates([
        {
          ...makeCandidate("api", "api"),
          service: normalizeProcessDefinition({
            name: "api",
            launchInstruction: ["bun", "run", "dev"],
            startupDependencies: ["missing"],
          }),
        },
      ]),
    ).toThrow("depends on unknown service");
  });

  test("validates against existing process definitions when provided", () => {
    const finalized = finalizeSelectedCandidates(
      [
        {
          ...makeCandidate("api", "api"),
          service: normalizeProcessDefinition({
            name: "api",
            launchInstruction: ["bun", "run", "dev"],
            startupDependencies: ["db"],
          }),
        },
      ],
      {
        existingServices: [
          normalizeProcessDefinition({
            name: "db",
            launchInstruction: ["bun", "run", "db"],
          }),
        ],
        usedNames: ["db"],
      },
    );

    expect(finalized.services[0]?.startupDependencies).toEqual(["db"]);
  });
});
