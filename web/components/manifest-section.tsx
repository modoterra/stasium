import { FileText } from "lucide-react";

import { manifestExample } from "../data/manifest-example";
import { CopyCommand } from "./copy-command";

export function ManifestSection() {
  return (
    <section id="manifest" className="scroll-mt-28 bg-[#fbfbf7] px-4 py-28 dark:bg-[#101113]">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div>
          <div className="inline-flex items-center gap-2 bg-[#efefea] px-3 py-2 text-sm text-[#6a625d] dark:bg-white/10 dark:text-[#c9c2ba]">
            <FileText className="size-4" /> Manifest
          </div>
          <h2 className="mt-7 text-balance text-[clamp(2.5rem,5vw,5rem)] font-semibold leading-[0.98] tracking-[-0.06em]">
            Nothing hidden.
          </h2>
          <p className="mt-6 max-w-2xl text-xl leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
            Choose the commands Discovery finds, and Stasium writes them down in plain TOML. Those
            accepted Candidates become Process Definitions in the Manifest.
          </p>
          <p className="mt-5 max-w-2xl text-lg leading-8 text-[#6f6862] dark:text-[#c8c1b8]">
            As your Project changes, edit the Manifest directly and keep local startup transparent.
          </p>
        </div>

        <div>
          <CopyCommand label="stasium.toml" command={manifestExample} />
          <p className="mt-4 text-sm leading-6 text-[#6f6862] dark:text-[#c8c1b8]">
            This tiny mixed-stack example uses the current schema: a Node web process plus a
            Laravel/PHP queue process with a Startup Dependency.
          </p>
        </div>
      </div>
    </section>
  );
}
