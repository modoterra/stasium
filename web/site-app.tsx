import { DetectsSection } from "./components/detects-section";
import { FloatingNav } from "./components/floating-nav";
import { Hero } from "./components/hero";
import { InstallSection } from "./components/install-section";
import { ManifestSection } from "./components/manifest-section";
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

      <ManifestSection />
    </main>
  );
}

export default SiteApp;
