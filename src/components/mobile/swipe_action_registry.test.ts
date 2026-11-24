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
import { describe, expect, it } from "vitest";

import {
  SWIPE_ACTION_OPTIONS,
  get_swipe_action,
} from "@/components/mobile/swipe_action_registry";
import { en } from "@/lib/i18n/translations/en";

describe("swipe action registry", () => {
  it("offers the read toggle for either swipe direction", () => {
    expect(SWIPE_ACTION_OPTIONS).toContain("toggle_read");
  });

  it("names the read toggle for both states in settings", () => {
    const definition = get_swipe_action("toggle_read");

    expect(definition?.settings_label_key).toBe("settings.swipe_toggle_read");
    expect(en.settings.swipe_toggle_read).toBe("Mark as read or unread");
  });

  it("offers move to folder for either swipe direction", () => {
    const definition = get_swipe_action("move_to_folder");

    expect(SWIPE_ACTION_OPTIONS).toContain("move_to_folder");
    expect(definition?.label_key).toBe("mail.move_to_folder");
    expect(en.mail.move_to_folder).toBe("Move to folder");
  });

  it("ignores ids it does not know", () => {
    expect(get_swipe_action("mark_unread_later")).toBeNull();
    expect(get_swipe_action("none")).toBeNull();
  });
});
