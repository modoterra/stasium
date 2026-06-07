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
      className="size-10 !rounded-none bg-transparent p-0 text-[#263248] hover:bg-black/[0.06] dark:text-[#f7f2e8] dark:hover:bg-white/[0.08]"
      size="icon"
      variant="ghost"
      onClick={onToggle}
    >
      {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </Button>
  );
}
