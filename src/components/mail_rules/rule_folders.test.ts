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

import { describe, expect, it } from "vitest";

import {
  rule_custom_folder_options,
  rule_custom_folders,
  rule_folder_name,
  rule_system_folder_type,
  rule_system_folders,
} from "@/components/mail_rules/rule_folders";

const folder = (
  folder_token: string,
  folder_type: string,
  name: string,
  is_system = folder_type !== "folder" && folder_type !== "custom",
): DecryptedFolder => ({
  id: folder_token,
  folder_token,
  name,
  is_system,
  is_locked: false,
  folder_type,
  is_password_protected: false,
  password_set: false,
  sort_order: 0,
  created_at: "",
  updated_at: "",
});

const all_folders = [
  folder("t_trash", "trash", "Bin"),
  folder("t_receipts", "folder", "Receipts"),
  folder("t_sent", "sent", "Sent"),
  folder("t_spam", "spam", "Junk"),
  folder("t_drafts", "drafts", "Drafts"),
  folder("t_inbox", "inbox", "Inbox"),
  folder("t_archive", "archive", "Archive"),
  folder("t_work", "custom", "Work"),
];

const t = (key: string) => `tr:${key}`;

describe("rule_system_folder_type", () => {
  it("maps the four mail folders", () => {
    expect(rule_system_folder_type("inbox")).toBe("inbox");
    expect(rule_system_folder_type("default_open")).toBe("inbox");
    expect(rule_system_folder_type("archive")).toBe("archive");
    expect(rule_system_folder_type("spam")).toBe("spam");
    expect(rule_system_folder_type("trash")).toBe("trash");
  });

  it("rejects folders that cannot receive mail and custom folders", () => {
    expect(rule_system_folder_type("sent")).toBeNull();
    expect(rule_system_folder_type("drafts")).toBeNull();
    expect(rule_system_folder_type("folder")).toBeNull();
    expect(rule_system_folder_type(undefined)).toBeNull();
  });
});

describe("rule_system_folders", () => {
  it("lists Inbox, Archive, Spam, and Trash in order", () => {
    expect(
      rule_system_folders(all_folders).map((f) => [
        f.system_type,
        f.folder.folder_token,
        f.label_key,
      ]),
    ).toEqual([
      ["inbox", "t_inbox", "mail.inbox"],
      ["archive", "t_archive", "mail.archive"],
      ["spam", "t_spam", "mail.spam"],
      ["trash", "t_trash", "mail.trash"],
    ]);
  });

  it("falls back to a legacy inbox and skips missing folders", () => {
    const result = rule_system_folders([
      folder("t_legacy", "default_open", "Inbox"),
      folder("t_spam", "spam", "Spam"),
    ]);

    expect(result.map((f) => f.folder.folder_token)).toEqual([
      "t_legacy",
      "t_spam",
    ]);
  });

  it("returns nothing before folders load", () => {
    expect(rule_system_folders([])).toEqual([]);
  });
});

describe("rule_custom_folders", () => {
  it("keeps only user folders", () => {
    expect(rule_custom_folders(all_folders).map((f) => f.folder_token)).toEqual(
      ["t_receipts", "t_work"],
    );
  });

  it("never offers a system folder even if its type is unexpected", () => {
    expect(rule_custom_folders([folder("t_x", "folder", "Odd", true)])).toEqual(
      [],
    );
  });
});

describe("rule_custom_folder_options", () => {
  it("lists a nested folder under its parent with its depth", () => {
    const child = {
      ...folder("t_invoices", "folder", "Invoices"),
      parent_token: "t_receipts",
    };

    expect(
      rule_custom_folder_options([child, ...all_folders]).map(
        (entry) => `${entry.depth}:${entry.folder.folder_token}`,
      ),
    ).toEqual(["0:t_receipts", "1:t_invoices", "0:t_work"]);
  });
});

describe("rule_folder_name", () => {
  it("uses localized names for system folders", () => {
    expect(rule_folder_name(all_folders, "t_spam", t)).toBe("tr:mail.spam");
    expect(rule_folder_name(all_folders, "t_trash", t)).toBe("tr:mail.trash");
  });

  it("uses the folder name for user folders", () => {
    expect(rule_folder_name(all_folders, "t_work", t)).toBe("Work");
  });

  it("returns null for an unknown token", () => {
    expect(rule_folder_name(all_folders, "t_missing", t)).toBeNull();
  });
});
