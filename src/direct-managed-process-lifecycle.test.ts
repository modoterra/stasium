import { describe, expect, test } from "bun:test";
import {
  DirectManagedProcessLifecycle,
  DirectManagedProcessLifecycleCollection,
  type RestartRuleLifecycleView,
} from "./direct-managed-process-lifecycle";
import { normalizeProcessDefinition } from "./process-definition";

describe("Direct Managed Process lifecycle collection", () => {
  test("coordinates pending Restart Rule ticks without renderer setup", () => {
    const view: RestartRuleLifecycleView = {
      config: normalizeProcessDefinition({
        name: "api",
        launchInstruction: "bun run dev",
        restartRule: "on-failure",
      }),
      restartCount: 0,
      restartInMs: null,
    };
    const lifecycle = new DirectManagedProcessLifecycle({
      onChange: () => {},
      onRestart: async () => {},
      isActive: () => true,
      isRunning: () => false,
    });
    const collection = new DirectManagedProcessLifecycleCollection<string>();

    collection.set("api", lifecycle);
    lifecycle.noteExit(view, 1);

    expect(collection.hasPendingRestart()).toBe(true);
    expect(collection.tick(() => view, Date.now() + 1000)).toBe(true);
    expect(view.restartInMs).toBe(0);

    lifecycle.suppressRestart(view);
  });
});
