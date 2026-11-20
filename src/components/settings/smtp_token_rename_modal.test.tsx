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
  rename_smtp_token: vi.fn(),
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

vi.mock("@/services/api/client", () => ({ api_client: {} }));

vi.mock("@/services/api/domains", () => ({
  compute_address_hash: vi.fn(),
  encrypt_address_field: vi.fn(),
  decrypt_address_field: vi.fn(),
}));

vi.mock("@/services/api/smtp_tokens", async (import_original) => ({
  ...(await import_original<typeof import("@/services/api/smtp_tokens")>()),
  rename_smtp_token: h.rename_smtp_token,
}));

import type { SmtpToken } from "@/services/api/smtp_tokens";

import { SmtpTokenRenameModal } from "@/components/settings/smtp_token_rename_modal";

const token: SmtpToken = {
  id: "token-1",
  selector: "abcdefghijkl",
  name: "printer",
  bound_address: "me@example.com",
  is_active: true,
  last_used_at: null,
  expires_at: null,
  created_at: "2026-11-01T10:00:00Z",
  smtp_settings: null,
};

let container: HTMLDivElement;
let root: Root;
let on_close: () => void;
let on_renamed: (token_id: string, name: string) => void;

async function render_modal(value: SmtpToken | null = token) {
  await act(async () => {
    root.render(
      <SmtpTokenRenameModal
        token={value}
        on_close={on_close}
        on_renamed={on_renamed}
      />,
    );
  });
}

function name_input(): HTMLInputElement {
  return document.body.querySelector("input") as HTMLInputElement;
}

function save_button(): HTMLButtonElement {
  return Array.from(document.body.querySelectorAll("button")).find((b) =>
    b.textContent?.includes("common.save"),
  ) as HTMLButtonElement;
}

async function type_name(value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )?.set;

    setter?.call(name_input(), value);
    name_input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function click_save() {
  await act(async () => {
    save_button().dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

async function press_enter() {
  await act(async () => {
    name_input().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
    );
  });
}

describe("smtp token rename modal", () => {
  beforeEach(() => {
    h.rename_smtp_token.mockReset();
    h.show_toast.mockReset();
    on_close = vi.fn();
    on_renamed = vi.fn();
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("starts with the current name and nothing to save", async () => {
    await render_modal();

    expect(name_input().value).toBe("printer");
    expect(name_input().maxLength).toBe(64);
    expect(save_button().disabled).toBe(true);
  });

  it("saves a new name and reports it", async () => {
    h.rename_smtp_token.mockResolvedValue({ name: "scanner" });
    await render_modal();
    await type_name("  scanner ");
    await click_save();

    expect(h.rename_smtp_token).toHaveBeenCalledWith("token-1", "scanner");
    expect(on_renamed).toHaveBeenCalledWith("token-1", "scanner");
    expect(h.show_toast).toHaveBeenCalledWith(
      "settings.smtp_token_renamed_toast",
      "success",
    );
    expect(on_close).toHaveBeenCalled();
  });

  it("saves when enter is pressed", async () => {
    h.rename_smtp_token.mockResolvedValue({ name: "scanner" });
    await render_modal();
    await type_name("scanner");
    await press_enter();

    expect(h.rename_smtp_token).toHaveBeenCalledWith("token-1", "scanner");
  });

  it("does not save a blank name", async () => {
    await render_modal();
    await type_name("   ");

    expect(save_button().disabled).toBe(true);

    await press_enter();

    expect(h.rename_smtp_token).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain(
      "settings.smtp_token_rename_invalid",
    );
  });

  it("keeps the dialog open and explains when renaming is not available", async () => {
    h.rename_smtp_token.mockResolvedValue({ failure: "unavailable" });
    await render_modal();
    await type_name("scanner");
    await click_save();

    expect(document.body.textContent).toContain(
      "settings.smtp_token_rename_unavailable",
    );
    expect(on_renamed).not.toHaveBeenCalled();
    expect(on_close).not.toHaveBeenCalled();
    expect(name_input().value).toBe("scanner");
  });

  it("keeps the dialog open after a failed request", async () => {
    h.rename_smtp_token.mockResolvedValue({ failure: "failed" });
    await render_modal();
    await type_name("scanner");
    await click_save();

    expect(document.body.textContent).toContain(
      "settings.smtp_token_rename_failed",
    );
    expect(document.body.querySelector("[role=alert]")).toBeTruthy();
    expect(on_close).not.toHaveBeenCalled();
  });

  it("renders nothing without a token", async () => {
    await render_modal(null);

    expect(document.body.querySelector("input")).toBeNull();
  });
});
