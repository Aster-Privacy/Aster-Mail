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
import type { ParsedEmail } from "@/services/import/types";

import { describe, expect, it, vi } from "vitest";

import {
  MAX_IMPORT_FOLDER_LEVELS,
  MAX_IMPORT_FOLDER_NAME_LENGTH,
  type ImportFolderSource,
  find_import_folder,
  folder_path_key,
  folder_path_segments,
  resolve_import_folders,
} from "./import_folders";
import { extract_source_folders, folder_for_email } from "./helpers";

function email_with_folders(
  source_folders: string[],
  source_folder?: string,
): ParsedEmail {
  return {
    message_id: "m1",
    from: "a@example.com",
    to: [],
    cc: [],
    bcc: [],
    subject: "s",
    date: new Date(0),
    html_body: null,
    text_body: "t",
    attachments: [],
    raw_headers: {},
    source_folder,
    source_folders,
  } as ParsedEmail;
}

function fake_folders(existing: ImportFolderSource[] = []) {
  const folders = [...existing];
  let next = 0;
  const create_folder = vi.fn(async (name: string, parent_token?: string) => {
    next += 1;
    const folder = { name, folder_token: `new-${next}`, parent_token };

    folders.push(folder);

    return { folder };
  });

  return { folders, create_folder };
}

describe("folder_path_segments", () => {
  it("splits on backslashes", () => {
    expect(folder_path_segments("Bills\\Mobile Stuff")).toEqual([
      "Bills",
      "Mobile Stuff",
    ]);
  });

  it("splits on forward slashes", () => {
    expect(folder_path_segments("Bills/Mobile Stuff")).toEqual([
      "Bills",
      "Mobile Stuff",
    ]);
  });

  it("splits mixed separators, trims and drops empty segments", () => {
    expect(folder_path_segments(" \\Home \\ Garden//Tools\\ ")).toEqual([
      "Home",
      "Garden",
      "Tools",
    ]);
    expect(folder_path_segments("\\/ /")).toEqual([]);
  });

  it("drops desktop store roots but keeps a lone root name", () => {
    expect(
      folder_path_segments("Top of Outlook data file/Clients\\Acme"),
    ).toEqual(["Clients", "Acme"]);
    expect(folder_path_segments("Top of Personal Folders")).toEqual([
      "Top of Personal Folders",
    ]);
  });

  it("folds levels past the nesting limit into the deepest level", () => {
    const parts = ["A", "B", "C", "D", "E", "F", "G"];
    const segments = folder_path_segments(parts.join("\\"));

    expect(segments).toHaveLength(MAX_IMPORT_FOLDER_LEVELS);
    expect(segments.slice(0, MAX_IMPORT_FOLDER_LEVELS - 1)).toEqual(
      parts.slice(0, MAX_IMPORT_FOLDER_LEVELS - 1),
    );
    expect(segments[MAX_IMPORT_FOLDER_LEVELS - 1]).toBe(
      parts.slice(MAX_IMPORT_FOLDER_LEVELS - 1).join("/"),
    );
  });

  it("caps each segment at the folder name length", () => {
    const [segment] = folder_path_segments("x".repeat(250));

    expect(Array.from(segment)).toHaveLength(MAX_IMPORT_FOLDER_NAME_LENGTH);
  });

  it("gives the same key to equivalent paths", () => {
    expect(folder_path_key("bills\\mobile stuff")).toBe(
      folder_path_key(" Bills / Mobile Stuff "),
    );
  });
});

describe("source folder helpers", () => {
  it("normalizes and dedupes nested source folders", () => {
    const emails = [
      email_with_folders(["Bills\\Mobile Stuff"]),
      email_with_folders(["Bills/Mobile Stuff", "bills\\mobile stuff"]),
      email_with_folders(["Bills"]),
    ];

    expect(extract_source_folders(emails)).toEqual([
      "Bills/Mobile Stuff",
      "Bills",
    ]);
  });

  it("finds the leaf token for a backslash path", () => {
    const map = new Map([["bills/mobile stuff", "leaf"]]);

    expect(
      folder_for_email(email_with_folders(["Bills\\Mobile Stuff"]), map),
    ).toBe("leaf");
  });
});

describe("find_import_folder", () => {
  const folders: ImportFolderSource[] = [
    { name: "Bills", folder_token: "bills" },
    { name: "Mobile Stuff", folder_token: "mobile", parent_token: "bills" },
    { name: "Mobile Stuff", folder_token: "root-mobile" },
  ];

  it("matches by name and parent, ignoring case", () => {
    expect(find_import_folder(folders, "BILLS")?.folder_token).toBe("bills");
    expect(
      find_import_folder(folders, "mobile stuff", "bills")?.folder_token,
    ).toBe("mobile");
    expect(find_import_folder(folders, "mobile stuff")?.folder_token).toBe(
      "root-mobile",
    );
    expect(find_import_folder(folders, "Bills", "mobile")).toBeUndefined();
  });
});

