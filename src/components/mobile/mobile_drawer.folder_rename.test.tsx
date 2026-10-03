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
import type { DecryptedFolder } from "@/hooks/use_folders";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MobileDrawer } from "@/components/mobile/mobile_drawer";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  folders: [] as unknown[],
  update_existing_folder: vi.fn(async () => true),
  show_toast: vi.fn(),
  nav_props: {} as Record<string, unknown>,
  sheet_props: {} as Record<string, unknown>,
}));

vi.mock("@/components/toast/simple_toast", () => ({
  show_toast: hoisted.show_toast,
}));

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

vi.mock("@/hooks/use_folders", async (import_original) => {
  const actual = await import_original<object>();

  return {
    ...actual,
    use_folders: () => ({
      state: { folders: hoisted.folders, is_loading: false },
      unread_counts: {},
      create_new_folder: vi.fn(),
      update_existing_folder: hoisted.update_existing_folder,
      delete_existing_folder: vi.fn(),
      toggle_folder_lock: vi.fn(),
    }),
  };
});

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
    enabled_aliases: [],
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
  EditFolderSheet: (props: Record<string, unknown>) => {
    hoisted.sheet_props = props;

    return null;
  },
  EditTagSheet: () => null,
  CreateAliasSheet: () => null,
  PasswordModalWrapper: () => null,
}));

vi.mock("@/components/mobile/mobile_drawer_nav", () => ({
  DrawerNavContent: (props: Record<string, unknown>) => {
    hoisted.nav_props = props;

    return null;
  },
}));

function folder(
  token: string,
  name: string,
  overrides: Partial<DecryptedFolder> = {},
): DecryptedFolder {
  return {
    id: `id_${token}`,
    folder_token: token,
    name,
    is_system: false,
    is_locked: false,
    folder_type: "custom",
    is_password_protected: false,
    password_set: false,
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const work = folder("work", "Work");
const receipts = folder("receipts", "Receipts");
const nested_work = folder("nested_work", "work", {
  parent_token: "receipts",
});
const moved_to_top = folder("moved", "Travel", { parent_token: "" });

describe("mobile drawer folder rename", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.folders = [work, receipts, nested_work, moved_to_top];
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    act(() => {
      root.render(
        <MobileDrawer
          active_path="/mail/inbox"
          is_open={true}
          on_close={() => {}}
          on_navigate={() => {}}
        />,
      );
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.style.overflow = "";
  });

  const save_with_name = async (target: DecryptedFolder, name: string) => {
    act(() => {
      (hoisted.nav_props.on_open_edit_folder as (f: DecryptedFolder) => void)(
        target,
      );
    });
    act(() => {
      (hoisted.sheet_props.set_edit_name as (n: string) => void)(name);
    });
    await act(async () => {
      await (hoisted.sheet_props.handle_save as () => Promise<void>)();
    });
  };

  it("refuses to rename a folder to a sibling's name", async () => {
    await save_with_name(receipts, "WORK");

    expect(hoisted.update_existing_folder).not.toHaveBeenCalled();
    expect(hoisted.show_toast).toHaveBeenCalledWith(
      "common.folder_already_exists",
      "error",
    );
  });

  it("refuses a sibling's name for a folder just moved to the top level", async () => {
    await save_with_name(moved_to_top, "receipts");

    expect(hoisted.update_existing_folder).not.toHaveBeenCalled();
    expect(hoisted.show_toast).toHaveBeenCalledWith(
      "common.folder_already_exists",
      "error",
    );
  });

  it("allows a name used only under a different parent", async () => {
    await save_with_name(receipts, "Personal");
    await save_with_name(nested_work, "Archive");

    expect(hoisted.update_existing_folder).toHaveBeenCalledTimes(2);
    expect(hoisted.show_toast).not.toHaveBeenCalled();
  });

  it("allows a case-only rename of the folder itself", async () => {
    await save_with_name(work, "WORK");

    expect(hoisted.update_existing_folder).toHaveBeenCalledWith(
      work.id,
      "WORK",
      "#000000",
    );
    expect(hoisted.show_toast).not.toHaveBeenCalled();
  });
});
