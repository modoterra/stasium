import { dirname, resolve } from "node:path";
import {
  ProcessDefinitionError,
  normalizeProcessDefinition,
  normalizeProcessDefinitions,
  type ProcessDefinitionInput,
} from "./process-definition";
import { ServiceGraphError, validateServiceGraph } from "./service-graph";
import { getErrorMessage } from "./shared";
import type {
  AppConfig,
  AppDockerConfig,
  CommandSpec,
  Manifest,
  ProcessDefinition,
  ServiceConfig,
} from "./types";

type RawManifest = {
  app?: {
    docker?: {
      enabled?: boolean;
    };
  };
  service?: RawServiceConfig[];
};

type RawServiceConfig = {
  name?: unknown;
  command?: unknown;
  working_dir?: unknown;
  env?: unknown;
  restart_policy?: unknown;
  depends_on?: unknown;
};

const DEFAULT_MANIFEST = "stasium.toml";

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
}

export interface LoadManifestOptions {
  externalManagedProcessNames?: Iterable<string>;
}

const validServiceKeys = new Set([
  "name",
  "command",
  "working_dir",
  "env",
  "restart_policy",
  "depends_on",
]);

const validRestartPolicies = new Set(["never", "on-failure", "always"]);
const validAppKeys = new Set(["docker"]);
const validDockerKeys = new Set(["enabled"]);

const coerceEnv = (env: unknown): Record<string, string> | undefined => {
  if (env === undefined) return undefined;
  if (env === null || typeof env !== "object" || Array.isArray(env)) {
    throw new ManifestError("service.env must be a table of string values");
  }
  const entries = Object.entries(env as Record<string, unknown>);
  const normalized: Record<string, string> = {};
  for (const [key, value] of entries) {
    if (value === undefined) continue;
    if (value === null) {
      normalized[key] = "";
      continue;
    }
    if (typeof value === "string") {
      normalized[key] = value;
      continue;
    }
    if (typeof value === "number" || typeof value === "boolean") {
      normalized[key] = String(value);
      continue;
    }
    throw new ManifestError(`service.env.${key} must be string | number | boolean`);
  }
  return normalized;
};

const normalizeDockerConfig = (docker: unknown): AppDockerConfig | undefined => {
  if (docker === undefined) return undefined;
  if (docker === null || typeof docker !== "object" || Array.isArray(docker)) {
    throw new ManifestError("app.docker must be a table");
  }

  const unknownKeys = Object.keys(docker).filter((key) => !validDockerKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new ManifestError(`app.docker has unknown keys: ${unknownKeys.join(", ")}`);
  }

  const enabled = (docker as { enabled?: unknown }).enabled;
  if (enabled !== undefined && typeof enabled !== "boolean") {
    throw new ManifestError("app.docker.enabled must be a boolean");
  }

  if (enabled === undefined) return undefined;
  return { enabled };
};

const normalizeApp = (app: unknown): AppConfig | undefined => {
  if (app === undefined) return undefined;
  if (app === null || typeof app !== "object" || Array.isArray(app)) {
    throw new ManifestError("app must be a table");
  }

  const unknownKeys = Object.keys(app).filter((key) => !validAppKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new ManifestError(`app has unknown keys: ${unknownKeys.join(", ")}`);
  }

  const docker = normalizeDockerConfig((app as { docker?: unknown }).docker);
  if (!docker) return undefined;

  return { docker };
};

const toProcessDefinitionInput = (raw: RawServiceConfig, index: number): ProcessDefinitionInput => {
  if (!raw || typeof raw !== "object") {
    throw new ManifestError(`service[${index}] must be a table`);
  }

  const unknownKeys = Object.keys(raw).filter((key) => !validServiceKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new ManifestError(`service[${index}] has unknown keys: ${unknownKeys.join(", ")}`);
  }

  if (typeof raw.name !== "string") {
    throw new ManifestError(`service[${index}].name must be a string`);
  }

  if (typeof raw.command !== "string" && !Array.isArray(raw.command)) {
    throw new ManifestError(`service[${index}].command must be string or string[]`);
  }

  if (Array.isArray(raw.command) && raw.command.some((part) => typeof part !== "string")) {
    throw new ManifestError(`service[${index}].command array must contain strings`);
  }

  if (raw.working_dir !== undefined && typeof raw.working_dir !== "string") {
    throw new ManifestError(`service[${index}].working_dir must be a string`);
  }

  if (raw.depends_on !== undefined) {
    if (!Array.isArray(raw.depends_on) || raw.depends_on.some((item) => typeof item !== "string")) {
      throw new ManifestError(`service[${index}].depends_on must be string[]`);
    }
  }

  if (raw.restart_policy !== undefined) {
    if (typeof raw.restart_policy !== "string" || !validRestartPolicies.has(raw.restart_policy)) {
      throw new ManifestError(
        `service[${index}].restart_policy must be one of never | on-failure | always`,
      );
    }
  }

  const env = coerceEnv(raw.env);

  return {
    name: raw.name,
    launchInstruction: raw.command as CommandSpec,
    workingDir: raw.working_dir,
    environment: env,
    restartRule: raw.restart_policy as ProcessDefinitionInput["restartRule"],
    startupDependencies: raw.depends_on,
  };
};

