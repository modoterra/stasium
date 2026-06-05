import { useEffect, useState } from "react";

const ROTATION_INTERVAL_MS = 2200;

const prefersReducedMotion = () => {
  if (typeof window === "undefined") return true;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
};

export function useRotatingCommand(commands: readonly string[]) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (commands.length <= 1 || prefersReducedMotion()) return;

    const interval = window.setInterval(() => {
      setIndex((current) => (current + 1) % commands.length);
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, [commands]);

  return commands[index] ?? "";
}
