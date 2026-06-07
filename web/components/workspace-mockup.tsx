const managedProcesses = [
  { name: "web", state: "running", color: "bg-[#35b957]" },
  { name: "queue", state: "running", color: "bg-[#35b957]" },
  { name: "scheduler", state: "off", color: "bg-[#9aa0a6]" },
  { name: "tests", state: "crashed", color: "bg-[#ef3f3f]" },
  { name: "postgres", state: "ready", color: "bg-[#35b957]" },
  { name: "redis", state: "ready", color: "bg-[#35b957]" },
];

const outputLines = [
  "[startup] Discovery accepted 6 Process Definitions",
  "[web] Vite ready on http://localhost:5173",
  "[queue] processing default queue",
  "[tests] exited with code 1",
  "[shutdown] reverse Startup Dependency order ready",
];

export function WorkspaceMockup() {
  return (
    <div className="relative w-full max-w-5xl lg:translate-y-8">
      <div className="overflow-hidden bg-[#101722]">
        <div className="flex items-center justify-between bg-[#151f2b] px-4 py-3 text-xs text-[#9ba7b8]">
          <div className="flex gap-2">
            <span className="size-3 bg-[#ff5f57]" />
            <span className="size-3 bg-[#febc2e]" />
            <span className="size-3 bg-[#28c840]" />
          </div>
          <span className="font-['JetBrains_Mono_Variable']">stasium - Workspace</span>
          <span className="bg-white/8 px-2 py-1">0.4.0</span>
        </div>

        <div className="grid min-h-[420px] bg-[#0e141f] text-left text-[#dbe7f8] md:grid-cols-[270px_1fr]">
          <aside className="hidden bg-[#111925] p-5 text-sm text-[#9ba7b8] md:block">
            <div className="mb-5 flex items-center gap-2 font-semibold text-[#f5f8ff]">
              <span className="size-3 bg-[#155cff]" /> stasium.toml
            </div>
            {managedProcesses.map((process) => (
              <div key={process.name} className="mb-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className={`size-2 ${process.color}`} />
                  <span className="font-medium text-[#dbe7f8]">{process.name}</span>
                </div>
                <span className="font-['JetBrains_Mono_Variable'] text-[10px] uppercase text-[#8d99aa]">
                  {process.state}
                </span>
              </div>
            ))}
          </aside>

          <div className="grid content-between p-5 sm:p-8">
            <div>
              <p className="mb-8 text-center font-['JetBrains_Mono_Variable'] text-5xl font-bold tracking-[-0.12em] text-white">
                stasium
              </p>
              <div className="bg-[#0a0f17] p-5 font-['JetBrains_Mono_Variable'] text-sm leading-7 text-[#aeb9c8] shadow-[inset_4px_0_0_rgba(125,98,217,0.8)]">
                {outputLines.map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </div>
            </div>

            <p className="mt-8 text-right font-['JetBrains_Mono_Variable'] text-xs text-[#7f8b9c]">
              d discovery · s startup · x shutdown · ? help
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
