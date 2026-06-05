import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { QuickstartSection } from "./quickstart-section";

describe("QuickstartSection", () => {
  test("teaches stasium as the only primary quickstart command", () => {
    render(<QuickstartSection />);

    expect(screen.getByText("stasium")).toBeInTheDocument();
    expect(screen.queryByText("stasium init")).not.toBeInTheDocument();
  });

  test("explains the first-run flow and help command", () => {
    render(<QuickstartSection />);

    expect(screen.getByText("Discover")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Run")).toBeInTheDocument();
    for (const term of [
      /Project Setup/i,
      /proposed Candidates/i,
      /Candidate Selection/i,
      /Process Definitions/i,
      /Startup/i,
      /Workspace/i,
      /Process Output/i,
      /Shutdown/i,
    ]) {
      expect(screen.getAllByText(term).length).toBeGreaterThan(0);
    }
    expect(screen.getByText(/stasium help/i)).toBeInTheDocument();
    expect(screen.getByText(/edit the Manifest later/i)).toBeInTheDocument();
  });
});
