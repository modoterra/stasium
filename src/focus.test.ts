import { describe, expect, test } from "bun:test";
import { FocusManager } from "./focus";

describe("FocusManager", () => {
  test("includes discover shortcut on manifest panel", () => {
    const focus = new FocusManager(false);
    const shortcuts = focus.getShortcuts();

    expect(
      shortcuts.some((shortcut) => shortcut.label === "discover" && shortcut.key === "i"),
    ).toBe(true);
  });

  test("shows discovery mode shortcuts", () => {
    const focus = new FocusManager(false);
    focus.setMode("discovering");

    const shortcuts = focus.getShortcuts();
    expect(shortcuts.map((shortcut) => shortcut.label)).toEqual([
      "move",
      "toggle",
      "all",
      "none",
      "confirm",
      "cancel",
    ]);
  });

  test("toggles panel visibility and moves focus off hidden panel", () => {
    const focus = new FocusManager(true);
    focus.setActivePanel("docker");

    focus.togglePanel("docker");

    expect(focus.isPanelVisible("docker")).toBe(false);
    expect(focus.getActivePanel()).toBe("manifest");
  });

  test("does not hide the last visible panel", () => {
    const focus = new FocusManager(false);

    focus.togglePanel("logs");
    focus.togglePanel("manifest");

    expect(focus.getVisiblePanels()).toEqual(["manifest"]);
  });

  test("cycles only through visible panels", () => {
    const focus = new FocusManager(true);

    focus.togglePanel("docker");
    focus.cyclePanel();

    expect(focus.getActivePanel()).toBe("logs");
  });
});
