import { resolve } from "node:path";
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
    const message = error instanceof Error ? error.message : String(error);
    throw new ManifestError(`Invalid TOML: ${message}`);
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

  return {
    services: normalized,
    path: resolve(manifestPath),
  };
};
