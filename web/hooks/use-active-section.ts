import { useEffect, useMemo, useState } from "react";

export function useActiveSection(sectionIds: readonly string[]) {
  const [activeSection, setActiveSection] = useState(sectionIds[0] ?? "");
  const observerKey = useMemo(() => sectionIds.join("|"), [sectionIds]);

  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;

    const visibleSections = new Map<string, IntersectionObserverEntry>();
    const sectionOrder = new Map(sectionIds.map((sectionId, index) => [sectionId, index]));

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting && entry.target.id) {
            visibleSections.set(entry.target.id, entry);
          } else {
            visibleSections.delete(entry.target.id);
          }
        }

        const anchorY = window.innerHeight * 0.35;
        const visible = [...visibleSections.values()].sort((a, b) => {
          const distanceA = Math.abs(a.boundingClientRect.top - anchorY);
          const distanceB = Math.abs(b.boundingClientRect.top - anchorY);

          if (distanceA !== distanceB) return distanceA - distanceB;

          return (sectionOrder.get(a.target.id) ?? 0) - (sectionOrder.get(b.target.id) ?? 0);
        })[0];

        if (visible?.target.id) {
          setActiveSection(visible.target.id);
        }
      },
      {
        rootMargin: "-30% 0px -55% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    for (const sectionId of sectionIds) {
      const section = document.getElementById(sectionId);
      if (section) observer.observe(section);
    }

    return () => observer.disconnect();
  }, [observerKey, sectionIds]);

  return activeSection;
}
