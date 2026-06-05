import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { InstallSection } from "./install-section";

const setNavigator = (platform: string, userAgent: string) => {
  Object.defineProperty(window.navigator, "platform", {
    configurable: true,
    value: platform,
  });
  Object.defineProperty(window.navigator, "userAgent", {
    configurable: true,
    value: userAgent,
  });
};

describe("InstallSection", () => {
  beforeEach(() => {
    setNavigator("Linux x86_64", "X11; Linux x86_64");
  });

  test("shows recommended and manual release downloads", () => {
    render(<InstallSection />);

    expect(screen.getByRole("link", { name: /download for linux x64/i })).toHaveAttribute(
      "href",
      expect.stringContaining("stasium-linux-x64"),
    );
    expect(screen.getByRole("link", { name: /^macos$/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /linux arm64/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /windows/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /verify with checksums/i })).toHaveAttribute(
      "href",
      expect.stringContaining("checksums.txt"),
    );
  });

  test("copies source build instructions", async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);

    render(<InstallSection />);

    await user.click(screen.getByRole("button", { name: /copy build from source/i }));

    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("bun run build:cli"));
    await waitFor(() => expect(screen.getByText("Copied")).toBeInTheDocument());
  });
});
