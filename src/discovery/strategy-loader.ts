import { resolve } from "node:path";
import { fileExists, getErrorMessage } from "../shared";
import builtinStrategiesToml from "./strategies.toml" with { type: "text" };
import type {
  DiscoveryStrategy,
  JsonFirstExistingCapture,
  LoadedStrategies,
  RegexProbe,
  StrategyCapture,
  StrategyServiceTemplate,
  StrategyWhen,
  TomlFirstExistingCapture,
  ValuePathProbe,
} from "./types";

const DISCOVERY_OVERRIDE_PATH = ".stasium/discovery.toml";
const VALID_RESTART_POLICIES = new Set(["never", "on-failure", "always"]);
const PLACEHOLDER_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

type UnknownRecord = Record<string, unknown>;

export class DiscoveryStrategyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DiscoveryStrategyError";
  }
}

const isRecord = (value: unknown): value is UnknownRecord => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const readRecord = (value: unknown, context: string): UnknownRecord => {
  if (!isRecord(value)) {
    throw new DiscoveryStrategyError(`${context} must be a table`);
  }
  return value;
};

const assertKnownKeys = (value: UnknownRecord, allowed: Set<string>, context: string): void => {
  const unknownKeys = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknownKeys.length > 0) {
    throw new DiscoveryStrategyError(`${context} has unknown keys: ${unknownKeys.join(", ")}`);
  }
};

const readString = (value: unknown, context: string): string => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new DiscoveryStrategyError(`${context} must be a non-empty string`);
  }
  return value;
};

const readBoolean = (value: unknown, context: string): boolean => {
  if (typeof value !== "boolean") {
    throw new DiscoveryStrategyError(`${context} must be a boolean`);
  }
  return value;
};

const readNumber = (value: unknown, context: string): number => {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new DiscoveryStrategyError(`${context} must be a number`);
  }
  return value;
};

const readStringArray = (value: unknown, context: string): string[] => {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.some((item) => typeof item !== "string")
  ) {
    throw new DiscoveryStrategyError(`${context} must be a non-empty string[]`);
  }
  return value;
};

const readOptionalStringArray = (value: unknown, context: string): string[] | undefined => {
  if (value === undefined) return undefined;
  return readStringArray(value, context);
};

const readCommand = (value: unknown, context: string): string | string[] => {
  if (typeof value === "string") {
    if (value.trim().length === 0) {
      throw new DiscoveryStrategyError(`${context} must be a non-empty string`);
    }
    return value;
  }

  if (Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === "string")) {
    return value;
  }

  throw new DiscoveryStrategyError(`${context} must be string or non-empty string[]`);
};

const readStringRecord = (value: unknown, context: string): Record<string, string> | undefined => {
  if (value === undefined) return undefined;
  const record = readRecord(value, context);
  const normalized: Record<string, string> = {};
  for (const [key, raw] of Object.entries(record)) {
    if (typeof raw === "string") {
      normalized[key] = raw;
      continue;
    }
    if (typeof raw === "number" || typeof raw === "boolean") {
      normalized[key] = String(raw);
      continue;
    }
    throw new DiscoveryStrategyError(`${context}.${key} must be string | number | boolean`);
  }
  return normalized;
};

const parsePathProbe = (value: unknown, context: string): ValuePathProbe => {
  const probe = readRecord(value, context);
  assertKnownKeys(probe, new Set(["file", "path", "equals"]), context);

  const file = readString(probe.file, `${context}.file`);
  const path = readString(probe.path, `${context}.path`);

  const equalsValue = probe.equals;
  if (
    equalsValue !== undefined &&
    typeof equalsValue !== "string" &&
    typeof equalsValue !== "number" &&
    typeof equalsValue !== "boolean"
  ) {
    throw new DiscoveryStrategyError(`${context}.equals must be string | number | boolean`);
  }

  return {
    file,
    path,
    equals: equalsValue,
  };
};

