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
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const h = vi.hoisted(() => ({
  editor: {
    format_state: {
      active_formats: new Set<string>(),
      is_in_blockquote: false,
    },
    is_mac: false,
    insert_link: vi.fn(),
    insert_html: vi.fn(),
    insert_blockquote: vi.fn(),
    insert_horizontal_rule: vi.fn(),
    toggle_bold: vi.fn(),
    toggle_italic: vi.fn(),
    toggle_underline: vi.fn(),
    toggle_strikethrough: vi.fn(),
    toggle_ordered_list: vi.fn(),
    toggle_unordered_list: vi.fn(),
    save_selection: vi.fn(),
    get_html: vi.fn(() => ""),
    set_html: vi.fn(),
    handle_input: vi.fn(),
    handle_paste: vi.fn(),
    handle_drop: vi.fn(),
    handle_drag_over: vi.fn(),
  },
  api: {
    list_signatures: vi.fn(),
    create_signature: vi.fn(),
    update_signature: vi.fn(),
    delete_signature: vi.fn(),
    set_default_signature: vi.fn(),
  },
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  }),
}));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: React.ReactNode }) => (
          <div {...rest}>{children}</div>
        ),
    },
  ),
  AnimatePresence: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

vi.mock("@aster/ui", () => ({
  Button: ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    disabled?: boolean;
  }) => (
    <button disabled={disabled} onClick={onClick}>
      {children}
    </button>
  ),
  Radio: () => <input type="radio" />,
  UpgradeBtn: ({ children }: { children: React.ReactNode }) => (
    <button>{children}</button>
  ),
}));

vi.mock("@/components/ui/modal", () => ({
  Modal: ({
    is_open,
    children,
  }: {
    is_open: boolean;
    children: React.ReactNode;
  }) => (is_open ? <div data-testid="modal">{children}</div> : null),
  ModalHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalTitle: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalBody: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  ModalFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/select", () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  SelectItem: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: Record<string, unknown>) => <input {...props} />,
}));

vi.mock("@/components/ui/spinner", () => ({
  Spinner: () => <span />,
}));

vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));

vi.mock("@/components/settings/settings_skeleton", () => ({
  SettingsSkeleton: () => <div data-testid="skeleton" />,
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: {
      signature_mode: "auto",
      signature_placement: "below",
      show_badges_in_signature: false,
      show_signature_separator: true,
      show_aster_branding: false,
    },
    update_preference: vi.fn(),
  }),
}));

vi.mock("@/contexts/signatures_context", () => ({
  use_signatures: () => ({ reload_signatures: vi.fn() }),
}));

vi.mock("@/hooks/use_editor", () => ({
  use_editor: () => h.editor,
}));

vi.mock("@/components/compose/link_dialog", () => ({
  LinkDialog: ({
    open,
    on_insert,
  }: {
    open: boolean;
    on_insert: (url: string, text?: string) => void;
  }) =>
    open ? (
      <button
        data-testid="do-insert-link"
        onClick={() => on_insert("https://example.com", "Example")}
      >
        confirm-link
      </button>
    ) : null,
}));

vi.mock("@/lib/html_sanitizer", () => ({
  sanitize_compose_paste: (s: string) => s,
}));

vi.mock("@/services/api/signatures", () => h.api);
vi.mock("@/services/api/user", () => ({
  fetch_my_badges: vi.fn(() => Promise.resolve({ data: [] })),
}));
vi.mock("@/hooks/use_plan_limits", () => ({
  use_plan_limits: () => ({ limits: { plan_code: "free" }, is_loading: false }),
}));
vi.mock("@/hooks/use_sender_aliases", () => ({
  use_sender_aliases: () => ({ sender_options: [] }),
  is_signature_bindable_sender: (o: { type: string; is_enabled: boolean }) =>
    ["alias", "domain", "ghost"].includes(o.type) && o.is_enabled,
  is_signature_bindable_sender_type: (t: string) =>
    ["alias", "domain", "ghost"].includes(t),
}));
vi.mock("@/components/settings/aliases/feature_lock", () => ({
  go_to_billing: vi.fn(),
}));

import { SignatureSection } from "./signature_section";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.editor.format_state = {
    active_formats: new Set<string>(),
    is_in_blockquote: false,
  };
  h.api.list_signatures.mockResolvedValue({ data: { signatures: [] } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.clearAllMocks();
});

function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

async function render() {
  await act(async () => {
    root.render(<SignatureSection />);
    await flush();
  });
  act(() => {});
}

function button_by_title_prefix(prefix: string): HTMLButtonElement | undefined {
  return Array.from(container.querySelectorAll("button")).find((b) =>
    (b.getAttribute("title") ?? "").startsWith(prefix),
  ) as HTMLButtonElement | undefined;
}

async function open_editor() {
  const add = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("settings.add_signature"),
  ) as HTMLButtonElement;
  act(() => add.click());
  await flush();
  act(() => {});
}

describe("SignatureSection toolbar (compose parity)", () => {
  it("renders the full compose formatting toolbar in the signature editor", async () => {
    await render();
    await open_editor();

    const titles = [
      "mail.bold",
      "mail.italic",
      "mail.underline",
      "mail.strikethrough",
      "mail.bullet_list",
      "mail.numbered_list",
      "mail.blockquote",
      "mail.insert_link",
      "mail.horizontal_rule",
      "mail.insert_image",
    ];

    for (const title of titles) {
      expect(
        button_by_title_prefix(title),
        `toolbar button "${title}" should be present`,
      ).toBeTruthy();
    }
  });

  it("wires the formatting buttons to the editor instance", async () => {
    await render();
    await open_editor();

    act(() => button_by_title_prefix("mail.bold")!.click());
    expect(h.editor.toggle_bold).toHaveBeenCalled();

    act(() => button_by_title_prefix("mail.strikethrough")!.click());
    expect(h.editor.toggle_strikethrough).toHaveBeenCalled();

    act(() => button_by_title_prefix("mail.bullet_list")!.click());
    expect(h.editor.toggle_unordered_list).toHaveBeenCalled();

    act(() => button_by_title_prefix("mail.numbered_list")!.click());
    expect(h.editor.toggle_ordered_list).toHaveBeenCalled();

    act(() => button_by_title_prefix("mail.blockquote")!.click());
    expect(h.editor.insert_blockquote).toHaveBeenCalled();

    act(() => button_by_title_prefix("mail.horizontal_rule")!.click());
    expect(h.editor.insert_horizontal_rule).toHaveBeenCalled();
  });

  it("inserts a link through the dialog into the editor", async () => {
    await render();
    await open_editor();

    act(() => button_by_title_prefix("mail.insert_link")!.click());
    expect(h.editor.save_selection).toHaveBeenCalled();
    await flush();

    const confirm = container.querySelector(
      '[data-testid="do-insert-link"]',
    ) as HTMLButtonElement;
    expect(confirm).toBeTruthy();
    act(() => confirm.click());

    expect(h.editor.insert_link).toHaveBeenCalledWith(
      "https://example.com",
      "Example",
    );
  });
});
