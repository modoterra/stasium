import { createHash } from "node:crypto";
import { realpathSync, writeFileSync } from "node:fs";
import { mkdir, readFile, readdir, unlink } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { readLiveProcessInfo } from "./process-info";
import type { ServicePid } from "./types";

const PID_EXTENSION = ".pid";
const PID_FILE_VERSION = 1;
const WAIT_INTERVAL_MS = 50;
const DEFAULT_WAIT_MS = 1500;
const WRITE_DELAY_MS = 100;
let pidDirRoot = resolve(homedir(), ".local", "share", "stasium");

const checksum = (value: string): string => createHash("md5").update(value).digest("hex");

const sanitizeServiceName = (name: string): string =>
  name.replace(/[\\/]/g, "_").replace(/\0/g, "");

const buildPidFileName = (name: string): string => `${sanitizeServiceName(name)}${PID_EXTENSION}`;

const getServiceNameFromFile = (path: string): string => basename(path, PID_EXTENSION);

const getPidDir = (cwd: string): string => {
  const resolved = realpathSync(cwd);
  return resolve(pidDirRoot, checksum(resolved));
};

export const setPidDirRootForTests = (root: string | null): void => {
  pidDirRoot = root ? resolve(root) : resolve(homedir(), ".local", "share", "stasium");
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

// Full process-tree cleanup relies on Unix process groups. Windows falls back to live-process checks.
const SHOULD_SIGNAL_PROCESS_GROUP = process.platform !== "win32";

const trySignalOne = (target: number, signal: NodeJS.Signals): boolean => {
  try {
    process.kill(target, signal);
    return true;
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    return code === "ESRCH";
  }
};

const trySignal = async (
  pid: number,
  signal: NodeJS.Signals,
  timeoutMs: number,
): Promise<boolean> => {
  if (!isProcessAlive(pid)) return true;
  if (SHOULD_SIGNAL_PROCESS_GROUP) {
    trySignalOne(-pid, signal);
  }
  if (!trySignalOne(pid, signal)) return false;
  return waitForPidExit(pid, timeoutMs);
};

const stopPid = async (pid: number, timeoutMs: number): Promise<boolean> =>
  (await trySignal(pid, "SIGINT", timeoutMs)) ||
  (await trySignal(pid, "SIGTERM", timeoutMs)) ||
  (await trySignal(pid, "SIGKILL", timeoutMs));

type PidFileRecord = {
  version: typeof PID_FILE_VERSION;
  pid: number;
  service: string;
  cwd: string;
  command: string[];
  startedAt: string;
  identityVerified: boolean;
  platform: NodeJS.Platform;
};

type ParsedPidFile =
  | { kind: "legacy"; pid: number }
  | { kind: "record"; record: PidFileRecord };

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const parsePidFileRecord = (value: unknown): PidFileRecord | null => {
  if (value === null || typeof value !== "object") return null;

  const record = value as Partial<PidFileRecord>;
  const version = record.version;
  const pidValue = record.pid;
  const serviceValue = record.service;
  const cwdValue = record.cwd;
  const commandValue = record.command;
  const startedAtValue = record.startedAt;
  const identityVerifiedValue = record.identityVerified;
  const platformValue = record.platform;

  if (version !== PID_FILE_VERSION) return null;
  if (typeof pidValue !== "number" || !Number.isInteger(pidValue) || pidValue <= 0) return null;
  if (typeof serviceValue !== "string" || serviceValue.trim().length === 0) return null;
  if (typeof cwdValue !== "string" || cwdValue.trim().length === 0) return null;
  if (!isStringArray(commandValue)) return null;
  if (typeof startedAtValue !== "string" || startedAtValue.trim().length === 0) return null;
  if (typeof identityVerifiedValue !== "boolean") return null;
  if (typeof platformValue !== "string" || platformValue.trim().length === 0) return null;

  return {
    version: PID_FILE_VERSION,
    pid: pidValue,
    service: serviceValue,
    cwd: cwdValue,
    command: [...commandValue],
    startedAt: startedAtValue,
    identityVerified: identityVerifiedValue,
    platform: platformValue,
  };
};

const parsePidFileContents = (contents: string): ParsedPidFile | null => {
  const trimmed = contents.trim();
  if (trimmed.length === 0) return null;

  if (/^\d+$/.test(trimmed)) {
    const pid = Number.parseInt(trimmed, 10);
    if (Number.isInteger(pid) && pid > 0) {
      return { kind: "legacy", pid };
    }
    return null;
  }

  try {
    const parsed = JSON.parse(trimmed);
    const record = parsePidFileRecord(parsed);
    return record ? { kind: "record", record } : null;
  } catch {
    return null;
  }
};

const getPidFromParsed = (parsed: ParsedPidFile): number =>
  parsed.kind === "legacy" ? parsed.pid : parsed.record.pid;

const buildPidFileRecord = (service: ServicePid): PidFileRecord => ({
  version: PID_FILE_VERSION,
  pid: service.pid,
  service: sanitizeServiceName(service.name),
  cwd: service.workingDir,
  command: [...service.command],
  startedAt: service.startedAt,
  identityVerified: service.identityVerified,
  platform: process.platform,
});

const recordsMatch = (left: PidFileRecord, right: PidFileRecord): boolean =>
  left.pid === right.pid &&
  left.service === right.service &&
  left.cwd === right.cwd &&
  left.startedAt === right.startedAt &&
  left.identityVerified === right.identityVerified &&
  left.platform === right.platform &&
  left.command.length === right.command.length &&
  left.command.every((value, index) => value === right.command[index]);

const liveProcessMatchesRecord = async (record: PidFileRecord): Promise<boolean> => {
  if (!record.identityVerified) return false;
  const live = await readLiveProcessInfo(record.pid);
  if (!live) return false;
  if (live.startedAt !== record.startedAt) return false;

  const storedCommand = record.command.join(" ");
  if (storedCommand.length > 0 && live.command && live.command !== storedCommand) {
    return false;
  }

  return true;
};

const safeUnlink = async (path: string): Promise<void> => {
  try {
    await unlink(path);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException | undefined)?.code;
    if (code !== "ENOENT") throw error;
  }
};

