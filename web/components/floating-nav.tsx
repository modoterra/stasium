import { Download } from "lucide-react";

import { sectionNavItems } from "../data/navigation";
import { useActiveSection } from "../hooks/use-active-section";
import { ThemeToggle } from "./theme-toggle";

type FloatingNavProps = {
  isDark: boolean;
  onToggleTheme: () => void;
};

export function FloatingNav({ isDark, onToggleTheme }: FloatingNavProps) {
  const activeSection = useActiveSection(sectionNavItems.map((item) => item.id));

  return (
    <header className="fixed inset-x-0 top-3 z-50 px-3 sm:top-5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 bg-[#f7f2e8]/90 px-3 py-2 dark:bg-[#0c1017]/90">
        <a
          className="flex min-h-10 shrink-0 items-center px-3 text-sm font-semibold tracking-[-0.03em] transition hover:bg-black/5 sm:text-base dark:hover:bg-white/8"
          href="/"
        >
          <span>Stasium</span>
        </a>

        <nav
          className="hidden items-center gap-1 bg-black/[0.035] p-1 text-sm text-[#4f5d72] md:flex dark:bg-white/[0.06] dark:text-[#c9d3e3]"
          aria-label="Page sections"
        >
          {sectionNavItems.map((item) => {
            const isActive = activeSection === item.id;

            return (
              <a
                key={item.id}
                className={
                  isActive
                    ? "bg-[#155cff] px-4 py-2 font-medium text-white underline decoration-white decoration-2 underline-offset-4"
                    : "px-4 py-2 transition hover:bg-white/80 hover:text-[#155cff] dark:hover:bg-white/10 dark:hover:text-[#8ab2ff]"
                }
                aria-current={isActive ? "page" : undefined}
                href={`#${item.id}`}
              >
                {item.label}
              </a>
            );
          })}
          <a
            className="px-4 py-2 transition hover:bg-white/80 hover:text-[#155cff] dark:hover:bg-white/10 dark:hover:text-[#8ab2ff]"
            href="https://github.com/modoterra/stasium"
          >
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          <a
            className="hidden min-h-10 items-center bg-[#155cff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0047e8] sm:inline-flex"
            href="#install"
          >
            Install
            <Download className="ml-2 size-4" />
          </a>
        </div>
      </div>
    </header>
  );
}
