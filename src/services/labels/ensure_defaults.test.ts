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
import { beforeEach, describe, expect, it, vi } from "vitest";

const list_folders = vi.fn();
const create_folder = vi.fn();
const emit_folders_changed = vi.fn();

vi.mock("@/services/api/folders", () => ({
  list_folders: (...args: unknown[]) => list_folders(...args),
  create_folder: (...args: unknown[]) => create_folder(...args),
}));

vi.mock("@/hooks/use_folders", () => ({
  encrypt_folder_field: vi.fn(async (name: string) => ({
    encrypted: `enc:${name}`,
    nonce: `nonce:${name}`,
  })),
  generate_folder_token: vi.fn(() => "generated_token"),
}));

vi.mock("@/hooks/mail_events", () => ({
  emit_folders_changed: () => emit_folders_changed(),
}));

import { ensure_default_labels } from "./ensure_defaults";

const vault = { identity_key: "identity" } as never;

function folder(folder_type: string, folder_token = `${folder_type}_token`) {
  return { folder_type, folder_token };
}

describe("ensure_default_labels", () => {
  beforeEach(() => {
    list_folders.mockReset();
    create_folder.mockReset();
    emit_folders_changed.mockReset();
    create_folder.mockResolvedValue({ data: { id: "new" } });
  });

  it("creates every system folder for an empty account", async () => {
    list_folders.mockResolvedValue({ data: { folders: [] } });

    await ensure_default_labels(vault);

    const created = create_folder.mock.calls.map((c) => c[0].folder_type);
    expect(created).toEqual([
      "inbox",
      "sent",
      "drafts",
      "trash",
      "spam",
      "archive",
    ]);
    expect(create_folder.mock.calls[0][0].is_system).toBe(true);
    expect(emit_folders_changed).toHaveBeenCalledTimes(1);
  });

  it("creates only the system folders that are missing", async () => {
    list_folders.mockResolvedValue({
      data: {
        folders: [folder("inbox"), folder("drafts"), folder("folder", "custom")],
      },
    });

    await ensure_default_labels(vault);

    const created = create_folder.mock.calls.map((c) => c[0].folder_type);
    expect(created).toEqual(["sent", "trash", "spam", "archive"]);
    expect(emit_folders_changed).toHaveBeenCalledTimes(1);
  });

  it("does nothing when every system folder exists", async () => {
    list_folders.mockResolvedValue({
      data: {
        folders: ["inbox", "sent", "drafts", "trash", "spam", "archive"].map(
          (type) => folder(type),
        ),
      },
    });

    await ensure_default_labels(vault);

    expect(create_folder).not.toHaveBeenCalled();
    expect(emit_folders_changed).not.toHaveBeenCalled();
  });

  it("does not create folders when the list cannot be fetched", async () => {
    list_folders.mockResolvedValue({ error: "network" });

    await ensure_default_labels(vault);

    expect(create_folder).not.toHaveBeenCalled();
  });
});
