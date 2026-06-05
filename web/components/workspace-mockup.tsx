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
    <div className="mt-20 w-full max-w-5xl translate-y-12 shadow-[0_34px_90px_rgba(0,0,0,0.26)]">
      <div className="flex items-center justify-between rounded-t-xl bg-[#f5f5f3] px-4 py-3 text-xs text-[#777] dark:bg-[#dfe2e7] dark:text-[#4c5360]">
        <div className="flex gap-2">
          <span className="size-3 rounded-full bg-[#ff5f57]" />
          <span className="size-3 rounded-full bg-[#febc2e]" />
          <span className="size-3 rounded-full bg-[#28c840]" />
        </div>
        <span className="font-['JetBrains_Mono_Variable']">stasium - Workspace</span>
        <span>0.4.0</span>
      </div>

      <div className="grid min-h-[420px] bg-[#fbfbfa] text-left text-[#1f242d] md:grid-cols-[270px_1fr] dark:bg-[#f7f7f4]">
        <aside className="hidden bg-[#eef0f4] p-5 text-sm text-[#5c6575] md:block">
          <div className="mb-5 flex items-center gap-2 font-semibold text-[#151922]">
            <span className="size-3 rounded-sm bg-[#155cff]" /> stasium.toml
          </div>
          {managedProcesses.map((process) => (
            <div key={process.name} className="mb-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <span className={`size-2 rounded-full ${process.color}`} />
                <span className="font-medium text-[#343b48]">{process.name}</span>
              </div>
              <span className="font-['JetBrains_Mono_Variable'] text-[10px] uppercase text-[#7b8494]">
                {process.state}
              </span>
            </div>
          ))}
        </aside>

        <div className="grid content-between p-8">
          <div>
            <p className="mb-8 text-center font-['JetBrains_Mono_Variable'] text-5xl font-bold tracking-[-0.12em] text-[#222]">
              stasium
            </p>
            <div className="bg-[#eef0ea] p-5 font-['JetBrains_Mono_Variable'] text-sm leading-7 text-[#4d5360] shadow-[inset_4px_0_0_#7d62d9]">
              {outputLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          </div>

          <p className="mt-8 text-right font-['JetBrains_Mono_Variable'] text-xs text-[#6d7380]">
            d discovery · s startup · x shutdown · ? help
          </p>
        </div>
      </div>
    </div>
  );
}
