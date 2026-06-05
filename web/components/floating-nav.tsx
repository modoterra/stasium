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
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 rounded-full bg-[#fbfbf7]/90 px-3 py-2 shadow-[0_12px_40px_rgba(21,35,71,0.16)] backdrop-blur dark:bg-[#101113]/90 dark:shadow-[0_12px_40px_rgba(0,0,0,0.35)]">
        <a
          className="flex shrink-0 items-center gap-2 text-sm font-semibold tracking-[-0.03em] sm:text-base"
          href="/"
        >
          <img
            className="size-7 object-contain"
            src={isDark ? "/stasium-logo-dark.png" : "/stasium-logo-light.png"}
            alt=""
          />
          <span>Stasium</span>
        </a>

        <nav
          className="hidden items-center gap-1 text-sm text-[#42516b] md:flex dark:text-[#c8d2e4]"
          aria-label="Page sections"
        >
          {sectionNavItems.map((item) => {
            const isActive = activeSection === item.id;

            return (
              <a
                key={item.id}
                className={
                  isActive
                    ? "rounded-full bg-[#155cff] px-4 py-2 font-medium text-white underline decoration-white decoration-2 underline-offset-4"
                    : "rounded-full px-4 py-2 hover:bg-[#eef1f7] hover:text-[#155cff] dark:hover:bg-white/10 dark:hover:text-[#6ea0ff]"
                }
                href={`#${item.id}`}
              >
                {item.label}
              </a>
            );
          })}
          <a
            className="rounded-full px-4 py-2 hover:bg-[#eef1f7] hover:text-[#155cff] dark:hover:bg-white/10 dark:hover:text-[#6ea0ff]"
            href="https://github.com/modoterra/stasium"
          >
            GitHub
          </a>
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle isDark={isDark} onToggle={onToggleTheme} />
          <a
            className="hidden items-center rounded-full bg-[#155cff] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0047e8] sm:inline-flex"
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
