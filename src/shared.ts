export const fileExists = async (path: string): Promise<boolean> => {
  try {
    return await Bun.file(path).exists();
  } catch {
    return false;
  }
};

export const getErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);