const parseRegexProbe = (value: unknown, context: string): RegexProbe => {
  const probe = readRecord(value, context);
  assertKnownKeys(probe, new Set(["file", "pattern", "flags"]), context);

  const file = readString(probe.file, `${context}.file`);
  const pattern = readString(probe.pattern, `${context}.pattern`);
  const flags = probe.flags === undefined ? undefined : readString(probe.flags, `${context}.flags`);

  try {
    // Validate regex shape early.
    void new RegExp(pattern, flags);
  } catch {
    throw new DiscoveryStrategyError(`${context} has an invalid regex`);
  }

  return { file, pattern, flags };
};

const parsePathProbeArray = (value: unknown, context: string): ValuePathProbe[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DiscoveryStrategyError(`${context} must be a non-empty array of tables`);
  }
  return value.map((entry, index) => parsePathProbe(entry, `${context}[${index}]`));
};

const parseRegexProbeArray = (value: unknown, context: string): RegexProbe[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new DiscoveryStrategyError(`${context} must be a non-empty array of tables`);
  }
  return value.map((entry, index) => parseRegexProbe(entry, `${context}[${index}]`));
};

const emptyWhen = (): StrategyWhen => ({
  all_files: [],
  any_files: [],
  all_json_paths: [],
  any_json_paths: [],
  all_toml_paths: [],
  any_toml_paths: [],
  all_regex: [],
  any_regex: [],
});

const parseWhen = (value: unknown, context: string): StrategyWhen => {
  if (value === undefined) return emptyWhen();
  const when = readRecord(value, context);
  assertKnownKeys(
    when,
    new Set([
      "all_files",
      "any_files",
      "all_json_paths",
      "any_json_paths",
      "all_toml_paths",
      "any_toml_paths",
      "all_regex",
      "any_regex",
    ]),
    context,
  );

  return {
    all_files:
      when.all_files === undefined ? [] : readStringArray(when.all_files, `${context}.all_files`),
    any_files:
      when.any_files === undefined ? [] : readStringArray(when.any_files, `${context}.any_files`),
    all_json_paths:
      when.all_json_paths === undefined
        ? []
        : parsePathProbeArray(when.all_json_paths, `${context}.all_json_paths`),
    any_json_paths:
      when.any_json_paths === undefined
        ? []
        : parsePathProbeArray(when.any_json_paths, `${context}.any_json_paths`),
    all_toml_paths:
      when.all_toml_paths === undefined
        ? []
        : parsePathProbeArray(when.all_toml_paths, `${context}.all_toml_paths`),
    any_toml_paths:
      when.any_toml_paths === undefined
        ? []
        : parsePathProbeArray(when.any_toml_paths, `${context}.any_toml_paths`),
    all_regex:
      when.all_regex === undefined
        ? []
        : parseRegexProbeArray(when.all_regex, `${context}.all_regex`),
    any_regex:
      when.any_regex === undefined
        ? []
        : parseRegexProbeArray(when.any_regex, `${context}.any_regex`),
  };
};

const parseCapture = (value: unknown, context: string): StrategyCapture => {
  const capture = readRecord(value, context);
  assertKnownKeys(capture, new Set(["name", "kind", "file", "paths"]), context);

  const name = readString(capture.name, `${context}.name`);
  const kind = readString(capture.kind, `${context}.kind`);

  if (kind === "lockfile_package_manager") {
    return { name, kind };
  }

  if (kind === "json_first_existing") {
    const file = readString(capture.file, `${context}.file`);
    const paths = readStringArray(capture.paths, `${context}.paths`);
    const parsed: JsonFirstExistingCapture = {
      name,
      kind,
      file,
      paths,
    };
    return parsed;
  }

  if (kind === "toml_first_existing") {
    const file = readString(capture.file, `${context}.file`);
    const paths = readStringArray(capture.paths, `${context}.paths`);
    const parsed: TomlFirstExistingCapture = {
      name,
      kind,
      file,
      paths,
    };
    return parsed;
  }

  throw new DiscoveryStrategyError(`${context}.kind is not supported: ${kind}`);
};