describe("resolve_import_folders", () => {
  it("creates the parent once for several children and maps each leaf", async () => {
    const { folders, create_folder } = fake_folders();
    const result = await resolve_import_folders({
      paths: ["Bills/Mobile Stuff", "Bills/Power", "Bills"],
      existing_folders: [],
      create_folder,
    });

    expect(create_folder).toHaveBeenCalledTimes(3);
    expect(create_folder).toHaveBeenNthCalledWith(1, "Bills", undefined);
    expect(create_folder).toHaveBeenNthCalledWith(2, "Mobile Stuff", "new-1");
    expect(create_folder).toHaveBeenNthCalledWith(3, "Power", "new-1");
    expect(result.created).toBe(3);
    expect(result.skipped).toBe(0);
    expect(Object.fromEntries(result.folder_map)).toEqual({
      "bills/mobile stuff": "new-2",
      "bills/power": "new-3",
      bills: "new-1",
    });
    expect(folders.map((f) => [f.name, f.parent_token])).toEqual([
      ["Bills", undefined],
      ["Mobile Stuff", "new-1"],
      ["Power", "new-1"],
    ]);
  });

  it("reuses existing folders by name and parent on a re-import", async () => {
    const existing: ImportFolderSource[] = [
      { name: "bills", folder_token: "old-bills" },
      {
        name: "mobile stuff",
        folder_token: "old-mobile",
        parent_token: "old-bills",
      },
    ];
    const { create_folder } = fake_folders(existing);
    const result = await resolve_import_folders({
      paths: ["Bills\\Mobile Stuff", "Bills\\Internet"],
      existing_folders: existing,
      create_folder,
    });

    expect(create_folder).toHaveBeenCalledTimes(1);
    expect(create_folder).toHaveBeenCalledWith("Internet", "old-bills");
    expect(result.folder_map.get("bills/mobile stuff")).toBe("old-mobile");
    expect(result.folder_map.get("bills/internet")).toBe("new-1");
    expect(result.created).toBe(1);
  });

  it("does not reuse a flat folder whose name holds the whole path", async () => {
    const existing: ImportFolderSource[] = [
      { name: "Bills\\Mobile Stuff", folder_token: "flat" },
    ];
    const { create_folder } = fake_folders(existing);
    const result = await resolve_import_folders({
      paths: ["Bills\\Mobile Stuff"],
      existing_folders: existing,
      create_folder,
    });

    expect(create_folder).toHaveBeenCalledTimes(2);
    expect(result.folder_map.get("bills/mobile stuff")).toBe("new-2");
  });

  it("stops creating at the plan limit and files mail in the deepest folder made", async () => {
    let calls = 0;
    const create_folder = vi.fn(async (name: string, parent_token?: string) => {
      calls += 1;
      if (calls > 1) return { folder: null, code: "PLAN_LIMIT_EXCEEDED" };

      return { folder: { name, folder_token: `new-${calls}`, parent_token } };
    });
    const result = await resolve_import_folders({
      paths: ["Bills/Mobile Stuff", "Bills/Power", "Travel"],
      existing_folders: [],
      create_folder,
    });

    expect(create_folder).toHaveBeenCalledTimes(2);
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(3);
    expect(Object.fromEntries(result.folder_map)).toEqual({
      "bills/mobile stuff": "new-1",
      "bills/power": "new-1",
    });
  });

  it("picks up a folder that already exists when create reports a duplicate", async () => {
    const latest: ImportFolderSource[] = [
      { name: "Bills", folder_token: "other-tab" },
    ];
    const create_folder = vi.fn(async (name: string, parent_token?: string) =>
      name === "Bills"
        ? { folder: null, code: "DUPLICATE" }
        : { folder: { name, folder_token: "leaf", parent_token } },
    );
    const result = await resolve_import_folders({
      paths: ["Bills/Mobile Stuff"],
      existing_folders: [],
      create_folder,
      find_existing: (name, parent_token) =>
        find_import_folder(latest, name, parent_token),
    });

    expect(create_folder).toHaveBeenLastCalledWith("Mobile Stuff", "other-tab");
    expect(result.folder_map.get("bills/mobile stuff")).toBe("leaf");
    expect(result.skipped).toBe(0);
  });

  it("nests under a system folder without filing mail into it", async () => {
    const existing: ImportFolderSource[] = [
      { name: "Inbox", folder_token: "inbox", is_system: true },
    ];
    const create_folder = vi.fn(async () => ({
      folder: null,
      code: "PLAN_LIMIT_EXCEEDED",
    }));
    const result = await resolve_import_folders({
      paths: ["Inbox/Receipts"],
      existing_folders: existing,
      create_folder,
    });

    expect(create_folder).toHaveBeenCalledWith("Receipts", "inbox");
    expect(result.folder_map.size).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it("stops when the import is canceled", async () => {
    const { create_folder } = fake_folders();
    const result = await resolve_import_folders({
      paths: ["A", "B"],
      existing_folders: [],
      create_folder,
      should_stop: () => true,
    });

    expect(create_folder).not.toHaveBeenCalled();
    expect(result.folder_map.size).toBe(0);
  });
});
