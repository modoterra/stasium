const footerLinks = [
  { label: "Modoterra", href: "https://modoterra.xyz" },
  { label: "X", href: "https://x.com/modoterra" },
  { label: "GitHub", href: "https://github.com/modoterra/stasium" },
];

export function Footer() {
  return (
    <footer className="bg-[#130f0b] px-4 py-8 text-[#bfb3a1] dark:bg-[#05070c]">
      <div className="mx-auto flex max-w-6xl flex-col gap-5 text-sm sm:flex-row sm:items-center sm:justify-between">
        <p>Built by Modoterra.</p>
        <nav className="flex flex-wrap gap-4" aria-label="Footer links">
          {footerLinks.map(({ label, href }) => (
            <a key={href} className="text-[#dfd4c4] hover:text-white" href={href}>
              {label}
            </a>
          ))}
        </nav>
      </div>
    </footer>
  );
}
