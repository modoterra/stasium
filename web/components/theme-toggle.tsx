import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";

type ThemeToggleProps = {
  isDark: boolean;
  onToggle: () => void;
};

export function ThemeToggle({ isDark, onToggle }: ThemeToggleProps) {
  return (
    <Button
      aria-label={isDark ? "Use light mode" : "Use dark mode"}
      aria-pressed={isDark}
      className="size-9 rounded-full bg-transparent p-0 text-[#263248] hover:bg-[#eef1f7] dark:text-[#f7f2e8] dark:hover:bg-white/10"
      size="icon"
      variant="ghost"
      onClick={onToggle}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
