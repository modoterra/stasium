import { resolve } from "node:path";
import { ServiceGraphError, validateServiceGraph } from "./service-graph";
import { getErrorMessage } from "./shared";
import type { Manifest, ServiceConfig } from "./types";

type RawManifest = {
  service?: ServiceConfig[];
};

const DEFAULT_MANIFEST = "stasium.toml";

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestError";
  }
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

const normalizeEnv = (env: unknown): Record<string, string> | undefined => {
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

const normalizeService = (raw: ServiceConfig, index: number): ServiceConfig => {
  if (!raw || typeof raw !== "object") {
    throw new ManifestError(`service[${index}] must be a table`);
  }

  const unknownKeys = Object.keys(raw).filter((key) => !validServiceKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new ManifestError(`service[${index}] has unknown keys: ${unknownKeys.join(", ")}`);
  }

  if (!raw.name || typeof raw.name !== "string") {
    throw new ManifestError(`service[${index}].name must be a string`);
  }

  if (!raw.command || (typeof raw.command !== "string" && !Array.isArray(raw.command))) {
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

  const env = normalizeEnv(raw.env);

  return {
    name: raw.name,
    command: raw.command,
    working_dir: raw.working_dir,
    env,
    restart_policy: raw.restart_policy,
    depends_on: raw.depends_on,
  };
};

export const loadManifest = async (path?: string): Promise<Manifest> => {
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

  const normalized = services.map((service, index) => normalizeService(service, index));
  const names = new Set<string>();
  for (const service of normalized) {
    if (names.has(service.name)) {
      throw new ManifestError(`Duplicate service name: ${service.name}`);
    }
    names.add(service.name);
  }

  try {
    validateServiceGraph(normalized);
  } catch (error) {
    if (error instanceof ServiceGraphError) {
      throw new ManifestError(error.message);
    }
    throw error;
  }

  return {
    services: normalized,
    path: resolve(manifestPath),
  };
};

const escapeToml = (value: string): string => value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');

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
  if (service.depends_on && service.depends_on.length > 0) {
    const deps = service.depends_on.map((d) => `"${escapeToml(d)}"`).join(", ");
    lines.push(`depends_on = [${deps}]`);
  }
  if (service.env && Object.keys(service.env).length > 0) {
    lines.push("[service.env]");
    for (const [key, value] of Object.entries(service.env)) {
      lines.push(`"${escapeToml(key)}" = "${escapeToml(value)}"`);
    }
  }
  return lines.join("\n");
};

export const renderManifest = (services: ServiceConfig[]): string => {
  const lines: string[] = [];
  lines.push("# stasium.toml");
  lines.push("");

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

export const parseServiceBlock = (toml: string): ServiceConfig => {
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

  return normalizeService(raw, 0);
};

export const saveManifest = async (path: string, services: ServiceConfig[]): Promise<void> => {
  const contents = renderManifest(services);
  await Bun.write(path, contents);
};
