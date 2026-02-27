import { describe, expect, test } from "bun:test";
import { DiscoveryStrategyError, parseDiscoveryStrategiesToml } from "./strategy-loader";

describe("discovery strategy loader", () => {
  test("parses a valid catalog", () => {
    const strategies = parseDiscoveryStrategiesToml(
      `
version = 1

[[strategy]]
id = "node-dev"
label = "Node dev"

[strategy.when]
all_files = ["package.json"]

[[strategy.capture]]
name = "script"
kind = "json_first_existing"
file = "package.json"
paths = ["scripts.dev"]

[strategy.service]
name = "frontend"
command = ["bun", "run", "\${script}"]
      `,
      "test-catalog",
    );

    expect(strategies).toHaveLength(1);
    expect(strategies[0]?.id).toBe("node-dev");
    expect(strategies[0]?.capture[0]?.kind).toBe("json_first_existing");
  });

  test("rejects unknown strategy keys", () => {
    expect(() =>
      parseDiscoveryStrategiesToml(
        `
version = 1

[[strategy]]
id = "node-dev"
label = "Node dev"
unknown = true

[strategy.service]
name = "frontend"
command = ["bun", "run", "dev"]
        `,
        "test-catalog",
      ),
    ).toThrow(DiscoveryStrategyError);
  });

  test("rejects missing capture references", () => {
    expect(() =>
      parseDiscoveryStrategiesToml(
        `
version = 1

[[strategy]]
id = "node-dev"
label = "Node dev"

[strategy.service]
name = "frontend"
command = ["bun", "run", "\${script}"]
        `,
        "test-catalog",
      ),
    ).toThrow(DiscoveryStrategyError);
  });
});
