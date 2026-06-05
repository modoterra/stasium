import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import SiteApp from "./site-app";

describe("SiteApp", () => {
  test("renders the current website shell", () => {
    render(<SiteApp />);

    expect(screen.getByText("Stasium")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /download free/i })).not.toHaveLength(0);
    expect(screen.getByText("The workspace for your dev stack")).toBeInTheDocument();
  });
});
