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
  reload_signatures: vi.fn(),
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
    t: (key: string) => key,
  }),
}));

const MOTION_ONLY_PROPS = vi.hoisted(() => new Set([
  "initial",
  "animate",
  "exit",
  "transition",
  "variants",
  "layout",
  "layoutId",
  "whileHover",
  "whileTap",
  "whileFocus",
  "whileDrag",
  "whileInView",
  "viewport",
  "drag",
  "dragConstraints",
  "onAnimationStart",
  "onAnimationComplete",
]));

vi.mock("framer-motion", () => ({
  motion: new Proxy(
    {},
    {
      get:
        () =>
        ({ children, ...rest }: { children?: React.ReactNode }) => (
          <div
            {...Object.fromEntries(
              Object.entries(rest).filter(
                ([key]) => !MOTION_ONLY_PROPS.has(key),
              ),
            )}
          >
            {children}
          </div>
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
  use_signatures: () => ({ reload_signatures: h.reload_signatures }),
}));

vi.mock("@/hooks/use_editor", () => ({
  use_editor: () => ({
    format_state: { active_formats: new Set<string>(), is_in_blockquote: false },
    is_mac: false,
    get_html: () => "",
    set_html: vi.fn(),
    handle_input: vi.fn(),
    handle_paste: vi.fn(),
    handle_drop: vi.fn(),
    handle_drag_over: vi.fn(),
    save_selection: vi.fn(),
  }),
}));

vi.mock("@/components/compose/link_dialog", () => ({
  LinkDialog: () => null,
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
  is_signature_bindable_sender: () => false,
  is_signature_bindable_sender_type: () => false,
}));
vi.mock("@/components/settings/aliases/feature_lock", () => ({
  prompt_upgrade: vi.fn(),
}));

import { SignatureSection } from "./signature_section";

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  h.api.list_signatures.mockResolvedValue({
    data: {
      signatures: [
        {
          id: "old",
          name: "Personal",
          content: "old",
          is_html: false,
          is_default: true,
          alias_id: null,
        },
        {
          id: "new",
          name: "Work",
          content: "new",
          is_html: false,
          is_default: false,
          alias_id: null,
        },
      ],
    },
  });
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

function set_default_button(): HTMLButtonElement {
  const btn = Array.from(container.querySelectorAll("button")).find((b) =>
    (b.textContent ?? "").includes("common.set_as_default"),
  ) as HTMLButtonElement | undefined;
  if (!btn) throw new Error("set-as-default button not found");
  return btn;
}

describe("SignatureSection set-default ordering", () => {
  it("reloads the shared context only AFTER the server PATCH resolves", async () => {
    await render();

    let resolve_patch: (v: unknown) => void = () => {};
    h.api.set_default_signature.mockReturnValue(
      new Promise((r) => {
        resolve_patch = r;
      }),
    );

    act(() => set_default_button().click());
    await flush();

    expect(h.api.set_default_signature).toHaveBeenCalledWith("new");
    expect(
      h.reload_signatures,
      "context reload must NOT fire before the PATCH resolves (that is the stale-default race)",
    ).not.toHaveBeenCalled();

    await act(async () => {
      resolve_patch({ data: { id: "new" } });
      await flush();
    });

    expect(
      h.reload_signatures,
      "context reload must fire once the new default is committed server-side",
    ).toHaveBeenCalledTimes(1);
  });
});
