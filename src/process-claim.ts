import {
  cleanupExistingPids,
  removePidFilesForServices,
  removeServicePidFiles,
  writePidFiles,
} from "./pidfile";
import type { ServicePid } from "./types";

export interface ProcessClaimStoreOptions {
  logger?: (message: string) => void;
  timeoutMs?: number;
}

export class ProcessClaimStore {
  private readonly cwd: string;
  private readonly logger?: (message: string) => void;
  private readonly timeoutMs?: number;

  constructor(cwd: string, options: ProcessClaimStoreOptions = {}) {
    this.cwd = cwd;
    this.logger = options.logger;
    this.timeoutMs = options.timeoutMs;
  }

  async claimDirectManagedProcess(claim: ServicePid): Promise<void> {
    await writePidFiles(this.cwd, [claim]);
  }

  async releaseDirectManagedProcess(claim: ServicePid): Promise<void> {
    await removeServicePidFiles(this.cwd, [claim]);
  }

  async cleanupRemovedDirectManagedProcessClaims(names: string[]): Promise<void> {
    await removePidFilesForServices(this.cwd, names);
  }

  async cleanupStaleDirectManagedProcessClaims(knownNames: string[]): Promise<void> {
    await cleanupExistingPids(this.cwd, {
      knownServices: knownNames,
      logger: this.logger,
      timeoutMs: this.timeoutMs,
    });
  }
}
