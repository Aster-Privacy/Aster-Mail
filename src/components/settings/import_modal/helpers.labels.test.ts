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
import type { ParsedEmail } from "@/services/import/parser";

import { describe, expect, it } from "vitest";

import {
  classify_import_labels,
  extract_source_folders,
  folder_for_email,
  source_labels,
} from "./helpers";

function email_with(headers: Record<string, string>, folder?: string) {
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
    raw_headers: headers,
    source_folder: folder,
  } as ParsedEmail;
}

describe("classify_import_labels", () => {
  it("keeps inbox mail in the inbox and reads the unread flag", () => {
    const d = classify_import_labels(["Inbox", "Unread", "Category Personal"]);

    expect(d).toMatchObject({
      skip: false,
      sent: false,
      is_read: false,
      is_archived: false,
      custom_labels: [],
    });
  });

  it("marks sent mail as sent and never archives it", () => {
    const d = classify_import_labels(["Sent", "Archived", "Opened"]);

    expect(d.sent).toBe(true);
    expect(d.is_archived).toBe(false);
    expect(d.is_read).toBe(true);
  });

  it("archives mail that is neither in the inbox nor in a folder", () => {
    expect(classify_import_labels(["Archived", "Important"]).is_archived).toBe(
      true,
    );
  });

  it("routes mail with a custom label into that folder, not the archive", () => {
    const d = classify_import_labels(["Archived", "Receipts/2025", "Starred"]);

    expect(d.is_archived).toBe(false);
    expect(d.is_starred).toBe(true);
    expect(d.custom_labels).toEqual(["Receipts/2025"]);
  });

  it("maps trash, spam and drafts", () => {
    expect(classify_import_labels(["Trash", "Archived"]).is_trashed).toBe(true);
    expect(classify_import_labels(["Spam"]).is_spam).toBe(true);
    expect(classify_import_labels(["Drafts"]).skip).toBe(true);
    expect(classify_import_labels(["Chat"]).skip).toBe(true);
  });

  it("understands desktop mailbox folder names", () => {
    expect(classify_import_labels(["Deleted Items"]).is_trashed).toBe(true);
    expect(classify_import_labels(["Junk Email"]).is_spam).toBe(true);
    expect(classify_import_labels(["Sent Items"]).sent).toBe(true);
    expect(
      classify_import_labels(["Top of Outlook data file/Inbox"]),
    ).toMatchObject({ is_archived: false, custom_labels: [] });
  });
});

describe("nested labels named like system folders", () => {
  it("imports inbox mail that also carries a nested Chat or Draft label", () => {
    for (const label of [
      "Team/Chat",
      "Team/Chats",
      "Projects/Draft",
      "Projects/Drafts",
    ]) {
      const d = classify_import_labels(["Inbox", label]);

      expect(d.skip).toBe(false);
      expect(d.custom_labels).toEqual([label]);
    }
  });

  it("files a nested Archive or All label into its own folder", () => {
    for (const label of ["Clients/Archive", "Clients/All", "Old/All Mail"]) {
      const d = classify_import_labels([label]);

      expect(d.is_archived).toBe(false);
      expect(d.custom_labels).toEqual([label]);
    }
  });

  it("keeps nested Sent, Trash, Spam and Starred labels as folders", () => {
    const d = classify_import_labels([
      "Archived",
      "Clients/Sent",
      "Old/Trash",
      "Old/Spam",
      "Fav/Starred",
    ]);

    expect(d).toMatchObject({
      sent: false,
      is_trashed: false,
      is_spam: false,
      is_starred: false,
      is_archived: false,
    });
    expect(d.custom_labels).toEqual([
      "Clients/Sent",
      "Old/Trash",
      "Old/Spam",
      "Fav/Starred",
    ]);
  });

  it("still reads system folders under an Outlook data file root", () => {
    expect(
      classify_import_labels(["Top of Outlook data file/Sent Items"]).sent,
    ).toBe(true);
    expect(
      classify_import_labels(["Top of Personal Folders/Deleted Items"])
        .is_trashed,
    ).toBe(true);
    expect(
      classify_import_labels(["Top of Outlook data file/Drafts"]).skip,
    ).toBe(true);
    expect(
      classify_import_labels(["Top of Outlook data file/[Gmail]/Sent Mail"])
        .sent,
    ).toBe(true);
  });

  it("keeps Outlook subfolders named like system folders as folders", () => {
    const d = classify_import_labels([
      "Top of Outlook data file/Inbox/Clients/Drafts",
    ]);

    expect(d.skip).toBe(false);
    expect(d.custom_labels).toEqual([
      "Top of Outlook data file/Inbox/Clients/Drafts",
    ]);
  });

  it("creates the folder for a nested Archive label", () => {
    expect(
      extract_source_folders([
        email_with({ "x-gmail-labels": "Archived,Clients/Archive" }),
        email_with({ "x-gmail-labels": "Inbox,Team/Chat" }),
      ]),
    ).toEqual(["Clients/Archive", "Team/Chat"]);
  });
});

describe("source_labels and folders", () => {
  it("uses the label header when present and the source folder otherwise", () => {
    expect(
      source_labels(email_with({ "x-gmail-labels": "Inbox, Work" })),
    ).toEqual(["Inbox", "Work"]);
    expect(source_labels(email_with({}, "Projects/Alpha"))).toEqual([
      "Projects/Alpha",
    ]);
  });

  it("creates folders only for custom labels of imported mail", () => {
    const folders = extract_source_folders([
      email_with({ "x-gmail-labels": "Inbox, Work, IMAP_Forwarded" }),
      email_with({ "x-gmail-labels": "Drafts, Ideas" }),
      email_with({}, "Family"),
    ]);

    expect(folders).toEqual(["Work", "Family"]);
  });

  it("resolves the folder token from the source folder", () => {
    const map = new Map([["Family", "tok"]]);

    expect(folder_for_email(email_with({}, "Family"), map)).toBe("tok");
    expect(folder_for_email(email_with({}, "Inbox"), map)).toBeUndefined();
  });
});
