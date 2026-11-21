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
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/services/api/external_accounts/api", () => ({
  get_sync_settings: vi.fn(),
  update_sync_settings: vi.fn(),
  save_folder_mapping: vi.fn(),
}));
vi.mock("@/services/external_folder_mirror", () => ({
  decode_modified_utf7: (name: string) => name.replace("&AOk-", "é"),
  mirror_external_account_folders: vi.fn(),
}));

import {
  get_sync_settings,
  save_folder_mapping,
  update_sync_settings,
} from "@/services/api/external_accounts/api";
import { mirror_external_account_folders } from "@/services/external_folder_mirror";
import {
  apply_oauth_folder_selection,
  default_selected_folders,
  picker_folders,
} from "@/services/external_account_setup";

const get_mock = vi.mocked(get_sync_settings);
const update_mock = vi.mocked(update_sync_settings);
const save_mock = vi.mocked(save_folder_mapping);
const mirror_mock = vi.mocked(mirror_external_account_folders);

function folder(
  name: string,
  options: { excluded?: boolean; selectable?: boolean } = {},
) {
  const base = { name, delimiter: "/", excluded: options.excluded ?? false };

  return options.selectable === undefined
    ? base
    : { ...base, selectable: options.selectable };
}

const NOW = new Date("2026-11-14T10:00:00.000Z");

describe("picker_folders", () => {
  it("offers system folders, puts Inbox first, and hides unselectable ones", () => {
    const offered = picker_folders([
      folder("Work/Projects"),
      folder("Sent Items", { excluded: true, selectable: true }),
      folder("[All Mail]", { excluded: true, selectable: false }),
      folder("INBOX", { excluded: true, selectable: true }),
      folder("Archive"),
    ]);

    expect(offered.map((f) => f.name)).toEqual([
      "INBOX",
      "Archive",
      "Sent Items",
      "Work/Projects",
    ]);
    expect(offered.find((f) => f.name === "Work/Projects")?.label).toBe(
      "Work / Projects",
    );
  });

  it("falls back to the system folder check when the server omits selectable", () => {
    const offered = picker_folders([
      folder("Junk", { excluded: true }),
      folder("Noise", { excluded: true }),
      folder("Inbox"),
    ]);

    expect(offered.map((f) => f.name)).toEqual(["Inbox", "Junk"]);
  });

  it("decodes folder names and drops duplicates", () => {
    const offered = picker_folders([folder("Caf&AOk-"), folder("Caf&AOk-")]);

    expect(offered).toEqual([
      { name: "Caf&AOk-", label: "Café", is_inbox: false },
    ]);
  });

  it("selects only Inbox by default", () => {
    const offered = picker_folders([
      folder("INBOX"),
      folder("Sent", { excluded: true, selectable: true }),
      folder("Archive"),
    ]);

    expect(default_selected_folders(offered)).toEqual(["INBOX"]);
  });
});

