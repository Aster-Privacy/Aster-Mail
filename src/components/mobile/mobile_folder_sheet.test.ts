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
import type { DecryptedFolder } from "@/hooks/use_folders/tree";

import { describe, expect, it } from "vitest";

import { folder_sheet_options } from "@/components/mobile/mobile_folder_sheet";

function folder(
  folder_token: string,
  overrides: Partial<DecryptedFolder> = {},
): DecryptedFolder {
  return {
    id: folder_token,
    folder_token,
    name: folder_token,
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

describe("folder_sheet_options", () => {
  it("lists child folders under their parent", () => {
    const options = folder_sheet_options([
      folder("child", { parent_token: "parent", sort_order: 1 }),
      folder("parent", { sort_order: 0 }),
    ]);

    expect(
      options.map(({ folder: entry, depth }) => [entry.folder_token, depth]),
    ).toEqual([
      ["parent", 0],
      ["child", 1],
    ]);
  });

  it("leaves out system and locked folders", () => {
    const options = folder_sheet_options([
      folder("work"),
      folder("system", { is_system: true }),
      folder("vault", { is_password_protected: true }),
    ]);

    expect(options.map(({ folder: entry }) => entry.folder_token)).toEqual([
      "work",
    ]);
  });
});
