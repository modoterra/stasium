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
});
