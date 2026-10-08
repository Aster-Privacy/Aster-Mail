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

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({
    preferences: { compose_window_mode: "fullscreen" },
  }),
}));

vi.mock("@/hooks/use_draggable_modal", () => ({
  use_draggable_modal: () => ({
    handle_drag_start: () => {},
    get_position_style: () => ({}),
    has_been_moved: false,
    position: { x: 0, y: 0 },
    did_drag: () => false,
    reset: () => {},
  }),
}));

const compose_state = vi.hoisted(() => ({ to: [] as string[] }));

vi.mock("@/components/compose/use_compose", () => ({
  use_compose: () => ({
    subject: "",
    recipients: { to: compose_state.to, cc: [], bcc: [] },
    attachments: [],
    ghost_mode: {
      is_ghost_enabled: false,
      toggle_ghost_mode: () => {},
      error: null,
      ghost_expiry_days: 7,
      is_thread_locked: false,
      is_creating: false,
      set_ghost_expiry_days: () => {},
    },
    editor: { insert_html: () => {} },
    handle_close: () => {},
    handle_files_drop: () => {},
  }),
}));

vi.mock("@/components/compose/compose_shared", () => ({
  ComposeFormFields: ({ auto_focus_to }: { auto_focus_to?: boolean }) => (
    <div
      data-auto-focus-to={auto_focus_to ? "true" : "false"}
      data-testid="compose-fields"
    />
  ),
  ComposeEditor: () => null,
  ComposeAttachments: () => null,
  ComposeErrors: () => null,
  ComposeFileInput: () => null,
  ComposeToolbar: () => null,
}));

vi.mock("@/components/compose/schedule_picker", () => ({
  SchedulePicker: () => null,
}));
vi.mock("@/components/compose/expiration_picker", () => ({
  ExpirationPicker: () => null,
}));
vi.mock("@/components/compose/template_picker", () => ({
  TemplatePicker: () => null,
}));
vi.mock("@/components/compose/signature_picker", () => ({
  SignaturePicker: () => null,
}));
vi.mock("@/components/compose/sender_selector", () => ({
  SenderSelector: () => null,
}));
vi.mock("@/components/modals/confirmation_modal", () => ({
  ConfirmationModal: () => null,
}));
vi.mock("@/components/common/icons", () => ({
  CloseIcon: () => null,
}));
vi.mock("@/components/ui/error_boundary", () => ({
  ErrorBoundary: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
  ComposeErrorFallback: () => null,
}));

const MOTION_ONLY_PROPS = vi.hoisted(
  () =>
    new Set([
      "initial",
      "animate",
      "exit",
      "transition",
      "variants",
      "layout",
      "layoutId",
      "whileHover",
      "whileTap",
      "onAnimationStart",
      "onAnimationComplete",
    ]),
);

vi.mock("framer-motion", async () => {
  const { forwardRef } = await import("react");
  const cache = new Map<string, unknown>();

  return {
    motion: new Proxy(
      {},
      {
        get: (_target, key: string) => {
          if (!cache.has(key)) {
            cache.set(
              key,
              forwardRef<HTMLDivElement, { children?: React.ReactNode }>(
                ({ children, ...rest }, ref) => (
                  <div
                    ref={ref}
                    {...Object.fromEntries(
                      Object.entries(rest).filter(
                        ([prop]) => !MOTION_ONLY_PROPS.has(prop),
                      ),
                    )}
                  >
                    {children}
                  </div>
                ),
              ),
            );
          }

          return cache.get(key);
        },
      },
    ),
    AnimatePresence: ({ children }: { children: React.ReactNode }) => (
      <>{children}</>
    ),
  };
});

import { ComposeWindow } from "@/components/compose/compose_window";

function auto_focus_to(): string | null {
  return (
    document
      .querySelector('[data-testid="compose-fields"]')
      ?.getAttribute("data-auto-focus-to") ?? null
  );
}

describe("compose window To field focus", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    compose_state.to = [];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
  });

  function render(props: Partial<Parameters<typeof ComposeWindow>[0]> = {}) {
    act(() => {
      root.render(
        <ComposeWindow
          instance_id="test"
          is_minimized={false}
          on_close={() => {}}
          on_toggle_minimize={() => {}}
          {...props}
        />,
      );
    });
  }

  it("focuses To when a new message opens", () => {
    render();

    expect(auto_focus_to()).toBe("true");
  });

  it("leaves focus alone when a draft opens", () => {
    render({
      edit_draft: {} as NonNullable<
        Parameters<typeof ComposeWindow>[0]["edit_draft"]
      >,
    });

    expect(auto_focus_to()).toBe("false");
  });

  it("leaves focus alone when To already has a recipient", () => {
    compose_state.to = ["jesper@example.com"];
    render();

    expect(auto_focus_to()).toBe("false");
  });
});
