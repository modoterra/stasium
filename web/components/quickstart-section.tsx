import { Check, HelpCircle } from "lucide-react";

import { CopyCommand } from "./copy-command";

const firstRunSteps = [
  {
    title: "Discover",
    body: "No Manifest yet? Stasium opens Project Setup and scans your Project in Discovery, then suggests commands as proposed Candidates.",
  },
  {
    title: "Review",
    body: "Pick the commands you want in Candidate Selection. Approved Candidates become Process Definitions in the Manifest.",
  },
  {
    title: "Run",
    body: "Start everything with Startup. Stasium opens the Workspace, keeps Process Output visible, and leaves Shutdown ready when you are done.",
  },
];

export function QuickstartSection() {
  return (
    <section id="quickstart" className="scroll-mt-28 bg-[#fbfbf7] px-4 pt-24 dark:bg-[#101113]">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 bg-[#efefea] px-3 py-2 text-sm text-[#6a625d] dark:bg-white/10 dark:text-[#c9c2ba]">
            <Check className="size-4" /> Quickstart
          </div>
          <h2 className="mt-7 text-balance text-[clamp(2.5rem,5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.06em]">
            Run one command.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-xl leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
            Open a terminal in your Project and run Stasium. First run starts Project Setup; future
            runs reuse the Manifest.
          </p>
        </div>

        <div className="mx-auto mt-14 max-w-3xl">
          <CopyCommand label="First run" command="stasium" />
        </div>

        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {firstRunSteps.map((step, index) => (
            <article key={step.title} className="bg-white p-6 dark:bg-white/5">
              <p className="font-['JetBrains_Mono_Variable'] text-xs text-[#7b746d] dark:text-[#bfb7ae]">
                0{index + 1}
              </p>
              <h3 className="mt-10 text-2xl font-semibold tracking-[-0.04em]">{step.title}</h3>
              <p className="mt-4 text-lg leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
                {step.body}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-3 bg-[#efefea] p-5 text-[#4d453e] dark:bg-white/10 dark:text-[#d8d0c6] sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <HelpCircle className="size-5 text-[#155cff] dark:text-[#6ea0ff]" />
            <p>
              Need the command list? Run{" "}
              <span className="font-['JetBrains_Mono_Variable']">stasium help</span>.
            </p>
          </div>
          <p className="text-sm text-[#6f6862] dark:text-[#c8c1b8]">
            You can edit the Manifest later as the Project changes.
          </p>
        </div>
      </div>
    </section>
  );
}
