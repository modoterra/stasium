import { detectedStacks, dockerComposeVisibility, packageManagers } from "../data/detects";

export function DetectsSection() {
  return (
    <section id="detects" className="scroll-mt-28 bg-[#f2eee3] px-4 py-16 dark:bg-[#08090d]">
      <div className="mx-auto max-w-6xl">
        <div className="flex max-w-3xl flex-col gap-5">
          <h2 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.045em]">
            Shows what it finds.
          </h2>
          <p className="max-w-2xl pt-1 text-base leading-7 text-[#6f6862] dark:text-[#c8c1b8]">
            Discovery proposes commands you can accept, edit, or skip.
          </p>
        </div>

        <div className="mt-10 grid gap-4 md:grid-cols-2">
          {detectedStacks.map((stack) => (
            <article
              key={stack.title}
              className="flex flex-col gap-4 bg-[#f7f1e6] p-5 dark:bg-white/[0.04]"
            >
              <div className="flex flex-col gap-4">
                <h3 className="text-xl font-semibold tracking-[-0.035em]">{stack.title}</h3>
                <p className="text-base leading-7 text-[#6f6862] dark:text-[#c8c1b8]">
                  {stack.body}
                </p>
                <p className="font-['JetBrains_Mono_Variable'] text-sm leading-6 text-[#7b746d] dark:text-[#bfb7ae]">
                  {stack.detail}
                </p>
              </div>
            </article>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="relative flex flex-col gap-4 overflow-hidden bg-[#155cff] p-5 text-white">
            <h3 className="text-xl font-semibold tracking-[-0.035em]">Node package managers</h3>
            <p className="text-base leading-7 text-white/80">
              Node script proposals pick the package manager from lockfiles when available.
            </p>
            <div className="flex flex-wrap gap-2">
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

          <article className="flex flex-col gap-4 bg-[#e5ddcf] p-5 dark:bg-white/[0.05]">
            <h3 className="text-xl font-semibold tracking-[-0.035em]">
              {dockerComposeVisibility.title}
            </h3>
            <p className="text-base leading-7 text-[#6f6862] dark:text-[#c8c1b8]">
              {dockerComposeVisibility.body}
            </p>
          </article>
        </div>

        <div className="mt-4 flex flex-col gap-3 bg-[#ece6da] p-5 dark:bg-white/[0.035]">
          <h3 className="text-xl font-semibold tracking-[-0.035em]">Don't see your stack?</h3>
          <p className="text-base leading-7 text-[#6f6862] dark:text-[#c8c1b8]">
            Accept what Discovery finds, then add missing commands to the Manifest as your Project
            changes.
          </p>
        </div>
      </div>
    </section>
  );
}
