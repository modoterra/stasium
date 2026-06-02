import { createHash } from "node:crypto";
import { appendFile, mkdir, readFile, watch } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import type { LogEntry } from "./types";

const checksum = (value: string): string => createHash("md5").update(value).digest("hex");
const sanitizeName = (name: string): string =>
  name.replace(/[\\/]/g, "_").split(String.fromCodePoint(0)).join("");

const formatLogLine = (entry: LogEntry): string => {
  const streamLabel = entry.stream === "stderr" ? "ERR" : "OUT";
  return `${entry.timestamp} [${streamLabel}] ${entry.line}`;
};

export interface ProcessOutputStoreOptions {
  root?: string;
}

export class ProcessOutputStore {
  private readonly cwd: string;
  private readonly root: string;

  constructor(cwd: string, options: ProcessOutputStoreOptions = {}) {
    this.cwd = cwd;
    this.root = options.root ?? resolve(homedir(), ".local", "share", "stasium");
  }

  async append(name: string, entry: LogEntry): Promise<void> {
    const path = await this.outputPath(name);
    await appendFile(path, `${formatLogLine(entry)}\n`);
  }

  async read(name: string): Promise<string | null> {
    try {
      return await readFile(await this.outputPath(name), "utf8");
    } catch (error) {
      const code = (error as NodeJS.ErrnoException | undefined)?.code;
      if (code === "ENOENT") return null;
      throw error;
    }
  }

  async *follow(name: string): AsyncGenerator<string> {
    const path = await this.outputPath(name);
    let offset = 0;
    const current = await this.read(name);
    if (current) {
      offset = current.length;
      yield current;
    }

    for await (const _event of watch(path)) {
      const contents = await this.read(name);
      if (!contents || contents.length <= offset) continue;
      const next = contents.slice(offset);
      offset = contents.length;
      yield next;
    }
  }

  private async outputPath(name: string): Promise<string> {
    const dir = resolve(this.root, checksum(resolve(this.cwd)), "output");
    await mkdir(dir, { recursive: true });
    return resolve(dir, `${sanitizeName(basename(name))}.log`);
  }
}
