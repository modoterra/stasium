import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test } from "vitest";

import SiteApp from "./site-app";

describe("SiteApp", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
  });

  test("renders the current website shell", () => {
    render(<SiteApp />);

    expect(screen.getByText("Stasium")).toBeInTheDocument();
    const pageNav = screen.getByRole("navigation", { name: /page sections/i });

    expect(within(pageNav).getByRole("link", { name: /install/i })).toHaveAttribute(
      "href",
      "#install",
    );
    expect(within(pageNav).getByRole("link", { name: /install/i })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(pageNav).getByRole("link", { name: /install/i })).toHaveClass("underline");
    expect(within(pageNav).getByRole("link", { name: /quickstart/i })).toHaveAttribute(
      "href",
      "#quickstart",
    );
    expect(
      screen.getByRole("heading", { name: /replace npm run dev guesswork/i }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/agent/i)).not.toBeInTheDocument();
  });

  test("copy buttons expose specific accessible labels", () => {
    render(<SiteApp />);

    expect(
      screen.getByRole("button", { name: /copy after download on macos\/linux/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy first run/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /copy stasium.toml/i })).toBeInTheDocument();
  });

  test("toggles and persists dark mode", async () => {
    const user = userEvent.setup();
    render(<SiteApp />);

    await user.click(screen.getByRole("button", { name: /use dark mode/i }));

    await waitFor(() => expect(window.localStorage.getItem("stasium-theme")).toBe("dark"));
    expect(document.documentElement).toHaveClass("dark");
    expect(screen.getByRole("button", { name: /use light mode/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
