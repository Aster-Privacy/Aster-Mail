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

import { CommandPalette } from "@/components/search/command_palette";
import { KEYBOARD_SHORTCUTS } from "@/constants/keyboard_shortcuts";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  logout: vi.fn(),
  emit_refresh_requested: vi.fn(),
  emit_mail_changed: vi.fn(),
  invalidate_mail_stats: vi.fn(),
  show_action_toast: vi.fn(),
  show_toast: vi.fn(),
}));

vi.mock("react-router-dom", () => ({
  useNavigate: () => mocks.navigate,
}));

vi.mock("@/contexts/theme_context", () => ({
  useTheme: () => ({ theme: "light", set_theme_preference: vi.fn() }),
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({ logout: mocks.logout }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {}, update_preferences: vi.fn() }),
}));

vi.mock("@/lib/theme_sync", () => ({
  build_theme_mode_update: () => ({}),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/components/ui/spinner", () => ({
  ButtonSpinner: () => null,
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

vi.mock("@/services/api/mail", () => ({
  empty_trash: vi.fn(),
}));

vi.mock("@/services/api/archive", () => ({
  batch_archive: vi.fn(),
  batch_unarchive: vi.fn(),
}));

vi.mock("@/hooks/email_list_cache", () => ({
  stale_all_view_caches: vi.fn(),
}));

vi.mock("@/hooks/use_folders", () => ({
  has_protected_folder_label: () => false,
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(),
  bulk_update_items_metadata: vi.fn(),
  bulk_update_metadata_by_ids: vi.fn(),
  create_default_metadata: vi.fn(),
}));

vi.mock("@/services/bulk_mail_scan", () => ({
  scan_received_items: vi.fn(),
  scan_encrypted_items: vi.fn(),
  DECRYPT_YIELD_CHUNK: 50,
}));

vi.mock("@/components/toast/action_toast", () => ({
  show_action_toast: mocks.show_action_toast,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: mocks.show_toast,
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  invalidate_mail_stats: mocks.invalidate_mail_stats,
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_refresh_requested: mocks.emit_refresh_requested,
  emit_mail_changed: mocks.emit_mail_changed,
}));

let container: HTMLDivElement;
let root: Root;
let on_close: ReturnType<typeof vi.fn<() => void>>;
let on_navigate: ReturnType<typeof vi.fn<(route: string) => void>>;

function render_palette(): void {
  act(() => {
    root.render(
      <CommandPalette
        is_open
        on_close={on_close}
        on_compose={vi.fn()}
        on_navigate={on_navigate}
        on_settings={vi.fn()}
        on_shortcuts={vi.fn()}
      />,
    );
  });
}

function input(): HTMLInputElement {
  return container.querySelector("input") as HTMLInputElement;
}

function type_query(value: string): void {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;

  act(() => {
    setter.call(input(), value);
    input().dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function press(key: string, init: KeyboardEventInit = {}): void {
  act(() => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
  });
}

function rows(): HTMLButtonElement[] {
  return Array.from(container.querySelectorAll("button[data-index]"));
}

function row(label_key: string): HTMLButtonElement {
  const found = rows().find((b) => b.textContent?.includes(label_key));

  if (!found) throw new Error(`missing row ${label_key}`);

  return found;
}

function hint(label_key: string): string | null {
  return row(label_key).querySelector("kbd")?.textContent ?? null;
}

function selected_row(): HTMLButtonElement | undefined {
  return rows().find((b) => b.className.includes("bg-[var(--aster-floating"));
}

beforeEach(() => {
  vi.clearAllMocks();
  on_close = vi.fn<() => void>();
  on_navigate = vi.fn<(route: string) => void>();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("CommandPalette", () => {
  it("refreshes the mail list when Refresh inbox is chosen with Enter", () => {
    render_palette();
    type_query("refresh");
    press("Enter");

    expect(mocks.emit_refresh_requested).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate_mail_stats).toHaveBeenCalledTimes(1);
    expect(mocks.show_action_toast).toHaveBeenCalledWith(
      expect.objectContaining({ message: "common.inbox_refreshed" }),
    );
    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("refreshes the mail list when Refresh inbox is clicked", () => {
    render_palette();
    act(() => row("common.refresh_inbox").click());

    expect(mocks.emit_refresh_requested).toHaveBeenCalledTimes(1);
    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("shows the real keyboard shortcut next to each command", () => {
    render_palette();

    expect(hint("common.refresh_inbox")).toBeNull();
    expect(hint("mail.open_settings")).toBeNull();
    expect(hint("common.compose_new_email")).toBe("C");
    expect(hint("mail.go_to_inbox")).toBe("G I");
    expect(hint("mail.go_to_starred")).toBe("G S");
    expect(hint("mail.go_to_sent")).toBe("G T");
    expect(hint("mail.go_to_drafts")).toBe("G D");
    expect(hint("mail.go_to_all_mail")).toBe("G A");
    expect(hint("common.keyboard_shortcuts")).toBe("?");
  });

  it("never shows a hint that the shortcut handler does not support", () => {
    render_palette();
    const supported = new Set(
      KEYBOARD_SHORTCUTS.filter((s) => !s.modifier).map((s) =>
        s.key.toUpperCase(),
      ),
    );
    const hints = rows()
      .map((b) => b.querySelector("kbd")?.textContent)
      .filter((h): h is string => !!h);

    expect(hints.length).toBeGreaterThan(0);
    for (const h of hints) {
      expect(supported.has(h)).toBe(true);
    }
  });

  it("navigates through the page handler so open mail closes too", () => {
    render_palette();
    act(() => row("mail.go_to_all_mail").click());

    expect(on_navigate).toHaveBeenCalledWith("/all");
    expect(mocks.navigate).not.toHaveBeenCalled();
    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("matches a query with surrounding spaces", () => {
    render_palette();
    type_query("  refresh  ");

    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain("common.refresh_inbox");
  });

  it("wraps the selection with the arrow keys", () => {
    render_palette();
    const total = rows().length;

    press("ArrowUp");
    expect(selected_row()?.dataset.index).toBe(String(total - 1));
    press("ArrowDown");
    expect(selected_row()?.dataset.index).toBe("0");
  });

  it("does nothing on arrows or Enter when no command matches", () => {
    render_palette();
    type_query("zzzz-no-match");
    press("ArrowDown");
    press("ArrowUp");
    press("Enter");

    expect(rows()).toHaveLength(0);
    expect(on_close).not.toHaveBeenCalled();
    type_query("");
    expect(selected_row()?.dataset.index).toBe("0");
  });

  it("ignores Enter while an input method is composing text", () => {
    render_palette();
    type_query("refresh");
    press("Enter", { isComposing: true });

    expect(mocks.emit_refresh_requested).not.toHaveBeenCalled();
  });

  it("runs a slow command only once when Enter is pressed twice", async () => {
    let finish: () => void = () => {};

    mocks.logout.mockImplementation(
      () => new Promise<void>((resolve) => (finish = resolve)),
    );
    render_palette();
    type_query("mail.log_out_label");
    press("Enter");
    press("Enter");

    expect(mocks.logout).toHaveBeenCalledTimes(1);
    await act(async () => finish());
    expect(mocks.navigate).toHaveBeenCalledWith("/sign-in");
  });

  it("shows an error instead of failing silently when a command throws", async () => {
    mocks.logout.mockRejectedValue(new Error("offline"));
    render_palette();
    type_query("mail.log_out_label");
    await act(async () => {
      press("Enter");
    });

    expect(mocks.show_toast).toHaveBeenCalledWith(
      "common.something_went_wrong",
      "error",
    );
  });
});
