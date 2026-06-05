import { Sparkles } from "lucide-react";

import { detectedStacks, dockerComposeVisibility, packageManagers } from "../data/detects";

export function DetectsSection() {
  return (
    <section id="detects" className="scroll-mt-28 bg-[#fbfbf7] px-4 pt-24 dark:bg-[#101113]">
      <div className="mx-auto max-w-7xl">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 bg-[#efefea] px-3 py-2 text-sm text-[#6a625d] dark:bg-white/10 dark:text-[#c9c2ba]">
            <Sparkles className="size-4" /> Detects common setups
          </div>
          <h2 className="mt-7 text-balance text-[clamp(2.5rem,5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.06em]">
            Shows what it finds.
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-xl leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
            Discovery looks for familiar Project files and proposes commands you can accept, edit,
            or skip before they become Manifest entries.
          </p>
        </div>

        <div className="mt-16 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {detectedStacks.map((stack) => (
            <article key={stack.title} className="bg-white p-6 dark:bg-white/5">
              <h3 className="text-2xl font-semibold tracking-[-0.04em]">{stack.title}</h3>
              <p className="mt-5 text-lg leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
                {stack.body}
              </p>
              <p className="mt-4 font-['JetBrains_Mono_Variable'] text-sm leading-6 text-[#7b746d] dark:text-[#bfb7ae]">
                {stack.detail}
              </p>
            </article>
          ))}
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="bg-[#155cff] p-6 text-white">
            <h3 className="text-2xl font-semibold tracking-[-0.04em]">Node package managers</h3>
            <p className="mt-5 text-lg leading-8 text-white/80">
              Node script proposals pick the package manager from lockfiles when available.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {packageManagers.map((manager) => (
                <span
                  key={manager}
                  className="bg-white/15 px-3 py-2 font-['JetBrains_Mono_Variable'] text-sm"
                >
                  {manager}
                </span>
              ))}
            </div>
          </article>

          <article className="bg-[#efefea] p-6 dark:bg-white/10">
            <h3 className="text-2xl font-semibold tracking-[-0.04em]">
              {dockerComposeVisibility.title}
            </h3>
            <p className="mt-5 text-lg leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
              {dockerComposeVisibility.body}
            </p>
          </article>
        </div>

        <div className="mt-5 border border-[#d8d2c8] bg-transparent p-6 dark:border-white/15">
          <h3 className="text-2xl font-semibold tracking-[-0.04em]">Don't see your stack?</h3>
          <p className="mt-4 text-lg leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
            Accept what Discovery finds, then add missing commands to the Manifest as your Project
            changes.
          </p>
        </div>
      </div>
    </section>
  );
}
