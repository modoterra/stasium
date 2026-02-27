import type { DiscoveryProbeContext } from "./probes";
import type { DiscoveryStrategy, StrategyCapture } from "./types";

export interface CaptureResolution {
  values: Record<string, string>;
  error: string | null;
}

const normalizeCapturedValue = (value: unknown): string | null => {
  if (typeof value === "string") {
    const normalized = value.trim();
    return normalized.length === 0 ? null : normalized;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
};

const resolvePackageManager = async (ctx: DiscoveryProbeContext): Promise<string> => {
  if (await ctx.fileExists("bun.lockb")) return "bun";
  if (await ctx.fileExists("bun.lock")) return "bun";
  if (await ctx.fileExists("pnpm-lock.yaml")) return "pnpm";
  if (await ctx.fileExists("yarn.lock")) return "yarn";
  if (await ctx.fileExists("package-lock.json")) return "npm";
  return "bun";
};

const resolveJsonFirstExisting = async (
  capture: Extract<StrategyCapture, { kind: "json_first_existing" }>,
  ctx: DiscoveryProbeContext,
): Promise<string | null> => {
  for (const path of capture.paths) {
    const raw = await ctx.getJsonPathValue(capture.file, path);
    const value = normalizeCapturedValue(raw);
    if (value !== null) return value;
  }
  return null;
};

const resolveTomlFirstExisting = async (
  capture: Extract<StrategyCapture, { kind: "toml_first_existing" }>,
  ctx: DiscoveryProbeContext,
): Promise<string | null> => {
  for (const path of capture.paths) {
    const raw = await ctx.getTomlPathValue(capture.file, path);
    const value = normalizeCapturedValue(raw);
    if (value !== null) return value;
  }
  return null;
};

const resolveCapture = async (
  capture: StrategyCapture,
  ctx: DiscoveryProbeContext,
): Promise<string | null> => {
  if (capture.kind === "lockfile_package_manager") {
    return resolvePackageManager(ctx);
  }

  if (capture.kind === "json_first_existing") {
    return resolveJsonFirstExisting(capture, ctx);
  }

  if (capture.kind === "toml_first_existing") {
    return resolveTomlFirstExisting(capture, ctx);
  }

  const neverCapture: never = capture;
  throw new Error(`Unhandled capture kind: ${String(neverCapture)}`);
};

export const resolveStrategyCaptures = async (
  strategy: DiscoveryStrategy,
  ctx: DiscoveryProbeContext,
): Promise<CaptureResolution> => {
  const values: Record<string, string> = {};

  for (const capture of strategy.capture) {
    const value = await resolveCapture(capture, ctx);
    if (value === null) {
      return {
        values,
        error: `Strategy '${strategy.id}' could not resolve capture '${capture.name}'.`,
      };
    }
    values[capture.name] = value;
  }

  return {
    values,
    error: null,
  };
};