describe("apply_oauth_folder_selection", () => {
  beforeEach(() => {
    get_mock.mockReset();
    update_mock.mockReset();
    save_mock.mockReset();
    mirror_mock.mockReset();
    get_mock.mockResolvedValue({
      data: {
        sync_frequency: "30m",
        sync_folders: [],
        max_messages_per_sync: 200,
        sync_since_date: null,
      },
    } as never);
    update_mock.mockResolvedValue({ data: { success: true } } as never);
    save_mock.mockResolvedValue({ data: { success: true } } as never);
  });

  it("saves the selection and sync window before mirroring only the chosen folders", async () => {
    const order: string[] = [];

    update_mock.mockImplementation(async () => {
      order.push("settings");

      return { data: { success: true } } as never;
    });
    mirror_mock.mockImplementation(async () => {
      order.push("mirror");

      return { status: "ok", mapped: 1, failures: 0 };
    });

    const outcome = await apply_oauth_folder_selection({
      account_token: "tok",
      selected_folders: ["INBOX", "Archive", "INBOX"],
      import_existing: false,
      existing_folders: [],
      now: NOW,
    });

    expect(outcome).toEqual({ status: "ok", failures: 0 });
    expect(order).toEqual(["settings", "mirror"]);
    expect(update_mock).toHaveBeenCalledWith("tok", {
      sync_frequency: "30m",
      max_messages_per_sync: 200,
      sync_folders: ["INBOX", "Archive"],
      sync_since_date: NOW.toISOString(),
    });
    expect(mirror_mock.mock.calls[0][4]).toEqual({
      selected_folders: ["INBOX", "Archive"],
      listed: undefined,
    });
  });

  it("imports existing mail when asked by clearing the since date", async () => {
    mirror_mock.mockResolvedValue({ status: "ok", mapped: 0, failures: 2 });

    const outcome = await apply_oauth_folder_selection({
      account_token: "tok",
      selected_folders: ["INBOX"],
      import_existing: true,
      existing_folders: [],
      now: NOW,
    });

    expect(outcome).toEqual({ status: "ok", failures: 2 });
    expect(update_mock.mock.calls[0][1].sync_since_date).toBeNull();
  });

  it("stores the selection without folders when the vault is locked", async () => {
    mirror_mock.mockResolvedValue({ status: "no_vault" });

    const outcome = await apply_oauth_folder_selection({
      account_token: "tok",
      selected_folders: ["INBOX"],
      import_existing: false,
      existing_folders: [],
      now: NOW,
    });

    expect(outcome).toEqual({ status: "ok", failures: 0 });
    expect(save_mock).toHaveBeenCalledWith("tok", {}, {}, ["INBOX"], undefined);
  });

  it("sends system folder links for the selection when the vault is locked", async () => {
    mirror_mock.mockResolvedValue({ status: "no_vault" });

    await apply_oauth_folder_selection({
      account_token: "tok",
      selected_folders: ["INBOX", "Sent Items"],
      import_existing: false,
      existing_folders: [],
      listed: {
        folders: [folder("INBOX"), folder("Sent Items"), folder("Trash")],
      },
      now: NOW,
    });

    expect(save_mock).toHaveBeenCalledWith(
      "tok",
      {},
      {},
      ["INBOX", "Sent Items"],
      [
        { remote_name: "INBOX", special_use: "inbox", aster_target: "inbox" },
        {
          remote_name: "Sent Items",
          special_use: "sent",
          aster_target: "sent",
        },
      ],
    );
  });

  it("stops before mirroring when the settings cannot be saved", async () => {
    update_mock.mockResolvedValue({ error: "nope" } as never);

    const outcome = await apply_oauth_folder_selection({
      account_token: "tok",
      selected_folders: ["INBOX"],
      import_existing: false,
      existing_folders: [],
      now: NOW,
    });

    expect(outcome).toEqual({ status: "error" });
    expect(mirror_mock).not.toHaveBeenCalled();
  });

  it("refuses an empty selection without calling the server", async () => {
    const outcome = await apply_oauth_folder_selection({
      account_token: "tok",
      selected_folders: [],
      import_existing: false,
      existing_folders: [],
    });

    expect(outcome).toEqual({ status: "error" });
    expect(get_mock).not.toHaveBeenCalled();
  });

  it("uses setup defaults when the account has no saved settings", async () => {
    get_mock.mockResolvedValue({ error: "missing" } as never);
    mirror_mock.mockResolvedValue({ status: "ok", mapped: 1, failures: 0 });

    await apply_oauth_folder_selection({
      account_token: "tok",
      selected_folders: ["INBOX"],
      import_existing: false,
      existing_folders: [],
      now: NOW,
    });

    expect(update_mock.mock.calls[0][1]).toMatchObject({
      sync_frequency: "15m",
      max_messages_per_sync: 500,
    });
  });
});