const toManifestError = (error: unknown): never => {
  if (error instanceof ProcessDefinitionError || error instanceof ServiceGraphError) {
    throw new ManifestError(error.message);
  }
  throw error;
};

export const loadManifest = async (
  path?: string,
  options: LoadManifestOptions = {},
): Promise<Manifest> => {
  const manifestPath = path ?? DEFAULT_MANIFEST;
  const file = Bun.file(manifestPath);
  if (!(await file.exists())) {
    throw new ManifestError(`Manifest not found: ${manifestPath}`);
  }

  const contents = await file.text();
  let parsed: RawManifest;
  try {
    parsed = Bun.TOML.parse(contents) as RawManifest;
  } catch (error) {
    throw new ManifestError(`Invalid TOML: ${getErrorMessage(error)}`);
  }

  const services = parsed.service ?? [];
  if (!Array.isArray(services)) {
    throw new ManifestError("service must be an array of tables");
  }

  const app = normalizeApp(parsed.app);
  const inputs = services.map((service, index) => toProcessDefinitionInput(service, index));
  const normalized = ((): ProcessDefinition[] => {
    try {
      return normalizeProcessDefinitions(inputs, { baseDir: dirname(resolve(manifestPath)) });
    } catch (error) {
      toManifestError(error);
    }
    throw new ManifestError("Invalid Process Definition");
  })();

  try {
    validateServiceGraph(normalized, {
      startupDependencyValidation: options.externalManagedProcessNames
        ? {
            mode: "cross-runtime",
            externalManagedProcessNames: options.externalManagedProcessNames,
          }
        : { mode: "direct-only" },
    });
  } catch (error) {
    toManifestError(error);
  }

  return {
    app,
    services: normalized,
    path: resolve(manifestPath),
  };
};

const escapeToml = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

const renderAppToml = (app?: AppConfig): string[] => {
  if (app?.docker?.enabled === undefined) return [];

  return ["[app.docker]", `enabled = ${app.docker.enabled ? "true" : "false"}`];
};

const renderServiceToml = (service: ServiceConfig): string => {
  const lines: string[] = [];
  lines.push("[[service]]");
  lines.push(`name = "${escapeToml(service.name)}"`);
  const command = Array.isArray(service.command)
    ? `[${service.command.map((part) => `"${escapeToml(part)}"`).join(", ")}]`
    : `"${escapeToml(service.command)}"`;
  lines.push(`command = ${command}`);
  if (service.working_dir) {
    lines.push(`working_dir = "${escapeToml(service.working_dir)}"`);
  }
  if (service.restart_policy) {
    lines.push(`restart_policy = "${service.restart_policy}"`);
  }
  if (service.depends_on.length > 0) {
    const deps = service.depends_on.map((d) => `"${escapeToml(d)}"`).join(", ");
    lines.push(`depends_on = [${deps}]`);
  }
  if (Object.keys(service.env).length > 0) {
    lines.push("[service.env]");
    for (const [key, value] of Object.entries(service.env)) {
      lines.push(`"${escapeToml(key)}" = "${escapeToml(value)}"`);
    }
  }
  return lines.join("\n");
};

export const renderManifest = (services: ServiceConfig[], app?: AppConfig): string => {
  const lines: string[] = [];
  lines.push("# stasium.toml");
  lines.push("");

  const appLines = renderAppToml(app);
  if (appLines.length > 0) {
    lines.push(...appLines);
    lines.push("");
  }

  if (services.length === 0) {
    lines.push("# No services configured. Add [[service]] blocks below.");
    lines.push("#");
    lines.push("# [[service]]");
    lines.push('# name = "app"');
    lines.push('# command = ["php", "artisan", "serve"]');
    lines.push('# working_dir = "."');
    lines.push("");
    return lines.join("\n");
  }

  for (const service of services) {
    lines.push(renderServiceToml(service));
    lines.push("");
  }

  return lines.join("\n");
};

export const renderServiceBlock = (service: ServiceConfig): string => {
  return renderServiceToml(service);
};

export const parseServiceBlock = (toml: string, baseDir?: string): ProcessDefinition => {
  let parsed: RawManifest;
  try {
    parsed = Bun.TOML.parse(toml) as RawManifest;
  } catch (error) {
    throw new ManifestError(`Invalid TOML: ${getErrorMessage(error)}`);
  }

  const services = parsed.service ?? [];
  if (!Array.isArray(services) || services.length !== 1) {
    throw new ManifestError("Expected exactly one [[service]] block");
  }

  const raw = services[0];
  if (!raw) {
    throw new ManifestError("Expected exactly one [[service]] block");
  }

  try {
    return normalizeProcessDefinition(toProcessDefinitionInput(raw, 0), { baseDir });
  } catch (error) {
    toManifestError(error);
  }
  throw new ManifestError("Invalid service block");
};

export const saveManifest = async (
  path: string,
  services: ServiceConfig[],
  app?: AppConfig,
): Promise<void> => {
  const contents = renderManifest(services, app);
  await Bun.write(path, contents);
};
