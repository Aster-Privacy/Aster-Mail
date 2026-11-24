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

const h = vi.hoisted(() => ({
  copy_text: vi.fn(),
  show_toast: vi.fn(),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@aster/ui", async (import_original) => ({
  ...(await import_original<typeof import("@aster/ui")>()),
  Button: ({
    children,
    onClick,
    disabled,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
    className?: string;
  }) => (
    <button className={className} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
}));

vi.mock("@/provider", () => ({ use_should_reduce_motion: () => true }));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: h.show_toast,
}));

vi.mock("@/utils/copy_text", () => ({ copy_text: h.copy_text }));

import type { SmtpToken } from "@/services/api/smtp_tokens";

import { SmtpTokenDetailsModal } from "@/components/settings/smtp_token_details_modal";

const token = (overrides: Partial<SmtpToken> = {}): SmtpToken => ({
  id: "token-1",
  selector: "abcdefghijkl",
  name: "printer",
  bound_address: "me@example.com",
  is_active: true,
  last_used_at: null,
  expires_at: null,
  created_at: "2026-11-01T10:00:00Z",
  smtp_settings: {
    host: "smtp.astermail.org",
    port: 587,
    security: "STARTTLS",
    username: "asmtp_abcdefghijkl",
  },
  ...overrides,
});

let container: HTMLDivElement;
let root: Root;

async function render_modal(value: SmtpToken | null, on_close = () => {}) {
  await act(async () => {
    root.render(<SmtpTokenDetailsModal token={value} on_close={on_close} />);
  });
}

function buttons(): HTMLButtonElement[] {
  return Array.from(document.body.querySelectorAll("button"));
}

describe("smtp token details modal", () => {
  beforeEach(() => {
    h.copy_text.mockReset();
    h.show_toast.mockReset();
    h.copy_text.mockResolvedValue(true);
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows the connection values and a hidden password", async () => {
    await render_modal(token());

    const text = document.body.textContent ?? "";

    expect(text).toContain("smtp.astermail.org");
    expect(text).toContain("587");
    expect(text).toContain("STARTTLS");
    expect(text).toContain("asmtp_abcdefghijkl");
    expect(text).toContain("settings.smtp_token_password_hidden");
    expect(text).toContain("settings.smtp_token_password_hidden_note");
  });

  it("offers no copy control for the password", async () => {
    await render_modal(token());

    const password_control = buttons().find((b) =>
      b.textContent?.includes("settings.smtp_token_password_hidden"),
    );

    expect(password_control).toBeUndefined();
  });

  it("labels each copy control with the value it copies", async () => {
    await render_modal(token());

    const labels = buttons().map((b) => b.getAttribute("aria-label"));

    expect(labels).toContain("common.copy settings.smtp_token_host");
    expect(labels).toContain("common.copy settings.smtp_token_username");
  });

  it("copies a single value when its row is clicked", async () => {
    await render_modal(token());

    const row = buttons().find((b) =>
      b.textContent?.includes("asmtp_abcdefghijkl"),
    );

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(h.copy_text).toHaveBeenCalledWith("asmtp_abcdefghijkl");
    expect(h.show_toast).toHaveBeenCalledWith(
      "common.copied_to_clipboard",
      "success",
    );
  });

  it("copies the four values without a password line", async () => {
    await render_modal(token());

    const copy_all = buttons().find((b) =>
      b.textContent?.includes("settings.smtp_token_copy_all"),
    );

    await act(async () => {
      copy_all?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(h.copy_text).toHaveBeenCalledWith(
      [
        "settings.smtp_token_host: smtp.astermail.org",
        "settings.smtp_token_port: 587",
        "settings.smtp_token_security: STARTTLS",
        "settings.smtp_token_username: asmtp_abcdefghijkl",
      ].join(String.fromCharCode(10)),
    );
  });

  it("reports a failed copy", async () => {
    h.copy_text.mockResolvedValue(false);
    await render_modal(token());

    const row = buttons().find((b) =>
      b.textContent?.includes("smtp.astermail.org"),
    );

    await act(async () => {
      row?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(h.show_toast).toHaveBeenCalledWith("common.failed_to_copy", "error");
  });

  it("stays closed when the token has no settings", async () => {
    await render_modal(token({ smtp_settings: null }));

    expect(document.body.textContent).not.toContain(
      "settings.smtp_token_details_title",
    );
  });
});
