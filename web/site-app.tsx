import { Check } from "lucide-react";

import { DetectsSection } from "./components/detects-section";
import { FloatingNav } from "./components/floating-nav";
import { Hero } from "./components/hero";
import { InstallSection } from "./components/install-section";
import { QuickstartSection } from "./components/quickstart-section";
import { useThemePreference } from "./hooks/use-theme-preference";

function SiteApp() {
  const { isDark, toggleTheme } = useThemePreference();

  return (
    <main className="min-h-[100svh] bg-[#f8f8f4] font-['Instrument_Sans_Variable'] text-[#211f1d] antialiased dark:bg-[#101113] dark:text-[#f7f2e8]">
      <FloatingNav isDark={isDark} onToggleTheme={toggleTheme} />

      <Hero />

      <InstallSection />

      <QuickstartSection />

      <DetectsSection />

      <section id="manifest" className="scroll-mt-28 bg-[#fbfbf7] px-4 py-28 dark:bg-[#101113]">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 bg-[#efefea] px-3 py-2 text-sm text-[#6a625d] dark:bg-white/10 dark:text-[#c9c2ba]">
              <Check className="size-4" /> Manifest
            </div>
            <h2 className="mt-7 text-balance text-[clamp(2.5rem,5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.06em]">
              Stasium writes down what it finds.
            </h2>
          </div>
        </div>
      </section>
    </main>
  );
}

export default SiteApp;
