import { Check, Copy } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

type CopyCommandProps = {
  label: string;
  command: string;
};

export function CopyCommand({ label, command }: CopyCommandProps) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="overflow-hidden bg-[#111820] text-left text-[#fffdf7] dark:bg-[#111820] dark:text-[#fffdf7]">
      <div className="flex items-center justify-between gap-3 bg-white/[0.035] px-4 py-2.5 dark:bg-white/[0.035]">
        <p className="font-['JetBrains_Mono_Variable'] text-xs uppercase tracking-[0.12em] opacity-68">
          {label}
        </p>
        <Button
          className="h-7 bg-white/10 px-3 text-xs text-current [border-radius:0] hover:bg-white/18 dark:bg-white/12 dark:hover:bg-white/18"
          size="sm"
          variant="ghost"
          aria-label={copied ? `${label} copied` : `Copy ${label}`}
          onClick={copy}
        >
          {copied ? <Check className="mr-2 size-3" /> : <Copy className="mr-2 size-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap p-4 font-['JetBrains_Mono_Variable'] text-sm leading-6">
        <code>{command}</code>
      </pre>
    </div>
  );
}
