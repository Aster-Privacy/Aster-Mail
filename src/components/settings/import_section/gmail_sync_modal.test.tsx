//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the AGPLv3 as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// AGPLv3 for more details.
//
// You should have received a copy of the AGPLv3
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const navigate_spy = vi.fn();

vi.mock("react-router-dom", () => ({
  useNavigate: () => navigate_spy,
}));

vi.mock("@/components/settings/external_accounts/gmail_wizard_host", () => ({
  GmailWizardHost: () => <div>gmail_wizard_host</div>,
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ModalBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

const { GmailSyncModal } = await import("./gmail_sync_modal");

let container: HTMLDivElement;
let root: Root;

async function render_modal(is_open: boolean, on_close = vi.fn()) {
  await act(async () => {
    root.render(<GmailSyncModal is_open={is_open} on_close={on_close} />);
  });

  return on_close;
}

describe("GmailSyncModal", () => {
  beforeEach(() => {
    navigate_spy.mockClear();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it("renders nothing while closed", async () => {
    await render_modal(false);

    expect(container.textContent).toBe("");
  });

  it("walks the user through every setup step instead of a file upload", async () => {
    await render_modal(true);

    const text = container.textContent ?? "";

    expect(text).toContain("settings.gmail_sync_title");
    for (const n of [1, 2, 3, 4]) {
      expect(text).toContain(`settings.gmail_sync_step_${n}`);
    }
    expect(text).not.toContain("import_manual");
  });

  it("says which Google accounts cannot use an app password", async () => {
    await render_modal(true);

    expect(container.textContent).toContain(
      "settings.gmail_sync_note_unavailable",
    );
  });

  it("links out to Google app passwords in a safe new tab", async () => {
    await render_modal(true);

    const link = container.querySelector("a");

    expect(link?.getAttribute("href")).toBe(
      "https://myaccount.google.com/apppasswords",
    );
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toContain("noreferrer");
    expect(link?.getAttribute("rel")).toContain("noopener");
  });

  it("opens the setup wizard in place instead of leaving the page", async () => {
    const on_close = await render_modal(true);

    const buttons = Array.from(container.querySelectorAll("button"));
    const continue_button = buttons.find((b) =>
      b.textContent?.includes("settings.gmail_sync_continue"),
    );

    expect(continue_button).toBeTruthy();

    await act(async () => {
      continue_button?.click();
    });

    expect(container.textContent).toContain("gmail_wizard_host");
    expect(container.textContent).not.toContain("settings.gmail_sync_title");
    expect(on_close).not.toHaveBeenCalled();
    expect(navigate_spy).not.toHaveBeenCalled();
  });

  it("closes without navigating when the user backs out", async () => {
    const on_close = await render_modal(true);

    const buttons = Array.from(container.querySelectorAll("button"));
    const cancel_button = buttons.find((b) =>
      b.textContent?.includes("common.cancel"),
    );

    await act(async () => {
      cancel_button?.click();
    });

    expect(on_close).toHaveBeenCalled();
    expect(navigate_spy).not.toHaveBeenCalled();
  });
});
