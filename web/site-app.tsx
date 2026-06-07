import { DetectsSection } from "./components/detects-section";
import { FloatingNav } from "./components/floating-nav";
import { Footer } from "./components/footer";
import { Hero } from "./components/hero";
import { InstallSection } from "./components/install-section";
import { ManifestSection } from "./components/manifest-section";
import { QuickstartSection } from "./components/quickstart-section";
import { useThemePreference } from "./hooks/use-theme-preference";

function SiteApp() {
  const { isDark, toggleTheme } = useThemePreference();

  return (
    <main className="min-h-[100svh] overflow-hidden bg-[#f2eee3] font-['Instrument_Sans_Variable'] text-[#161410] antialiased dark:bg-[#08090d] dark:text-[#f8f3e8]">
      <FloatingNav isDark={isDark} onToggleTheme={toggleTheme} />

      <Hero />

      <InstallSection />

      <QuickstartSection />

      <DetectsSection />

      <ManifestSection />

      <Footer />
    </main>
  );
}

export default SiteApp;
