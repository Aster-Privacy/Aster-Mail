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

import { MobileDrawer } from "@/components/mobile/mobile_drawer";
import {
  has_open_overlay_layer,
  use_escape_layer,
} from "@/lib/overlay_layer_stack";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@/hooks/use_platform", () => ({
  use_platform: () => ({ safe_area_insets: { top: 0, bottom: 0 } }),
}));

vi.mock("@/provider", () => ({
  use_should_reduce_motion: () => true,
}));

vi.mock("@/contexts/auth_context", () => ({
  use_auth: () => ({
    user: { email: "person@astermail.org" },
    logout: vi.fn(),
  }),
}));

vi.mock("@/lib/primary_identity", () => ({
  use_primary_identity: () => ({ email: "person@astermail.org" }),
}));

vi.mock("@/lib/i18n/context", () => ({
  use_i18n: () => ({ t: (key: string) => key }),
  use_translation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/contexts/preferences_context", () => ({
  use_preferences: () => ({ preferences: {}, update_preference: vi.fn() }),
}));

vi.mock("@/hooks/use_folders", () => ({
  use_folders: () => ({
    state: { folders: [], is_loading: false },
    unread_counts: {},
    create_new_folder: vi.fn(),
    update_existing_folder: vi.fn(),
    delete_existing_folder: vi.fn(),
    toggle_folder_lock: vi.fn(),
  }),
}));

vi.mock("@/hooks/use_tags", () => ({
  use_tags: () => ({
    state: { tags: [], is_loading: false },
    counts: {},
    create_new_tag: vi.fn(),
    update_existing_tag: vi.fn(),
    delete_existing_tag: vi.fn(),
  }),
}));

vi.mock("@/hooks/use_sidebar_aliases", () => ({
  use_sidebar_aliases: () => ({
    aliases: [],
    is_loading: false,
    unread_counts: {},
  }),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  use_mail_stats: () => ({
    stats: { storage_used_bytes: 0, storage_total_bytes: 0 },
  }),
}));

vi.mock("@/components/ui/email_tag", () => ({
  TAG_COLOR_PRESETS: Array.from({ length: 12 }, () => ({ hex: "#000000" })),
}));

vi.mock("@/services/api/aliases", () => ({
  create_alias: vi.fn(),
  validate_local_part: vi.fn(() => null),
  check_alias_availability: vi.fn(),
  get_alias_limit: vi.fn(async () => ({ data: { can_create: true } })),
}));

vi.mock("@/hooks/mail_events", async (import_original) => {
  const actual = await import_original<typeof import("@/hooks/mail_events")>();

  return { ...actual, emit_aliases_changed: vi.fn() };
});

vi.mock("@/components/settings/aliases/feature_lock", () => ({
  is_alias_limit_error: () => false,
  prompt_alias_limit_upgrade: vi.fn(),
}));

vi.mock("@/components/auth/turnstile_widget", () => ({
  TURNSTILE_SITE_KEY: "",
  TurnstileWidget: () => null,
}));

vi.mock("@/components/mobile/mobile_drawer_sheets", () => ({
  AccountMenuSheet: () => null,
  CreateFolderSheet: () => null,
  CreateLabelSheet: () => null,
  EditFolderSheet: () => null,
  EditTagSheet: () => null,
  CreateAliasSheet: () => null,
  PasswordModalWrapper: () => null,
  LogoutConfirmWrapper: () => null,
}));

vi.mock("@/components/mobile/mobile_drawer_nav", () => ({
  DrawerNavContent: () => null,
}));

function TopLayer({ on_close }: { on_close: () => void }) {
  use_escape_layer(true, on_close, "test_modal");

  return null;
}

function press_escape(): void {
  document.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
  );
}

describe("mobile drawer dialog shell", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = "";
  });

  const render_drawer = (is_open: boolean, on_close: () => void) => {
    act(() => {
      root.render(
        <MobileDrawer
          active_path="/mail/inbox"
          is_open={is_open}
          on_close={on_close}
          on_navigate={() => {}}
        />,
      );
    });
  };

  it("registers a blocking overlay layer while open", () => {
    render_drawer(true, () => {});

    expect(has_open_overlay_layer()).toBe(true);

    render_drawer(false, () => {});

    expect(has_open_overlay_layer()).toBe(false);
  });

  it("closes on escape when it is the top layer", () => {
    const on_close = vi.fn();

    render_drawer(true, on_close);

    act(() => press_escape());

    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("does not close on escape when a sheet is open above it", () => {
    const on_close = vi.fn();
    const close_sheet = vi.fn();

    act(() => {
      root.render(
        <>
          <MobileDrawer
            active_path="/mail/inbox"
            is_open={true}
            on_close={on_close}
            on_navigate={() => {}}
          />
          <TopLayer on_close={close_sheet} />
        </>,
      );
    });

    act(() => press_escape());

    expect(close_sheet).toHaveBeenCalledTimes(1);
    expect(on_close).not.toHaveBeenCalled();
  });

  it("closes on a primary pointerdown on the backdrop", () => {
    const on_close = vi.fn();

    render_drawer(true, on_close);

    const backdrop = container.querySelector(
      ".fixed.inset-0",
    ) as HTMLElement | null;

    expect(backdrop).not.toBeNull();

    act(() => {
      backdrop!.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });

    expect(on_close).toHaveBeenCalledTimes(1);
  });

  it("does not close when the pointer goes down inside the drawer", () => {
    const on_close = vi.fn();

    render_drawer(true, on_close);

    const nav = container.querySelector("nav") as HTMLElement;

    act(() => {
      nav.dispatchEvent(
        new PointerEvent("pointerdown", { bubbles: true, button: 0 }),
      );
    });

    expect(on_close).not.toHaveBeenCalled();
  });

  it("locks body scroll while open and restores it on close", () => {
    render_drawer(true, () => {});

    expect(document.body.style.overflow).toBe("hidden");

    render_drawer(false, () => {});

    expect(document.body.style.overflow).toBe("");
  });
});