const parseCaptureArray = (value: unknown, context: string): StrategyCapture[] => {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new DiscoveryStrategyError(`${context} must be an array of tables`);
  }

  const captures = value.map((entry, index) => parseCapture(entry, `${context}[${index}]`));
  const names = new Set<string>();
  for (const capture of captures) {
    if (names.has(capture.name)) {
      throw new DiscoveryStrategyError(`${context} has duplicate capture name: ${capture.name}`);
    }
    names.add(capture.name);
  }
  return captures;
};

const parseService = (value: unknown, context: string): StrategyServiceTemplate => {
  const service = readRecord(value, context);
  assertKnownKeys(
    service,
    new Set([
      "name",
      "command",
      "working_dir",
      "env",
      "restart_policy",
      "depends_on",
      "depends_on_ids",
    ]),
    context,
  );

  const name = readString(service.name, `${context}.name`);
  const command = readCommand(service.command, `${context}.command`);
  const working_dir =
    service.working_dir === undefined
      ? undefined
      : readString(service.working_dir, `${context}.working_dir`);

  const env = readStringRecord(service.env, `${context}.env`);

  let restart_policy: "never" | "on-failure" | "always" | undefined;
  if (service.restart_policy !== undefined) {
    const policy = readString(service.restart_policy, `${context}.restart_policy`);
    if (!VALID_RESTART_POLICIES.has(policy)) {
      throw new DiscoveryStrategyError(
        `${context}.restart_policy must be one of never | on-failure | always`,
      );
    }
    restart_policy = policy as "never" | "on-failure" | "always";
  }

  const depends_on = readOptionalStringArray(service.depends_on, `${context}.depends_on`);
  const depends_on_ids = readOptionalStringArray(
    service.depends_on_ids,
    `${context}.depends_on_ids`,
  );

  return {
    name,
    command,
    working_dir,
    env,
    restart_policy,
    depends_on,
    depends_on_ids,
  };
};

const collectPlaceholders = (value: string): string[] => {
  const names: string[] = [];
  for (const match of value.matchAll(PLACEHOLDER_PATTERN)) {
    const name = match[1];
    if (name) names.push(name);
  }
  return names;
};

const validateCaptureReferences = (strategy: DiscoveryStrategy, context: string): void => {
  const knownCaptures = new Set(strategy.capture.map((entry) => entry.name));
  const referenced = new Set<string>();

  for (const placeholder of collectPlaceholders(strategy.service.name)) {
    referenced.add(placeholder);
  }

  if (Array.isArray(strategy.service.command)) {
    for (const part of strategy.service.command) {
      for (const placeholder of collectPlaceholders(part)) {
        referenced.add(placeholder);
      }
    }
  } else {
    for (const placeholder of collectPlaceholders(strategy.service.command)) {
      referenced.add(placeholder);
    }
  }

  if (strategy.service.working_dir) {
    for (const placeholder of collectPlaceholders(strategy.service.working_dir)) {
      referenced.add(placeholder);
    }
  }

  if (strategy.service.env) {
    for (const value of Object.values(strategy.service.env)) {
      for (const placeholder of collectPlaceholders(value)) {
        referenced.add(placeholder);
      }
    }
  }

  const missing = [...referenced].filter((name) => !knownCaptures.has(name));
  if (missing.length > 0) {
    throw new DiscoveryStrategyError(
      `${context} references unknown capture(s): ${missing.join(", ")}`,
    );
  }
};

