import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, test } from "vitest";

import { useThemePreference } from "./use-theme-preference";

describe("useThemePreference", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  test("initializes from saved preference", async () => {
    window.localStorage.setItem("stasium-theme", "dark");

    const { result } = renderHook(() => useThemePreference());

    expect(result.current.theme).toBe("dark");
    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
  });

  test("persists toggled preference", async () => {
    const { result } = renderHook(() => useThemePreference());

    act(() => result.current.toggleTheme());

    await waitFor(() => expect(window.localStorage.getItem("stasium-theme")).toBe("dark"));
    expect(document.documentElement).toHaveClass("dark");
  });
});
