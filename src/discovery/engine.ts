import type { ServiceConfig } from "../types";
import { resolveStrategyCaptures } from "./captures";
import { DiscoveryProbeContext } from "./probes";
import type { DetectResult, DetectedCandidate, DiscoveryStrategy, StrategyWhen } from "./types";

const PLACEHOLDER_PATTERN = /\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g;

const interpolate = (template: string, captures: Record<string, string>): string | null => {
  let missingCapture = false;
  const rendered = template.replace(PLACEHOLDER_PATTERN, (_match, captureName: string) => {
    const value = captures[captureName];
    if (value === undefined) {
      missingCapture = true;
      return "";
    }
    return value;
  });
  if (missingCapture) return null;
  return rendered;
};

const matchesAll = async <T>(
  items: T[],
  predicate: (item: T) => Promise<boolean>,
): Promise<boolean> => {
  for (const item of items) {
    if (!(await predicate(item))) return false;
  }
  return true;
};

const matchesAnyOrEmpty = async <T>(
  items: T[],
  predicate: (item: T) => Promise<boolean>,
): Promise<boolean> => {
  if (items.length === 0) return true;
  for (const item of items) {
    if (await predicate(item)) return true;
  }
  return false;
};

const matchesWhen = async (when: StrategyWhen, ctx: DiscoveryProbeContext): Promise<boolean> => {
  if (!(await matchesAll(when.all_files, async (path) => await ctx.fileExists(path)))) {
    return false;
  }

  if (!(await matchesAnyOrEmpty(when.any_files, async (path) => await ctx.fileExists(path)))) {
    return false;
  }

  if (!(await matchesAll(when.all_json_paths, async (probe) => await ctx.matchesJsonPath(probe)))) {
    return false;
  }

  if (
    !(await matchesAnyOrEmpty(
      when.any_json_paths,
      async (probe) => await ctx.matchesJsonPath(probe),
    ))
  ) {
    return false;
  }

  if (!(await matchesAll(when.all_toml_paths, async (probe) => await ctx.matchesTomlPath(probe)))) {
    return false;
  }

  if (
    !(await matchesAnyOrEmpty(
      when.any_toml_paths,
      async (probe) => await ctx.matchesTomlPath(probe),
    ))
  ) {
    return false;
  }

  if (!(await matchesAll(when.all_regex, async (probe) => await ctx.matchesRegex(probe)))) {
    return false;
  }

  if (!(await matchesAnyOrEmpty(when.any_regex, async (probe) => await ctx.matchesRegex(probe)))) {
    return false;
  }

  return true;
};

type ServiceBuildResult = {
  service: ServiceConfig | null;
  dependsOnIds: string[];
  error: string | null;
};

const buildCandidateService = (
  strategy: DiscoveryStrategy,
  captures: Record<string, string>,
): ServiceBuildResult => {
  const renderedName = interpolate(strategy.service.name, captures);
  if (!renderedName || renderedName.trim().length === 0) {
    return {
      service: null,
      dependsOnIds: [],
      error: `Strategy '${strategy.id}' produced an empty service name.`,
    };
  }

  let renderedCommand: ServiceConfig["command"];
  if (Array.isArray(strategy.service.command)) {
    const parts: string[] = [];
    for (const part of strategy.service.command) {
      const renderedPart = interpolate(part, captures);
      if (renderedPart === null || renderedPart.trim().length === 0) {
        return {
          service: null,
          dependsOnIds: [],
          error: `Strategy '${strategy.id}' produced an invalid command part.`,
        };
      }
      parts.push(renderedPart);
    }
    renderedCommand = parts;
  } else {
    const command = interpolate(strategy.service.command, captures);
    if (command === null || command.trim().length === 0) {
      return {
        service: null,
        dependsOnIds: [],
        error: `Strategy '${strategy.id}' produced an empty command.`,
      };
    }
    renderedCommand = command;
  }

  let renderedWorkingDir: string | undefined;
  if (strategy.service.working_dir !== undefined) {
    const workingDir = interpolate(strategy.service.working_dir, captures);
    if (!workingDir || workingDir.trim().length === 0) {
      return {
        service: null,
        dependsOnIds: [],
        error: `Strategy '${strategy.id}' produced an empty working_dir.`,
      };
    }
    renderedWorkingDir = workingDir;
  }

  let renderedEnv: Record<string, string> | undefined;
  if (strategy.service.env) {
    renderedEnv = {};
    for (const [key, rawValue] of Object.entries(strategy.service.env)) {
      const value = interpolate(rawValue, captures);
      if (value === null) {
        return {
          service: null,
          dependsOnIds: [],
          error: `Strategy '${strategy.id}' produced an invalid env value for '${key}'.`,
        };
      }
      renderedEnv[key] = value;
    }
  }

  let renderedDependsOn: string[] | undefined;
  if (strategy.service.depends_on) {
    renderedDependsOn = [];
    for (const dep of strategy.service.depends_on) {
      const renderedDep = interpolate(dep, captures);
      if (!renderedDep || renderedDep.trim().length === 0) {
        return {
          service: null,
          dependsOnIds: [],
          error: `Strategy '${strategy.id}' produced an invalid depends_on value.`,
        };
      }
      renderedDependsOn.push(renderedDep);
    }
  }

  const service: ServiceConfig = {
    name: renderedName,
    command: renderedCommand,
    working_dir: renderedWorkingDir,
    env: renderedEnv,
    restart_policy: strategy.service.restart_policy,
    depends_on: renderedDependsOn,
  };

  return {
    service,
    dependsOnIds: strategy.service.depends_on_ids ?? [],
    error: null,
  };
};

const toCandidate = (
  strategy: DiscoveryStrategy,
  service: ServiceConfig,
  dependsOnIds: string[],
): DetectedCandidate => {
  return {
    strategyId: strategy.id,
    label: strategy.label,
    priority: strategy.priority,
    defaultSelected: strategy.default_selected,
    service,
    dependsOnIds,
  };
};

export const detectDiscoveryCandidates = async (
  cwd: string,
  strategies: DiscoveryStrategy[],
): Promise<DetectResult> => {
  const warnings: string[] = [];
  const candidates: DetectedCandidate[] = [];
  const probes = new DiscoveryProbeContext(cwd);

  for (const strategy of strategies) {
    if (!(await matchesWhen(strategy.when, probes))) {
      continue;
    }

    const captureResolution = await resolveStrategyCaptures(strategy, probes);
    if (captureResolution.error) {
      continue;
    }

    const serviceResult = buildCandidateService(strategy, captureResolution.values);
    if (serviceResult.error || serviceResult.service === null) {
      if (serviceResult.error) {
        warnings.push(serviceResult.error);
      }
      continue;
    }

    candidates.push(toCandidate(strategy, serviceResult.service, serviceResult.dependsOnIds));
  }

  return {
    candidates,
    warnings,
  };
};