const readPidFile = async (path: string): Promise<ParsedPidFile | null> => {
  try {
    const contents = await readFile(path, "utf8");
    return parsePidFileContents(contents);
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
  const pidMap = new Map<
    number,
    { files: string[]; unknownServices: string[]; records: PidFileRecord[] }
  >();

  for (const path of pidFiles) {
    const parsed = await readPidFile(path);
    if (!parsed) {
      await safeUnlink(path);
      continue;
    }
    const pid = getPidFromParsed(parsed);

    const serviceName = getServiceNameFromFile(path);
    const unknown = known.size > 0 && !known.has(serviceName) ? serviceName : null;
    const entry = pidMap.get(pid);
    if (entry) {
      entry.files.push(path);
      if (unknown) entry.unknownServices.push(unknown);
      if (parsed.kind === "legacy") {
        continue;
      }
      entry.records.push(parsed.record);
    } else {
      pidMap.set(pid, {
        files: [path],
        unknownServices: unknown ? [unknown] : [],
        records: parsed.kind === "record" ? [parsed.record] : [],
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

    if (entry.records.length === 0 || entry.records.some((record) => !record.identityVerified)) {
      logger?.(`Skipping live PID ${pid}; pidfile identity cannot be verified safely.`);
      continue;
    }

    const matches = await Promise.all(entry.records.map((record) => liveProcessMatchesRecord(record)));
    if (!matches.every(Boolean)) {
      logger?.(`Skipping PID ${pid}; pidfile identity no longer matches the live process.`);
      continue;
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
  const desired = new Map<string, PidFileRecord>();
  const known = new Set(knownServices.map((name) => sanitizeServiceName(name)));

  for (const service of services) {
    if (!service.pid || service.pid <= 0 || service.startedAt.length === 0) continue;
    desired.set(buildPidFileName(service.name), buildPidFileRecord(service));
  }

  const existing = await listPidFiles(dir);
  await Promise.all(
    existing.map(async (path) => {
      const name = basename(path);
      if (desired.has(name)) return;
      const parsed = await readPidFile(path);
      if (!parsed) {
        await safeUnlink(path);
        return;
      }
      const pid = getPidFromParsed(parsed);
      if (pid === process.pid) return;
      if (!isProcessAlive(pid)) {
        await safeUnlink(path);
        return;
      }
      const serviceName = getServiceNameFromFile(path);
      const unknown = known.size > 0 && !known.has(serviceName);
      if (unknown) {
        logger?.(`Found PID ${pid} for removed service: ${serviceName}.`);
        if (parsed.kind === "legacy" || !parsed.record.identityVerified) {
          logger?.(`Skipping live PID ${pid}; pidfile identity cannot be verified safely.`);
          return;
        }
        if (!(await liveProcessMatchesRecord(parsed.record))) {
          logger?.(`Skipping PID ${pid}; pidfile identity no longer matches the live process.`);
          return;
        }
        const stopped = await stopPid(pid, timeoutMs);
        if (stopped) {
          await safeUnlink(path);
        }
        return;
      }
    }),
  );

  for (const [fileName, record] of desired.entries()) {
    const path = resolve(dir, fileName);
    const current = await readPidFile(path);
    if (current?.kind === "record" && recordsMatch(current.record, record)) continue;

    const currentPid = current ? getPidFromParsed(current) : null;
    if (currentPid && currentPid !== record.pid && isProcessAlive(currentPid)) {
      await delay(WRITE_DELAY_MS);
      continue;
    }
    writeFileSync(path, JSON.stringify(record));
  }
};

export const removeServicePidFiles = async (cwd: string, services: ServicePid[]): Promise<void> => {
  const dir = getPidDir(cwd);
  const targets = services
    .filter(
      (service) =>
        Number.isInteger(service.pid) && service.pid > 0 && service.startedAt.trim().length > 0,
    )
    .map((service) => ({
      path: resolve(dir, buildPidFileName(service.name)),
      record: buildPidFileRecord(service),
    }));

  await Promise.all(
    targets.map(async (target) => {
      const current = await readPidFile(target.path);
      if (!current) return;

      if (current.kind === "legacy") {
        if (current.pid !== target.record.pid) return;
        if (isProcessAlive(current.pid)) return;
        await safeUnlink(target.path);
        return;
      }

      if (!recordsMatch(current.record, target.record)) return;
      if (isProcessAlive(current.record.pid)) return;
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
      const parsed = await readPidFile(path);
      if (!parsed) {
        await safeUnlink(path);
        return;
      }

      const pid = getPidFromParsed(parsed);
      if (!isProcessAlive(pid)) {
        await safeUnlink(path);
      }
    }),
  );
};
