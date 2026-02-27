import { resolve } from "node:path";
import type { RegexProbe, ValuePathProbe } from "./types";

type UnknownRecord = Record<string, unknown>;

const isRecord = (value: unknown): value is UnknownRecord => {
  return value !== null && typeof value === "object" && !Array.isArray(value);
};

const getPathValue = (root: unknown, path: string): unknown => {
  const segments = path.split(".").filter(Boolean);
  if (segments.length === 0) return undefined;

  let current: unknown = root;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index) || index < 0 || index >= current.length) {
        return undefined;
      }
      current = current[index];
      continue;
    }

    if (isRecord(current)) {
      current = current[segment];
      continue;
    }

    return undefined;
  }

  return current;
};

const matchesValue = (
  actual: unknown,
  expected: string | number | boolean | undefined,
): boolean => {
  if (actual === undefined) return false;
  if (expected === undefined) return true;
  if (Array.isArray(actual)) {
    return actual.some((item) => item === expected);
  }
  return actual === expected;
};

const readFileText = async (path: string): Promise<string | null> => {
  const file = Bun.file(path);
  try {
    if (!(await file.exists())) return null;
    return await file.text();
  } catch {
    return null;
  }
};

export class DiscoveryProbeContext {
  private readonly fileExistsCache = new Map<string, Promise<boolean>>();
  private readonly textCache = new Map<string, Promise<string | null>>();
  private readonly jsonCache = new Map<string, Promise<unknown | null>>();
  private readonly tomlCache = new Map<string, Promise<unknown | null>>();

  constructor(private readonly cwd: string) {}

  async fileExists(relativePath: string): Promise<boolean> {
    const key = resolve(this.cwd, relativePath);
    const cached = this.fileExistsCache.get(key);
    if (cached) return cached;

    const pending = Bun.file(key)
      .exists()
      .catch(() => false);
    this.fileExistsCache.set(key, pending);
    return pending;
  }

  async matchesJsonPath(probe: ValuePathProbe): Promise<boolean> {
    const value = await this.getJsonPathValue(probe.file, probe.path);
    return matchesValue(value, probe.equals);
  }

  async matchesTomlPath(probe: ValuePathProbe): Promise<boolean> {
    const value = await this.getTomlPathValue(probe.file, probe.path);
    return matchesValue(value, probe.equals);
  }

  async getJsonPathValue(file: string, path: string): Promise<unknown | undefined> {
    const parsed = await this.readJson(file);
    if (parsed === null) return undefined;
    return getPathValue(parsed, path);
  }

  async getTomlPathValue(file: string, path: string): Promise<unknown | undefined> {
    const parsed = await this.readToml(file);
    if (parsed === null) return undefined;
    return getPathValue(parsed, path);
  }

  async matchesRegex(probe: RegexProbe): Promise<boolean> {
    const contents = await this.readText(probe.file);
    if (contents === null) return false;
    try {
      const regex = new RegExp(probe.pattern, probe.flags);
      return regex.test(contents);
    } catch {
      return false;
    }
  }

  private async readText(relativePath: string): Promise<string | null> {
    const key = resolve(this.cwd, relativePath);
    const cached = this.textCache.get(key);
    if (cached) return cached;

    const pending = readFileText(key);
    this.textCache.set(key, pending);
    return pending;
  }

  private async readJson(relativePath: string): Promise<unknown | null> {
    const key = resolve(this.cwd, relativePath);
    const cached = this.jsonCache.get(key);
    if (cached) return cached;

    const pending = this.readText(relativePath).then((contents) => {
      if (contents === null) return null;
      try {
        return JSON.parse(contents) as unknown;
      } catch {
        return null;
      }
    });
    this.jsonCache.set(key, pending);
    return pending;
  }

  private async readToml(relativePath: string): Promise<unknown | null> {
    const key = resolve(this.cwd, relativePath);
    const cached = this.tomlCache.get(key);
    if (cached) return cached;

    const pending = this.readText(relativePath).then((contents) => {
      if (contents === null) return null;
      try {
        return Bun.TOML.parse(contents) as unknown;
      } catch {
        return null;
      }
    });
    this.tomlCache.set(key, pending);
    return pending;
  }
}
