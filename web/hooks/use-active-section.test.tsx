import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { useActiveSection } from "./use-active-section";

type ObserverEntry = {
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
    this.callback(entries as IntersectionObserverEntry[], this as unknown as IntersectionObserver);
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
});
