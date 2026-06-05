import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import { useRotatingCommand } from "./use-rotating-command";

const setReducedMotion = (matches: boolean) => {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: (query: string) => ({
      matches,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }),
  });
};

describe("useRotatingCommand", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setReducedMotion(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("rotates through commands", () => {
    const { result } = renderHook(() => useRotatingCommand(["npm run dev", "make dev"]));

    expect(result.current).toBe("npm run dev");
    act(() => vi.advanceTimersByTime(2200));
    expect(result.current).toBe("make dev");
  });

  test("stays static for reduced motion users", () => {
    setReducedMotion(true);

    const { result } = renderHook(() => useRotatingCommand(["npm run dev", "make dev"]));

    act(() => vi.advanceTimersByTime(4400));
    expect(result.current).toBe("npm run dev");
  });
});
