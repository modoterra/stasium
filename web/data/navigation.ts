export const sectionNavItems = [
  { id: "install", label: "Install" },
  { id: "quickstart", label: "Quickstart" },
  { id: "detects", label: "Detects" },
  { id: "manifest", label: "Manifest" },
] as const;

export const sectionIds = sectionNavItems.map((item) => item.id);
