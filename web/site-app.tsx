import { Check, ChevronDown, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

import { FloatingNav } from "./components/floating-nav";
import { Hero } from "./components/hero";
import { InstallSection } from "./components/install-section";
import { useThemePreference } from "./hooks/use-theme-preference";

const painPoints = [
  {
    title: "Tab roulette",
    body: "Your dev server, queue worker, tests, and database logs all live in separate terminal tabs.",
  },
  {
    title: "Scattered output",
    body: "Process Output split across terminals makes it hard to see what changed and what failed.",
  },
  {
    title: "Unknown state",
    body: "Green, red, crashed, idle. Stasium keeps local process state visible in one terminal.",
  },
];

const services = [
  { name: "web", state: "running", color: "bg-[#35b957]" },
  { name: "queue", state: "running", color: "bg-[#35b957]" },
  { name: "tests", state: "crashed", color: "bg-[#ef3f3f]" },
  { name: "postgres", state: "ready", color: "bg-[#35b957]" },
];

function SiteApp() {
  const { isDark, toggleTheme } = useThemePreference();

  return (
    <main className="min-h-[100svh] bg-[#f8f8f4] font-['Instrument_Sans_Variable'] text-[#211f1d] antialiased dark:bg-[#101113] dark:text-[#f7f2e8]">
      <FloatingNav isDark={isDark} onToggleTheme={toggleTheme} />

      <Hero />

      <InstallSection />

      <section id="quickstart" className="scroll-mt-28 bg-[#fbfbf7] px-4 pt-24 dark:bg-[#101113]">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 bg-[#efefea] px-3 py-2 text-sm text-[#6a625d] dark:bg-white/10 dark:text-[#c9c2ba]">
              <Check className="size-4" /> Quickstart
            </div>
            <h2 className="mt-7 text-balance text-[clamp(2.5rem,5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.06em]">
              Run one command.
            </h2>
          </div>
        </div>
      </section>

      <section id="detects" className="scroll-mt-28 bg-[#fbfbf7] px-4 pt-24 dark:bg-[#101113]">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 bg-[#efefea] px-3 py-2 text-sm text-[#6a625d] dark:bg-white/10 dark:text-[#c9c2ba]">
              <Sparkles className="size-4" /> The issue
            </div>
            <h2 className="mt-7 text-balance text-[clamp(2.5rem,5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.06em]">
              Your local stack needs one home.
            </h2>
            <p className="mt-6 text-pretty text-xl leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
              Stasium gives every process a place: status, logs, restart behavior, startup order,
              and shutdown all move together.
            </p>
          </div>

          <div className="mt-20 grid gap-4 md:grid-cols-3">
            {painPoints.map((point) => (
              <article
                key={point.title}
                className="bg-white p-8 shadow-[0_1px_0_rgba(0,0,0,0.08)] dark:bg-white/5 dark:shadow-none"
              >
                <h3 className="text-2xl font-semibold tracking-[-0.04em]">{point.title}</h3>
                <p className="mt-5 text-lg leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
                  {point.body}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-24 grid items-center gap-12 lg:grid-cols-[1fr_0.8fr]">
            <div>
              <div className="inline-flex items-center gap-2 bg-[#efefea] px-3 py-2 text-sm text-[#6a625d] dark:bg-white/10 dark:text-[#c9c2ba]">
                <Check className="size-4" /> The fix
              </div>
              <h2 className="mt-7 max-w-3xl text-balance text-[clamp(2.8rem,6vw,6rem)] font-semibold leading-[0.96] tracking-[-0.065em]">
                One terminal. Full visibility.
              </h2>
              <p className="mt-8 max-w-2xl text-xl leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
                Define your stack once. Start it once. Keep Process Output visible instead of
                guessing whether the world is on fire.
              </p>
            </div>

            <div className="bg-white p-5 shadow-[0_24px_70px_rgba(0,0,0,0.12)] dark:bg-[#17191d]">
              {services.map((service) => (
                <div key={service.name} className="flex items-center justify-between py-4">
                  <div className="flex items-center gap-3">
                    <span className={`size-2 rounded-full ${service.color}`} />
                    <span className="text-xl font-semibold tracking-[-0.04em]">{service.name}</span>
                  </div>
                  <span className="font-['JetBrains_Mono_Variable'] text-sm text-[#7b746d] dark:text-[#bfb7ae]">
                    {service.state}
                  </span>
                </div>
              ))}
              <Button
                className="mt-4 w-full rounded-none bg-[#155cff] text-white hover:bg-[#0047e8]"
                size="lg"
              >
                Start workspace
                <ChevronDown className="ml-2 size-4" />
              </Button>
            </div>
          </div>
        </div>
      </section>

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
