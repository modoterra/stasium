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
    <div className="bg-[#17130f] p-4 text-left text-[#fffdf7] dark:bg-[#f4efe4] dark:text-[#11110f]">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="font-['JetBrains_Mono_Variable'] text-xs uppercase tracking-[0.12em] opacity-70">
          {label}
        </p>
        <Button
          className="h-8 rounded-full bg-white/10 px-3 text-xs text-current hover:bg-white/20 dark:bg-black/10 dark:hover:bg-black/20"
          size="sm"
          variant="ghost"
          onClick={copy}
        >
          {copied ? <Check className="mr-2 size-3" /> : <Copy className="mr-2 size-3" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="overflow-x-auto whitespace-pre-wrap font-['JetBrains_Mono_Variable'] text-sm leading-7">
        <code>{command}</code>
      </pre>
    </div>
  );
}
