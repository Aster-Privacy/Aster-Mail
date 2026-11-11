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
import type { ImportLoadItem } from "./import_collection";

import { describe, it, expect } from "vitest";

import {
  build_import_collection,
  eml_source_folder,
  mbox_source_folder,
} from "./import_collection";
import { MAX_FILE_SIZE } from "./types";

function make_message(
  n: number,
  options: { body_pad?: number; message_id?: boolean; from?: boolean } = {},
): string {
  const { body_pad = 0, message_id = true, from = true } = options;

  return (
    `From sender${n}@example.com Mon Jan 01 00:00:00 2026\n` +
    (from ? `From: Sender ${n} <sender${n}@example.com>\n` : "") +
    `To: user@example.com\n` +
    `Subject: Message ${n}\n` +
    (message_id ? `Message-ID: <msg${n}@example.com>\n` : "") +
    `X-Gmail-Labels: Inbox,Label ${n % 2}\n` +
    `Date: Mon, 01 Jan 2026 00:00:0${n % 10} +0000\n` +
    `\n` +
    `body of message ${n}\n` +
    "x".repeat(body_pad) +
    `\n`
  );
}

function as_file(text: string, name = "test.mbox"): File {
  return new File([new TextEncoder().encode(text)], name, {
    type: "application/mbox",
  });
}

async function collect(
  generator: AsyncGenerator<ImportLoadItem>,
): Promise<ImportLoadItem[]> {
  const items: ImportLoadItem[] = [];

  for await (const item of generator) items.push(item);

  return items;
}

describe("mbox_source_folder", () => {
  it("names archive files after their folder", () => {
    expect(mbox_source_folder("Archive.mbox")).toBe("Archive");
    expect(mbox_source_folder("archives.MBOX")).toBe("archives");
    expect(mbox_source_folder("Archived.mbx")).toBe("Archived");
    expect(mbox_source_folder("Archives")).toBe("Archives");
  });

  it("names every other file after its own name", () => {
    expect(mbox_source_folder("Inbox.mbox")).toBe("Inbox");
    expect(mbox_source_folder("Sent.mbox")).toBe("Sent");
    expect(mbox_source_folder("Junk.mbx")).toBe("Junk");
    expect(mbox_source_folder("Archive 2024.mbox")).toBe("Archive 2024");
    expect(mbox_source_folder("Receipts.mbox")).toBe("Receipts");
  });

  it("leaves generic export names alone", () => {
    expect(
      mbox_source_folder("All mail Including Spam and Trash.mbox"),
    ).toBeUndefined();
    expect(mbox_source_folder("export.mbox")).toBeUndefined();
    expect(mbox_source_folder("mbox")).toBeUndefined();
  });

  it("nests files under the subfolders of an uploaded folder", () => {
    expect(
      mbox_source_folder("Acme.mbox", "Mail export/Work/Clients/Acme.mbox"),
    ).toBe("Work/Clients/Acme");
    expect(mbox_source_folder("Sent.mbox", "Mail export/Sent.mbox")).toBe(
      "Sent",
    );
    expect(mbox_source_folder("Receipts.mbox", "/Receipts.mbox")).toBe(
      "Receipts",
    );
    expect(
      mbox_source_folder("Acme.mbox", "/Dropped\\Work\\Acme.mbox"),
    ).toBe("Work/Acme");
  });

  it("strips mailbox directory suffixes from the path", () => {
    expect(
      mbox_source_folder("Acme.mbox", "Profile/Work.sbd/Clients.sbd/Acme.mbox"),
    ).toBe("Work/Clients/Acme");
    expect(mbox_source_folder("mbox", "Export/Work.mbox/Projects.mbox/mbox")).toBe(
      "Work/Projects",
    );
    expect(mbox_source_folder("mbox", "Work.mbox/mbox")).toBe("Work");
    expect(mbox_source_folder("export.mbox", "Export/Work/export.mbox")).toBe(
      "Work",
    );
  });
});

describe("eml_source_folder", () => {
  it("uses the subfolders below the uploaded folder", () => {
    expect(eml_source_folder("Export/Work/Clients/a.eml")).toBe(
      "Work/Clients",
    );
    expect(eml_source_folder("Export/a.eml")).toBeUndefined();
    expect(eml_source_folder("a.eml")).toBeUndefined();
    expect(eml_source_folder(undefined)).toBeUndefined();
  });
});

