import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir, readFile, readdir, unlink, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import type { ServicePid } from "./types";

const PID_DIR_ROOT = resolve(homedir(), ".local", "share", "stasium");
const PID_EXTENSION = ".pid";
const WAIT_INTERVAL_MS = 50;
const DEFAULT_WAIT_MS = 1500;
const WRITE_DELAY_MS = 100;

const checksum = (value: string): string => createHash("md5").update(value).digest("hex");

const sanitizeServiceName = (name: string): string =>
  name.replace(/[\\/]/g, "_").replace(/\0/g, "");

const buildPidFileName = (name: string): string => `${sanitizeServiceName(name)}${PID_EXTENSION}`;

const getServiceNameFromFile = (path: string): string => basename(path, PID_EXTENSION);

const getPidDir = (cwd: string): string => {
  const resolved = realpathSync(cwd);
  return resolve(PID_DIR_ROOT, checksum(resolved));
};

const ensurePidDir = async (cwd: string): Promise<string> => {
  const dir = getPidDir(cwd);
  await mkdir(dir, { recursive: true });
  return dir;
};

const isProcessAlive = (pid: number): boolean => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const waitForPidExit = async (pid: number, timeoutMs: number): Promise<boolean> => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isProcessAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, WAIT_INTERVAL_MS));
  }
  return !isProcessAlive(pid);
};

const trySignal = async (
  pid: number,
  signal: NodeJS.Signals,
  timeoutMs: number,
): Promise<boolean> => {
  if (!isProcessAlive(pid)) return true;
  try {
    process.kill(pid, signal);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code === "ESRCH") return true;
    return false;
  }
  return waitForPidExit(pid, timeoutMs);
};

const stopPid = async (pid: number, timeoutMs: number): Promise<boolean> =>
  (await trySignal(pid, "SIGINT", timeoutMs)) ||
  (await trySignal(pid, "SIGTERM", timeoutMs)) ||
  (await trySignal(pid, "SIGKILL", timeoutMs));

const safeUnlink = async (path: string): Promise<void> => {
  try {
    await unlink(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "ENOENT") throw error;
  }
};

const readPidFile = async (path: string): Promise<number | null> => {
  try {
    const contents = await readFile(path, "utf8");
    const value = Number.parseInt(contents.trim(), 10);
    if (!Number.isFinite(value) || value <= 0) return null;
    return value;
  } catch {
    return null;
  }
};

const listPidFiles = async (dir: string): Promise<string[]> => {
  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(PID_EXTENSION))
      .map((entry) => resolve(dir, entry.name));
  } catch {
    return [];
  }
};

type CleanupOptions = {
  logger?: (message: string) => void;
  timeoutMs?: number;
  knownServices?: string[];
};

export const cleanupExistingPids = async (
  cwd: string,
  { logger, timeoutMs = DEFAULT_WAIT_MS, knownServices = [] }: CleanupOptions = {},
): Promise<void> => {
  const dir = getPidDir(cwd);
  const pidFiles = await listPidFiles(dir);
  if (pidFiles.length === 0) return;

  const known = new Set(knownServices.map((name) => sanitizeServiceName(name)));
  const pidMap = new Map<number, { files: string[]; unknownServices: string[] }>();

  for (const path of pidFiles) {
    const pid = await readPidFile(path);
    if (!pid) {
      await safeUnlink(path);
      continue;
    }

    const serviceName = getServiceNameFromFile(path);
    const unknown = known.size > 0 && !known.has(serviceName) ? serviceName : null;
    const entry = pidMap.get(pid);
    if (entry) {
      entry.files.push(path);
      if (unknown) entry.unknownServices.push(unknown);
    } else {
      pidMap.set(pid, {
        files: [path],
        unknownServices: unknown ? [unknown] : [],
      });
    }
  }

  for (const [pid, entry] of pidMap) {
    if (!isProcessAlive(pid)) {
      await Promise.all(entry.files.map((file) => safeUnlink(file)));
      continue;
    }

    if (pid === process.pid) {
      logger?.(`Skipping PID ${pid}; already running in this process.`);
      continue;
    }

    if (entry.unknownServices.length > 0) {
      const labels = entry.unknownServices.join(", ");
      logger?.(`Found PID ${pid} for removed services: ${labels}.`);
    }

    logger?.(`Found existing service PID ${pid}, attempting shutdown.`);
    const stopped = await stopPid(pid, timeoutMs);

    if (stopped) {
      await Promise.all(entry.files.map((file) => safeUnlink(file)));
      logger?.(`Previous service PID ${pid} stopped.`);
      continue;
    }

    logger?.(`Unable to stop PID ${pid}; leaving pidfiles intact.`);
  }
};

type SyncOptions = {
  knownServices?: string[];
  logger?: (message: string) => void;
  timeoutMs?: number;
};

export const syncPidFiles = async (
  cwd: string,
  services: ServicePid[],
  { knownServices = [], logger, timeoutMs = DEFAULT_WAIT_MS }: SyncOptions = {},
): Promise<void> => {
  const dir = await ensurePidDir(cwd);
  const desired = new Map<string, number>();
  const known = new Set(knownServices.map((name) => sanitizeServiceName(name)));

  for (const service of services) {
    if (!service.pid || service.pid <= 0) continue;
    desired.set(buildPidFileName(service.name), service.pid);
  }

  const existing = await listPidFiles(dir);
  await Promise.all(
    existing.map(async (path) => {
      const name = basename(path);
      if (desired.has(name)) return;
      const pid = await readPidFile(path);
      if (!pid) {
        await safeUnlink(path);
        return;
      }
      if (pid === process.pid) return;
      const serviceName = getServiceNameFromFile(path);
      const unknown = known.size > 0 && !known.has(serviceName);
      if (unknown) {
        logger?.(`Found PID ${pid} for removed service: ${serviceName}.`);
        const stopped = await stopPid(pid, timeoutMs);
        if (stopped) {
          await safeUnlink(path);
        }
        return;
      }
      if (!isProcessAlive(pid)) {
        await safeUnlink(path);
      }
    }),
  );

  for (const [fileName, pid] of desired.entries()) {
    const path = resolve(dir, fileName);
    const current = await readPidFile(path);
    if (current === pid) continue;
    if (current && current !== pid && isProcessAlive(current)) {
      await delay(WRITE_DELAY_MS);
      continue;
    }
    await writeFile(path, `${pid}`);
  }
};

export const removeServicePidFiles = async (cwd: string, services: ServicePid[]): Promise<void> => {
  const dir = getPidDir(cwd);
  const targets = services
    .filter((service) => Number.isInteger(service.pid) && service.pid > 0)
    .map((service) => ({
      path: resolve(dir, buildPidFileName(service.name)),
      pid: service.pid,
    }));

  await Promise.all(
    targets.map(async (target) => {
      const current = await readPidFile(target.path);
      if (current !== target.pid) return;
      if (isProcessAlive(current)) return;
      await safeUnlink(target.path);
    }),
  );
};

export const removePidFilesForServices = async (
  cwd: string,
  serviceNames: string[],
): Promise<void> => {
  const dir = getPidDir(cwd);
  const targets = serviceNames.map((name) => resolve(dir, buildPidFileName(name)));

  await Promise.all(
    targets.map(async (path) => {
      const pid = await readPidFile(path);
      if (!pid || !isProcessAlive(pid)) {
        await safeUnlink(path);
      }
    }),
  );
};
