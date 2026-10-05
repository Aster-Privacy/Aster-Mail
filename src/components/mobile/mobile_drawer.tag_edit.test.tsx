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
import type { DecryptedTag } from "@/hooks/use_tags";

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { MobileDrawer } from "@/components/mobile/mobile_drawer";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const hoisted = vi.hoisted(() => ({
  update_existing_tag: vi.fn(async () => true),
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
      state: { folders: [], is_loading: false },
      unread_counts: {},
      create_new_folder: vi.fn(),
      update_existing_folder: vi.fn(),
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
    update_existing_tag: hoisted.update_existing_tag,
    delete_existing_tag: vi.fn(),
    refresh: vi.fn(async () => []),
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
  EditFolderSheet: () => null,
  EditTagSheet: (props: Record<string, unknown>) => {
    hoisted.sheet_props = props;

    return null;
  },
  CreateAliasSheet: () => null,
  PasswordModalWrapper: () => null,
}));

vi.mock("@/components/mobile/mobile_drawer_nav", () => ({
  DrawerNavContent: (props: Record<string, unknown>) => {
    hoisted.nav_props = props;

    return null;
  },
}));

function tag(
  name: string,
  overrides: Partial<DecryptedTag> = {},
): DecryptedTag {
  return {
    id: `id_${name}`,
    tag_token: `token_${name}`,
    name,
    color: "#112233",
    icon: "star",
    sort_order: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const readable = tag("Work");
const unreadable = tag("common.label_unable_to_decrypt", {
  id: "id_unreadable",
  tag_token: "token_unreadable",
  is_undecryptable: true,
});

describe("mobile drawer label edit", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
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

  const open_edit = (target: DecryptedTag) => {
    act(() => {
      (hoisted.nav_props.on_open_edit_tag as (t: DecryptedTag) => void)(target);
    });
  };

  const save = async () => {
    await act(async () => {
      await (hoisted.sheet_props.handle_save as () => Promise<void>)();
    });
  };

  it("saves the color and icon of an unreadable label without a name", async () => {
    open_edit(unreadable);
    await save();

    expect(hoisted.update_existing_tag).toHaveBeenCalledTimes(1);
    expect(hoisted.update_existing_tag).toHaveBeenCalledWith(
      "id_unreadable",
      undefined,
      "#112233",
      "star",
    );
    expect(hoisted.show_toast).not.toHaveBeenCalled();
  });

  it("never sends typed text as the name of an unreadable label", async () => {
    open_edit(unreadable);
    act(() => {
      (hoisted.sheet_props.set_edit_name as (n: string) => void)("Renamed");
    });
    await save();

    expect(hoisted.update_existing_tag).toHaveBeenCalledWith(
      "id_unreadable",
      undefined,
      "#112233",
      "star",
    );
  });

  it("sends the trimmed name of a readable label", async () => {
    open_edit(readable);
    act(() => {
      (hoisted.sheet_props.set_edit_name as (n: string) => void)("  Travel ");
    });
    await save();

    expect(hoisted.update_existing_tag).toHaveBeenCalledWith(
      "id_Work",
      "Travel",
      "#112233",
      "star",
    );
  });

  it("does not save a readable label with an empty name", async () => {
    open_edit(readable);
    act(() => {
      (hoisted.sheet_props.set_edit_name as (n: string) => void)("   ");
    });
    await save();

    expect(hoisted.update_existing_tag).not.toHaveBeenCalled();
  });
});
