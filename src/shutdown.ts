import { removePidFilesForServices, removeServicePidFiles } from "./pidfile";
import type { ServiceManager } from "./service-manager";
import type { ServicePid } from "./types";

const EXIT_WAIT_MS = 1500;
const SHUTDOWN_SIGNALS: NodeJS.Signals[] = [
  "SIGINT",
  "SIGTERM",
  "SIGHUP",
  "SIGQUIT",
  "SIGBREAK",
  "SIGUSR1",
  "SIGUSR2",
];

export type ShutdownContext = {
  cwd: string;
  manager: ServiceManager;
  getServicePids: () => ServicePid[];
  onAfter?: () => Promise<void> | void;
  logger?: (message: string) => void;
};

export const createShutdownHandler = ({
  cwd,
  manager,
  getServicePids,
  onAfter,
  logger,
}: ShutdownContext) => {
  let shuttingDown = false;
  let shutdownPromise: Promise<void> | null = null;

  const run = async (reason?: string): Promise<void> => {
    if (shutdownPromise) return shutdownPromise;
    shuttingDown = true;
    shutdownPromise = (async () => {
      if (reason) logger?.(reason);
      await manager.stopAll();
      const clean = await manager.waitForExit(EXIT_WAIT_MS);
      if (!clean) {
        await manager.forceStopAll();
        await manager.waitForExit(EXIT_WAIT_MS);
      }
      await removeServicePidFiles(cwd, getServicePids());
      await removePidFilesForServices(
        cwd,
        manager.getConfigs().map((config) => config.name),
      );
      await onAfter?.();
    })();
    return shutdownPromise;
  };

  const handleSignal = (signal: NodeJS.Signals): void => {
    void run(`Received ${signal}; shutting down services.`).then(() => {
      process.exitCode = process.exitCode ?? 0;
      process.exit(process.exitCode ?? 0);
    });
  };

  const handleExit = (): void => {
    if (!shuttingDown) {
      void run("Process exit; shutting down services.");
    }
  };

  const handleBeforeExit = (): void => {
    if (!shuttingDown) {
      void run("Process beforeExit; shutting down services.");
    }
  };

  const handleError = (message: string, error?: unknown): void => {
    const detail = error instanceof Error ? error.message : String(error ?? "");
    const note = detail ? `${message}: ${detail}` : message;
    void run(note).then(() => {
      process.exitCode = 1;
      process.exit(1);
    });
  };

  const handleUncaughtException = (error: unknown): void => {
    handleError("Uncaught exception", error);
  };

  const handleUnhandledRejection = (reason: unknown): void => {
    handleError("Unhandled rejection", reason);
  };

  const install = (): void => {
    for (const signal of SHUTDOWN_SIGNALS) {
      process.on(signal, handleSignal);
    }
    process.on("beforeExit", handleBeforeExit);
    process.on("exit", handleExit);
    process.on("uncaughtException", handleUncaughtException);
    process.on("unhandledRejection", handleUnhandledRejection);
  };

  const uninstall = (): void => {
    for (const signal of SHUTDOWN_SIGNALS) {
      process.off(signal, handleSignal);
    }
    process.off("beforeExit", handleBeforeExit);
    process.off("exit", handleExit);
    process.off("uncaughtException", handleUncaughtException);
    process.off("unhandledRejection", handleUnhandledRejection);
  };

  return { run, install, uninstall };
};
