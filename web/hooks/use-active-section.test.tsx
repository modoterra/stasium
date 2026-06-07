import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useActiveSection } from "./use-active-section";

type ObserverEntry = {
  boundingClientRect?: Partial<DOMRectReadOnly>;
  isIntersecting: boolean;
  intersectionRatio: number;
  target: Element;
};

class MockIntersectionObserver {
  static instances: MockIntersectionObserver[] = [];

  observe = vi.fn();
  disconnect = vi.fn();

  constructor(private readonly callback: IntersectionObserverCallback) {
    MockIntersectionObserver.instances.push(this);
  }

  trigger(entries: ObserverEntry[]) {
    this.callback(
      entries.map((entry) => ({
        boundingClientRect: {
          bottom: 0,
          height: 0,
          left: 0,
          right: 0,
          top: 0,
          width: 0,
          x: 0,
          y: 0,
          toJSON: () => ({}),
          ...entry.boundingClientRect,
        },
        isIntersecting: entry.isIntersecting,
        intersectionRatio: entry.intersectionRatio,
        target: entry.target,
      })) as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
}

describe("useActiveSection", () => {
  beforeEach(() => {
    MockIntersectionObserver.instances = [];
    vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
    document.body.innerHTML = `
      <section id="install"></section>
      <section id="quickstart"></section>
    `;
  });

  test("observes sections and updates active section from visible entries", () => {
    const { result } = renderHook(() => useActiveSection(["install", "quickstart"]));

    expect(result.current).toBe("install");
    expect(MockIntersectionObserver.instances[0]?.observe).toHaveBeenCalledTimes(2);

    act(() => {
      MockIntersectionObserver.instances[0]?.trigger([
        {
          isIntersecting: true,
          intersectionRatio: 0.75,
          target: document.getElementById("quickstart")!,
        },
      ]);
    });

    expect(result.current).toBe("quickstart");
  });

  test("keeps active section stable when observer entries overlap", () => {
    vi.spyOn(window, "innerHeight", "get").mockReturnValue(1000);
    const { result } = renderHook(() => useActiveSection(["install", "quickstart"]));

    act(() => {
      MockIntersectionObserver.instances[0]?.trigger([
        {
          boundingClientRect: { top: 40 },
          isIntersecting: true,
          intersectionRatio: 0.8,
          target: document.getElementById("install")!,
        },
        {
          boundingClientRect: { top: 330 },
          isIntersecting: true,
          intersectionRatio: 0.4,
          target: document.getElementById("quickstart")!,
        },
      ]);
    });

    expect(result.current).toBe("quickstart");

    act(() => {
      MockIntersectionObserver.instances[0]?.trigger([
        {
          boundingClientRect: { top: 20 },
          isIntersecting: true,
          intersectionRatio: 1,
          target: document.getElementById("install")!,
        },
      ]);
    });

    expect(result.current).toBe("quickstart");
  });
});
