import { ManifestError } from "./manifest";
import type { CommandSpec } from "./types";

type Token = {
  value: string;
  quoted: boolean;
};

const tokenize = (input: string): Token[] => {
  const tokens: Token[] = [];
  let current = "";
  let inSingle = false;
  let inDouble = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]!;
    if (ch === "\\") {
      const next = input[i + 1];
      if (next !== undefined) {
        current += next;
        i += 1;
        continue;
      }
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (!inSingle && !inDouble && /\s/.test(ch)) {
      if (current.length > 0) {
        tokens.push({ value: current, quoted: false });
        current = "";
      }
      continue;
    }
    current += ch;
  }

  if (inSingle || inDouble) {
    throw new ManifestError("command has unclosed quotes");
  }

  if (current.length > 0) {
    tokens.push({ value: current, quoted: false });
  }

  return tokens;
};

const forbiddenOperators = ["|", "&", ";", ">", "<", "`", "$"];

const assertNoShellOperators = (argv: string[], raw: string) => {
  for (const op of forbiddenOperators) {
    if (raw.includes(op)) {
      throw new ManifestError(
        `command contains shell operator '${op}'. Use an argv array instead of shell syntax.`,
      );
    }
  }
  if (argv.length === 0) {
    throw new ManifestError("command must not be empty");
  }
};

export const normalizeCommand = (command: CommandSpec): string[] => {
  if (Array.isArray(command)) {
    if (command.length === 0) {
      throw new ManifestError("command array must not be empty");
    }
    return command;
  }

  const raw = command.trim();
  if (raw.length === 0) {
    throw new ManifestError("command must not be empty");
  }

  const tokens = tokenize(raw);
  const argv = tokens.map((token) => token.value);
  assertNoShellOperators(argv, raw);
  return argv;
};
