import { Check, ChevronDown, Download, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

import { FloatingNav } from "./components/floating-nav";
import { useThemePreference } from "./hooks/use-theme-preference";

const painPoints = [
  {
    title: "Tab roulette",
    body: "Your dev server, queue worker, tests, and database logs all live in separate terminal tabs.",
  },
  {
    title: "Blind agents",
    body: "AI tools generate against stale assumptions when they cannot see what is actually running.",
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

      <section className="relative isolate min-h-[100svh] overflow-hidden bg-[#155cff] px-4 pt-24 text-white dark:bg-[#0b3bb9]">
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.16)_1px,transparent_1px)] bg-[size:128px_128px] opacity-70" />
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle,rgba(255,255,255,0.28)_0_5px,transparent_6px)] bg-[size:128px_128px] opacity-50" />
        <div className="absolute bottom-0 left-0 right-0 -z-10 h-24 bg-[repeating-linear-gradient(135deg,rgba(255,255,255,0.18)_0_1px,transparent_1px_12px)] opacity-60" />

        <div className="mx-auto flex max-w-7xl flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 bg-white/12 px-3 py-2 text-sm shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]">
            <span className="grid size-5 place-items-center bg-white text-[#155cff]">
              <Check className="size-4" />
            </span>
            Not a process manager. On purpose.
          </div>

          <h1 className="mt-10 max-w-5xl text-balance text-[clamp(3.4rem,8vw,8.5rem)] font-semibold leading-[0.95] tracking-[-0.065em]">
            The workspace for your dev stack
          </h1>
          <p className="mt-7 max-w-2xl text-pretty text-xl leading-8 text-white/88">
            Run your app, workers, databases, tests, and agent sessions from one manifest-powered
            terminal workspace.
          </p>

          <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row">
            <a
              className="inline-flex min-w-48 items-center justify-center bg-white px-7 py-4 font-semibold text-[#155cff] shadow-[0_14px_40px_rgba(0,0,0,0.18)] transition hover:bg-[#edf3ff]"
              href="https://github.com/modoterra/stasium/releases/latest"
            >
              Download free
              <Download className="ml-2 size-4" />
            </a>
            <a
              className="inline-flex min-w-48 items-center justify-center bg-white/10 px-7 py-4 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.34)] transition hover:bg-white/15"
              href="https://github.com/modoterra/stasium"
            >
              View source
            </a>
          </div>

          <p className="mt-6 text-white/70">Need setup help? Browse the Stasium docs.</p>

          <div className="mt-20 w-full max-w-5xl translate-y-12 shadow-[0_34px_90px_rgba(0,0,0,0.26)]">
            <div className="flex items-center justify-between rounded-t-xl bg-[#f5f5f3] px-4 py-3 text-xs text-[#777] dark:bg-[#dfe2e7] dark:text-[#4c5360]">
              <div className="flex gap-2">
                <span className="size-3 rounded-full bg-[#ff5f57]" />
                <span className="size-3 rounded-full bg-[#febc2e]" />
                <span className="size-3 rounded-full bg-[#28c840]" />
              </div>
              <span className="font-['JetBrains_Mono_Variable']">stasium.io - workspace</span>
              <span>0.4.0</span>
            </div>
            <div className="grid min-h-[420px] bg-[#fbfbfa] text-left text-[#1f242d] md:grid-cols-[270px_1fr] dark:bg-[#f7f7f4]">
              <aside className="hidden bg-[#eef0f4] p-5 text-sm text-[#5c6575] md:block">
                <div className="mb-5 flex items-center gap-2 font-semibold text-[#151922]">
                  <span className="size-3 rounded-sm bg-[#155cff]" /> stasium.toml
                </div>
                {["web", "queue", "scheduler", "tests", "postgres", "redis"].map((item, index) => (
                  <div key={item} className="mb-4 flex items-center gap-3">
                    <span
                      className={
                        index === 3
                          ? "size-2 rounded-full bg-[#ee3d3d]"
                          : "size-2 rounded-full bg-[#39a84a]"
                      }
                    />
                    <span className="font-medium text-[#343b48]">{item}</span>
                  </div>
                ))}
              </aside>
              <div className="grid place-items-center p-8">
                <div className="w-full max-w-xl">
                  <p className="mb-6 text-center font-['JetBrains_Mono_Variable'] text-5xl font-bold tracking-[-0.12em] text-[#222]">
                    stasium
                  </p>
                  <div className="bg-[#eef0ea] p-5 font-['JetBrains_Mono_Variable'] text-sm text-[#4d5360] shadow-[inset_4px_0_0_#7d62d9]">
                    <p>Ask anything... "why did tests restart?"</p>
                    <p className="mt-4">
                      <span className="text-[#7d62d9]">Build</span> web queue postgres redis
                    </p>
                  </div>
                  <p className="mt-4 text-right font-['JetBrains_Mono_Variable'] text-xs text-[#6d7380]">
                    ctrl+t logs · tab services · ctrl+p commands
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="install" className="scroll-mt-28 bg-[#fbfbf7] px-4 pt-36 dark:bg-[#101113]">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto inline-flex items-center gap-2 bg-[#efefea] px-3 py-2 text-sm text-[#6a625d] dark:bg-white/10 dark:text-[#c9c2ba]">
              <Download className="size-4" /> Install
            </div>
            <h2 className="mt-7 text-balance text-[clamp(2.5rem,5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.06em]">
              Get Stasium onto your path.
            </h2>
          </div>
        </div>
      </section>

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
                Define your stack once. Start it once. Let agents inspect the output instead of
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
