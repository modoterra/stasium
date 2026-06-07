import { manifestExample } from "../data/manifest-example";
import { CopyCommand } from "./copy-command";

export function ManifestSection() {
  return (
    <section
      id="manifest"
      className="scroll-mt-28 bg-[#130f0b] px-4 py-16 text-[#fff7e8] dark:bg-[#05070c]"
    >
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-[0.9fr_1.1fr] lg:items-start">
        <div className="flex flex-col gap-5">
          <h2 className="text-[clamp(1.9rem,4vw,3rem)] font-semibold leading-[1.05] tracking-[-0.045em] text-white">
            Nothing hidden.
          </h2>
          <div className="flex max-w-2xl flex-col gap-5 pt-1">
            <p className="text-base leading-7 text-[#dfd4c4]">
              Choose Discovery commands. Stasium writes plain TOML. Accepted Candidates become
              Process Definitions in the Manifest.
            </p>
            <p className="text-base leading-7 text-[#bfb3a1]">
              As your Project changes, edit the Manifest directly and keep local startup
              transparent.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <CopyCommand label="stasium.toml" command={manifestExample} />
          <p className="text-sm leading-6 text-[#bfb3a1]">
            This tiny mixed-stack example uses the current schema: a Node web process plus a
            Laravel/PHP queue process with a Startup Dependency.
          </p>
        </div>
      </div>
    </section>
  );
}