describe("build_import_collection", () => {
  it("files every message of an archive mbox under that folder", async () => {
    const text = [1, 2]
      .map((n) => make_message(n).replace(/X-Gmail-Labels: [^\n]*\n/, ""))
      .join("");
    const collection = await build_import_collection([
      as_file(text, "Archive.mbox"),
    ]);
    const items = await collect(collection.load(new Set([0, 1])));

    expect(collection.summaries.map((s) => s.source_folder)).toEqual([
      "Archive",
      "Archive",
    ]);
    expect(items.map((i) => i.email?.source_folder)).toEqual([
      "Archive",
      "Archive",
    ]);
  });

  it("does not set a folder for generic mbox exports", async () => {
    const collection = await build_import_collection([
      as_file(make_message(1), "export.mbox"),
    ]);

    expect(collection.summaries[0].source_folder).toBeUndefined();
  });

  it("files every message of a named mbox under that name", async () => {
    const text = [1, 2]
      .map((n) => make_message(n).replace(/X-Gmail-Labels: [^\n]*\n/, ""))
      .join("");
    const collection = await build_import_collection([
      as_file(text, "Receipts.mbox"),
    ]);
    const items = await collect(collection.load(new Set([0, 1])));

    expect(items.map((i) => i.email?.source_folder)).toEqual([
      "Receipts",
      "Receipts",
    ]);
  });

  it("nests mbox files by the folder they were uploaded from", async () => {
    const file = as_file(make_message(1), "Acme.mbox");

    Object.defineProperty(file, "webkitRelativePath", {
      value: "Mail export/Work/Acme.mbox",
    });
    const collection = await build_import_collection([file]);

    expect(collection.summaries[0].source_folder).toBe("Work/Acme");
  });

  it("keeps only header summaries for mbox files", async () => {
    const text = [1, 2, 3].map((n) => make_message(n)).join("");
    const collection = await build_import_collection([as_file(text)]);

    expect(collection.errors).toEqual([]);
    expect(collection.summaries.map((s) => s.message_id)).toEqual([
      "msg1@example.com",
      "msg2@example.com",
      "msg3@example.com",
    ]);
    expect(collection.summaries[1].raw_headers["x-gmail-labels"]).toBe(
      "Inbox,Label 0",
    );
    expect(collection.summaries[0].text_body).toBeNull();
  });

  it("loads full emails for the requested indices only", async () => {
    const text = [1, 2, 3, 4].map((n) => make_message(n)).join("");
    const collection = await build_import_collection([as_file(text)]);
    const items = await collect(collection.load(new Set([1, 3])));

    expect(items.map((i) => i.index)).toEqual([1, 3]);
    expect(items.every((i) => i.status === "ready")).toBe(true);
    expect(items[0].email?.text_body).toContain("body of message 2");
    expect(items[1].email?.text_body).toContain("body of message 4");
  });

  it("keeps generated message ids stable between the scan and the load", async () => {
    const text =
      make_message(1, { message_id: false }) +
      make_message(2, { message_id: false });
    const collection = await build_import_collection([as_file(text)]);
    const items = await collect(collection.load(new Set([0, 1])));

    expect(items.map((i) => i.email?.message_id)).toEqual(
      collection.summaries.map((s) => s.message_id),
    );
  });

  it("skips messages without a sender and warns about them", async () => {
    const text =
      make_message(1) + make_message(2, { from: false }) + make_message(3);
    const collection = await build_import_collection([as_file(text)]);

    expect(collection.summaries).toHaveLength(2);
    expect(collection.warnings).toHaveLength(1);

    const items = await collect(collection.load(new Set([0, 1])));

    expect(items.map((i) => i.email?.subject)).toEqual([
      "Message 1",
      "Message 3",
    ]);
  });

  it("streams messages that straddle the read boundary", async () => {
    const text =
      make_message(1, { body_pad: 9 * 1024 * 1024 }) +
      make_message(2) +
      make_message(3);
    const collection = await build_import_collection([as_file(text)]);
    const items = await collect(collection.load(new Set([0, 1, 2])));

    expect(items.map((i) => i.email?.subject)).toEqual([
      "Message 1",
      "Message 2",
      "Message 3",
    ]);
  });

  it("combines mbox and eml files in order", async () => {
    const eml = `From: Solo <solo@example.com>\nSubject: Solo\nMessage-ID: <solo@example.com>\n\nsolo body\n`;
    const collection = await build_import_collection([
      as_file(make_message(1) + make_message(2)),
      as_file(eml, "solo.eml"),
    ]);
    const items = await collect(collection.load(new Set([0, 1, 2])));

    expect(items.map((i) => i.email?.message_id)).toEqual([
      "msg1@example.com",
      "msg2@example.com",
      "solo@example.com",
    ]);
  });

  it("does not apply the in-memory size limit to mbox files", async () => {
    const file = as_file(make_message(1));

    Object.defineProperty(file, "size", { value: MAX_FILE_SIZE + 1 });

    const collection = await build_import_collection([file]);

    expect(collection.errors).toEqual([]);
  });

  it("reports no emails for an mbox without messages", async () => {
    const collection = await build_import_collection([
      as_file("nothing useful here\n"),
    ]);

    expect(collection.summaries).toHaveLength(0);
    expect(collection.errors).toHaveLength(1);
  });
});
