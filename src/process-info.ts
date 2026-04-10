import { resolve } from "node:path";

export interface LiveProcessInfo {
  pid: number;
  startedAt: string;
  command: string | null;
}

const readPsField = async (pid: number, field: string): Promise<string | null> => {
  try {
    const proc = Bun.spawn({
      cmd: ["ps", "-p", `${pid}`, "-o", `${field}=`],
      stdout: "pipe",
      stderr: "ignore",
    });
    const output = await new Response(proc.stdout).text();
    const exitCode = await proc.exited;
    if (exitCode !== 0) return null;
    const value = output.trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
};

export const readLiveProcessInfo = async (pid: number): Promise<LiveProcessInfo | null> => {
  if (process.platform === "win32") return null;
  if (!Number.isInteger(pid) || pid <= 0) return null;

  const [startedAt, command] = await Promise.all([
    readPsField(pid, "lstart"),
    readPsField(pid, "command"),
  ]);
  if (!startedAt) return null;

  return {
    pid,
    startedAt,
    command,
  };
};

export const resolveRuntimeWorkingDir = (cwd?: string): string => resolve(cwd ?? process.cwd());
