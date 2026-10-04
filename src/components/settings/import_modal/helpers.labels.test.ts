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
  MAX_TAGS_PER_EMAIL,
  classify_import_email,
  classify_import_labels,
  extract_source_folders,
  extract_source_tags,
  folder_for_email,
  keyword_labels,
  normalize_label_path,
  source_labels,
  split_label_list,
  tag_tokens_for_email,
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

  it("turns a nested Archive label from the label header into a label", () => {
    const emails = [
      email_with({ "x-gmail-labels": "Archived,Clients/Archive" }),
      email_with({ "x-gmail-labels": "Inbox,Team/Chat" }),
    ];

    expect(extract_source_folders(emails)).toEqual([]);
    expect(extract_source_tags(emails)).toEqual([
      "Clients/Archive",
      "Team/Chat",
    ]);
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

  it("creates folders only for real source folders of imported mail", () => {
    const emails = [
      email_with({ "x-gmail-labels": "Inbox, Work, IMAP_Forwarded" }),
      email_with({ "x-gmail-labels": "Drafts, Ideas" }),
      email_with({}, "Family"),
    ];

    expect(extract_source_folders(emails)).toEqual(["Family"]);
    expect(extract_source_tags(emails)).toEqual(["Work"]);
  });

  it("resolves the folder token from the source folder", () => {
    const map = new Map([["Family", "tok"]]);

    expect(folder_for_email(email_with({}, "Family"), map)).toBe("tok");
    expect(folder_for_email(email_with({}, "Inbox"), map)).toBeUndefined();
  });
});

describe("split_label_list", () => {
  it("keeps commas inside quoted labels", () => {
    expect(split_label_list('Inbox,"Taxes, 2025",Work')).toEqual([
      "Inbox",
      "Taxes, 2025",
      "Work",
    ]);
  });

  it("reads doubled and escaped quotes inside a quoted label", () => {
    expect(split_label_list('"Say ""hi"", again","A \\"B\\""')).toEqual([
      'Say "hi", again',
      'A "B"',
    ]);
  });

  it("drops empty entries and trims the rest", () => {
    expect(split_label_list(" Work , ,Family,")).toEqual(["Work", "Family"]);
  });

  it("splits on whitespace when asked and still honors quotes", () => {
    expect(split_label_list('work "to do" later', true)).toEqual([
      "work",
      "to do",
      "later",
    ]);
  });
});

describe("keyword_labels", () => {
  it("reads comma-separated and space-separated keyword headers", () => {
    expect(
      keyword_labels(email_with({ "x-keywords": "Work, Tax Return" })),
    ).toEqual(["Work", "Tax Return"]);
    expect(keyword_labels(email_with({ "x-keywords": "work todo" }))).toEqual([
      "work",
      "todo",
    ]);
    expect(
      keyword_labels(email_with({ keywords: "Project Alpha, Receipts" })),
    ).toEqual(["Project Alpha", "Receipts"]);
    expect(keyword_labels(email_with({ keywords: "Project Alpha" }))).toEqual([
      "Project Alpha",
    ]);
  });

  it("ignores mail client state keywords", () => {
    expect(
      keyword_labels(
        email_with({ "x-keywords": "$Forwarded NonJunk $label1 work" }),
      ),
    ).toEqual(["work"]);
  });
});

describe("classify_import_email", () => {
  it("turns every custom label of the label header into a label", () => {
    const d = classify_import_email(
      email_with({
        "x-gmail-labels": 'Inbox,Work,"Taxes, 2025",Receipts/2025,Starred',
      }),
    );

    expect(d.tag_names).toEqual(["Work", "Taxes, 2025", "Receipts/2025"]);
    expect(d.custom_labels).toEqual([]);
    expect(d.is_starred).toBe(true);
    expect(d.is_archived).toBe(false);
  });

  it("archives labeled mail that is not in the inbox", () => {
    const d = classify_import_email(
      email_with({ "x-gmail-labels": "Archived,Receipts" }),
    );

    expect(d.is_archived).toBe(true);
    expect(d.tag_names).toEqual(["Receipts"]);
  });

  it("excludes system and state labels", () => {
    const d = classify_import_email(
      email_with({
        "x-gmail-labels":
          "Inbox,Sent,Spam,Trash,Starred,Important,Unread,Opened,Category Updates,IMAP_Forwarded,[Imap]/Sent",
        "x-keywords": "Junk, Archive, Flagged, Inbox",
      }),
    );

    expect(d.tag_names).toEqual([]);
    expect(d.custom_labels).toEqual([]);
  });

  it("dedupes labels case-insensitively across headers", () => {
    const d = classify_import_email(
      email_with({
        "x-gmail-labels": "Inbox,Work,work,Family",
        "x-keywords": "WORK, family, Travel",
        keywords: "travel",
      }),
    );

    expect(d.tag_names).toEqual(["Work", "Family", "Travel"]);
  });

  it("keeps a real source folder as a folder and adds keywords as labels", () => {
    const email = email_with({ "x-keywords": "Urgent" }, "Projects/Alpha");
    const d = classify_import_email(email);

    expect(d.custom_labels).toEqual(["Projects/Alpha"]);
    expect(d.tag_names).toEqual(["Urgent"]);
    expect(extract_source_folders([email])).toEqual(["Projects/Alpha"]);
  });

  it("does not let keywords change where the message goes", () => {
    const d = classify_import_email(
      email_with({ "x-keywords": "Trash, Spam, Drafts, Sent" }),
    );

    expect(d).toMatchObject({
      skip: false,
      sent: false,
      is_trashed: false,
      is_spam: false,
      tag_names: [],
    });
  });
});

describe("label names and tokens", () => {
  it("normalizes label paths", () => {
    expect(normalize_label_path(" Parent / Child ")).toBe("Parent/Child");
    expect(normalize_label_path("/Parent//Child/")).toBe("Parent/Child");
  });

  it("collects unique labels of imported mail in first-seen order", () => {
    expect(
      extract_source_tags([
        email_with({ "x-gmail-labels": "Inbox,Work,Family" }),
        email_with({ "x-gmail-labels": "Inbox,work,Travel" }),
        email_with({ "x-gmail-labels": "Drafts,Ideas" }),
      ]),
    ).toEqual(["Work", "Family", "Travel"]);
  });

  it("puts a message with three labels in no folder and gives it three tokens", () => {
    const email = email_with({ "x-gmail-labels": "Inbox,Work,Family,Travel" });
    const tag_map = new Map([
      ["work", "t1"],
      ["family", "t2"],
      ["travel", "t3"],
    ]);

    expect(folder_for_email(email, new Map([["Work", "folder"]]))).toBe(
      undefined,
    );
    expect(tag_tokens_for_email(email, tag_map)).toEqual(["t1", "t2", "t3"]);
  });

  it("leaves out labels that have no token", () => {
    const email = email_with({ "x-gmail-labels": "Inbox,Work,Family" });

    expect(tag_tokens_for_email(email, new Map([["family", "t2"]]))).toEqual([
      "t2",
    ]);
    expect(tag_tokens_for_email(email, new Map())).toEqual([]);
  });

  it("caps the tokens sent for one message", () => {
    const names = Array.from({ length: 60 }, (_, i) => `Label ${i}`);
    const email = email_with({ "x-gmail-labels": names.join(",") });
    const tag_map = new Map(
      names.map((name) => [name.toLowerCase(), "tok-" + name]),
    );
    const tokens = tag_tokens_for_email(email, tag_map);

    expect(tokens).toHaveLength(MAX_TAGS_PER_EMAIL);
    expect(tokens[0]).toBe("tok-Label 0");
  });
});
