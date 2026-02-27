import { describe, expect, test } from "bun:test";
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
  service: {
    name,
    command: ["bun", "run", "dev"],
  },
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
    expect(finalized.services[1]?.depends_on).toEqual(["app"]);
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
});
