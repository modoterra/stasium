import { resolve } from "node:path";
import { saveManifest } from "./manifest";
import type { CommandSpec, ServiceConfig } from "./types";

export class InitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InitError";
  }
}

type InitResult = {
  manifestPath: string;
  services: ServiceConfig[];
  warnings: string[];
};

const fileExists = async (path: string): Promise<boolean> => {
  try {
    return await Bun.file(path).exists();
  } catch {
    return false;
  }
};

const detectPackageManager = async (cwd: string): Promise<string> => {
  if (await fileExists(resolve(cwd, "bun.lockb"))) return "bun";
  if (await fileExists(resolve(cwd, "bun.lock"))) return "bun";
  if (await fileExists(resolve(cwd, "pnpm-lock.yaml"))) return "pnpm";
  if (await fileExists(resolve(cwd, "yarn.lock"))) return "yarn";
  if (await fileExists(resolve(cwd, "package-lock.json"))) return "npm";
  return "bun";
};

const readPackageScripts = async (cwd: string): Promise<Record<string, string> | null> => {
  const path = resolve(cwd, "package.json");
  if (!(await fileExists(path))) return null;
  const contents = await Bun.file(path).text();
  try {
    const parsed = JSON.parse(contents) as { scripts?: Record<string, string> };
    return parsed.scripts ?? {};
  } catch {
    return null;
  }
};

const pickScript = (scripts: Record<string, string>): string | null => {
  const order = ["dev", "start", "watch", "serve"];
  for (const name of order) {
    if (scripts[name]) return name;
  }
  return null;
};

const ensureUniqueName = (name: string, used: Set<string>): string => {
  if (!used.has(name)) return name;
  let suffix = 2;
  while (used.has(`${name}-${suffix}`)) {
    suffix += 1;
  }
  return `${name}-${suffix}`;
};

const formatCommand = (command: CommandSpec): string => {
  if (Array.isArray(command)) return command.join(" ");
  return command;
};

export type DetectResult = {
  services: ServiceConfig[];
  warnings: string[];
};

export const detectServices = async (cwd: string): Promise<DetectResult> => {
  const services: ServiceConfig[] = [];
  const warnings: string[] = [];
  const usedNames = new Set<string>();

  const artisanPath = resolve(cwd, "artisan");
  const hasArtisan = await fileExists(artisanPath);
  if (hasArtisan) {
    const name = ensureUniqueName("app", usedNames);
    usedNames.add(name);
    services.push({
      name,
      command: ["php", "artisan", "serve"],
      working_dir: ".",
    });

    const queueConfig = resolve(cwd, "config/queue.php");
    if (await fileExists(queueConfig)) {
      const queueName = ensureUniqueName("queue", usedNames);
      usedNames.add(queueName);
      services.push({
        name: queueName,
        command: ["php", "artisan", "queue:work"],
        working_dir: ".",
      });
    }
  }

  const scripts = await readPackageScripts(cwd);
  if (scripts) {
    const script = pickScript(scripts);
    if (script) {
      const packageManager = await detectPackageManager(cwd);
      const name = ensureUniqueName("frontend", usedNames);
      usedNames.add(name);
      services.push({
        name,
        command: [packageManager, "run", script],
        working_dir: ".",
      });
    }
  } else if (await fileExists(resolve(cwd, "package.json"))) {
    warnings.push("package.json exists but could not be parsed. Frontend service skipped.");
  }

  return { services, warnings };
};

export const writeManifest = async (
  manifestPath: string,
  services: ServiceConfig[],
): Promise<void> => {
  await saveManifest(manifestPath, services);
};

export const initProject = async (
  cwd: string,
  manifestName = "stasium.toml",
): Promise<InitResult> => {
  const manifestPath = resolve(cwd, manifestName);
  if (await fileExists(manifestPath)) {
    throw new InitError(`Manifest already exists: ${manifestPath}`);
  }

  const { services, warnings } = await detectServices(cwd);
  await writeManifest(manifestPath, services);

  return {
    manifestPath,
    services,
    warnings,
  };
};

export const formatServiceSummary = (service: ServiceConfig): string =>
  `${service.name}: ${formatCommand(service.command)}`;
