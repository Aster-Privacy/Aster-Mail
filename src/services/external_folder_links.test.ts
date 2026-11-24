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
import type { ExternalFolderSpecialUse } from "@/services/api/external_accounts/types";

import { describe, it, expect } from "vitest";

import {
  MAX_FOLDER_LINKS,
  build_folder_links,
  infer_special_use,
} from "@/services/external_folder_links";

function folder(
  name: string,
  delimiter = "/",
  special_use?: ExternalFolderSpecialUse,
) {
  return special_use
    ? { name, delimiter, excluded: false, special_use }
    : { name, delimiter, excluded: false };
}

describe("infer_special_use", () => {
  it("prefers the value the server reports", () => {
    expect(infer_special_use(folder("Correo enviado", "/", "sent"))).toBe(
      "sent",
    );
  });

  it("recognizes the inbox only at the top level", () => {
    expect(infer_special_use(folder("INBOX"))).toBe("inbox");
    expect(infer_special_use(folder("Inbox"))).toBe("inbox");
    expect(infer_special_use(folder("Work/Inbox"))).toBeUndefined();
  });

  it("classifies common system folder names by their last path part", () => {
    expect(infer_special_use(folder("Sent Items"))).toBe("sent");
    expect(infer_special_use(folder("INBOX.Drafts", "."))).toBe("drafts");
    expect(infer_special_use(folder("Deleted Items"))).toBe("trash");
    expect(infer_special_use(folder("Junk E-mail"))).toBe("junk");
    expect(infer_special_use(folder("Spam"))).toBe("junk");
    expect(infer_special_use(folder("Archives"))).toBe("archive");
    expect(infer_special_use(folder("Mail/All Mail"))).toBe("all");
  });

  it("leaves ordinary folders unclassified", () => {
    expect(infer_special_use(folder("Receipts"))).toBeUndefined();
    expect(infer_special_use(folder("Work/Sent reports"))).toBeUndefined();
  });
});

describe("build_folder_links", () => {
  it("links system folders to the matching Aster folder", () => {
    expect(
      build_folder_links([
        folder("INBOX"),
        folder("Sent"),
        folder("Drafts"),
        folder("Trash"),
        folder("Junk"),
        folder("Archive"),
      ]),
    ).toEqual([
      { remote_name: "INBOX", special_use: "inbox", aster_target: "inbox" },
      { remote_name: "Sent", special_use: "sent", aster_target: "sent" },
      { remote_name: "Drafts", special_use: "drafts", aster_target: "drafts" },
      { remote_name: "Trash", special_use: "trash", aster_target: "trash" },
      { remote_name: "Junk", special_use: "junk", aster_target: "spam" },
      {
        remote_name: "Archive",
        special_use: "archive",
        aster_target: "archive",
      },
    ]);
  });

  it("links mirrored folders to their custom folder token", () => {
    expect(
      build_folder_links([folder("Work"), folder("Work/Clients")], {
        Work: "dG9rZW4x",
        "Work/Clients": "dG9rZW4y",
      }),
    ).toEqual([
      { remote_name: "Work", aster_target: "custom", folder_token: "dG9rZW4x" },
      {
        remote_name: "Work/Clients",
        aster_target: "custom",
        folder_token: "dG9rZW4y",
      },
    ]);
  });

  it("keeps the custom folder when a system folder was mirrored", () => {
    expect(
      build_folder_links([folder("Archive")], { Archive: "YQ==" }),
    ).toEqual([
      {
        remote_name: "Archive",
        special_use: "archive",
        aster_target: "custom",
        folder_token: "YQ==",
      },
    ]);
  });

  it("omits folders with no Aster target", () => {
    expect(
      build_folder_links([folder("Receipts"), folder("All Mail")]),
    ).toEqual([]);
  });

  it("keeps an all-mail folder only when it has a custom folder", () => {
    expect(
      build_folder_links([folder("All Mail")], { "All Mail": "YQ==" }),
    ).toEqual([
      {
        remote_name: "All Mail",
        special_use: "all",
        aster_target: "custom",
        folder_token: "YQ==",
      },
    ]);
  });

  it("drops duplicate and overlong remote names", () => {
    const long_name = "a".repeat(513);

    expect(
      build_folder_links([folder("Work"), folder("Work"), folder(long_name)], {
        Work: "YQ==",
        [long_name]: "Yg==",
      }),
    ).toEqual([
      { remote_name: "Work", aster_target: "custom", folder_token: "YQ==" },
    ]);
  });

  it("stops at the server limit", () => {
    const folders = Array.from({ length: MAX_FOLDER_LINKS + 20 }, (_, i) =>
      folder(`Folder ${i}`),
    );
    const mapping = Object.fromEntries(folders.map((f) => [f.name, "YQ=="]));

    expect(build_folder_links(folders, mapping)).toHaveLength(MAX_FOLDER_LINKS);
  });
});