const parseStrategy = (value: unknown, index: number, source: string): DiscoveryStrategy => {
  const context = `${source}.strategy[${index}]`;
  const strategy = readRecord(value, context);
  assertKnownKeys(
    strategy,
    new Set(["id", "label", "priority", "default_selected", "when", "capture", "service"]),
    context,
  );

  const id = readString(strategy.id, `${context}.id`);
  const label = readString(strategy.label, `${context}.label`);
  const priority =
    strategy.priority === undefined ? 100 : readNumber(strategy.priority, `${context}.priority`);
  const default_selected =
    strategy.default_selected === undefined
      ? true
      : readBoolean(strategy.default_selected, `${context}.default_selected`);
  const when = parseWhen(strategy.when, `${context}.when`);
  const capture = parseCaptureArray(strategy.capture, `${context}.capture`);

  if (strategy.service === undefined) {
    throw new DiscoveryStrategyError(`${context}.service must be provided`);
  }
  const service = parseService(strategy.service, `${context}.service`);

  const parsed: DiscoveryStrategy = {
    id,
    label,
    priority,
    default_selected,
    when,
    capture,
    service,
  };

  validateCaptureReferences(parsed, context);
  return parsed;
};

const parseCatalog = (tomlText: string, source: string): DiscoveryStrategy[] => {
  let parsed: unknown;
  try {
    parsed = Bun.TOML.parse(tomlText);
  } catch (error) {
    throw new DiscoveryStrategyError(`${source} is invalid TOML: ${getErrorMessage(error)}`);
  }

  const root = readRecord(parsed, source);
  assertKnownKeys(root, new Set(["version", "strategy"]), source);

  const version = readNumber(root.version, `${source}.version`);
  if (version !== 1) {
    throw new DiscoveryStrategyError(`${source}.version must be 1`);
  }

  const rawStrategies = root.strategy;
  if (rawStrategies === undefined) return [];
  if (!Array.isArray(rawStrategies)) {
    throw new DiscoveryStrategyError(`${source}.strategy must be an array of tables`);
  }

  const strategies = rawStrategies.map((entry, index) => parseStrategy(entry, index, source));
  const ids = new Set<string>();
  for (const strategy of strategies) {
    if (ids.has(strategy.id)) {
      throw new DiscoveryStrategyError(`${source} has duplicate strategy id: ${strategy.id}`);
    }
    ids.add(strategy.id);
  }

  return strategies;
};

const sortStrategies = (strategies: DiscoveryStrategy[]): DiscoveryStrategy[] => {
  return [...strategies].sort((left, right) => {
    if (left.priority !== right.priority) {
      return right.priority - left.priority;
    }
    if (left.label !== right.label) {
      return left.label.localeCompare(right.label);
    }
    return left.id.localeCompare(right.id);
  });
};

export const parseDiscoveryStrategiesToml = (
  tomlText: string,
  source = "strategies",
): DiscoveryStrategy[] => {
  return parseCatalog(tomlText, source);
};

export const loadDiscoveryStrategies = async (cwd: string): Promise<LoadedStrategies> => {
  const warnings: string[] = [];
  const builtIn = parseCatalog(builtinStrategiesToml, "built-in discovery strategies");

  const overridePath = resolve(cwd, DISCOVERY_OVERRIDE_PATH);
  if (!(await fileExists(overridePath))) {
    return {
      strategies: sortStrategies(builtIn),
      warnings,
    };
  }

  let overrideToml = "";
  try {
    overrideToml = await Bun.file(overridePath).text();
  } catch (error) {
    warnings.push(`Failed to read ${DISCOVERY_OVERRIDE_PATH}: ${getErrorMessage(error)}`);
    return {
      strategies: sortStrategies(builtIn),
      warnings,
    };
  }

  let overrideStrategies: DiscoveryStrategy[];
  try {
    overrideStrategies = parseCatalog(overrideToml, DISCOVERY_OVERRIDE_PATH);
  } catch (error) {
    warnings.push(`Ignoring ${DISCOVERY_OVERRIDE_PATH}: ${getErrorMessage(error)}`);
    return {
      strategies: sortStrategies(builtIn),
      warnings,
    };
  }

  const merged = new Map<string, DiscoveryStrategy>();
  for (const strategy of builtIn) {
    merged.set(strategy.id, strategy);
  }
  for (const strategy of overrideStrategies) {
    merged.set(strategy.id, strategy);
  }

  return {
    strategies: sortStrategies([...merged.values()]),
    warnings,
  };
};
