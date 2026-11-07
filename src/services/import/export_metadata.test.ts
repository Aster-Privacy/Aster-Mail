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

import { build_import_collection } from "./import_collection";
import { is_supported_import_file } from "./file_collection";
import {
  build_export_metadata_index,
  is_export_sidecar_file,
  parse_export_labels,
  parse_export_message,
} from "./export_metadata";

import { classify_import_email } from "@/components/settings/import_modal/helpers";

function eml(id: string, subject: string): string {
  return [
    "From: Ana <ana@example.com>",
    "To: me@example.com",
    `Subject: ${subject}`,
    "Date: Mon, 02 Nov 2026 10:00:00 +0000",
    `Message-ID: <${id}@example.com>`,
    `X-Pm-Internal-Id: ${id}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=utf-8",
    "",
    `Body of ${subject}`,
    "",
  ].join("\r\n");
}

function metadata(id: string, label_ids: string[], unread: unknown): string {
  return JSON.stringify({
    Version: 1,
    Payload: { ID: id, LabelIDs: label_ids, Unread: unread, Subject: "x" },
  });
}

const LABELS_JSON = JSON.stringify({
  Version: 1,
  Payload: [
    { ID: "fold1", Name: "Projects", Path: "Work/Projects", Type: 3 },
    { ID: "tag1", Name: "Receipts", Path: "Receipts", Type: 1 },
  ],
});

function file(name: string, body: string): File {
  return new File([body], name);
}

async function classify_collection(files: File[]) {
  const collection = await build_import_collection(files);

  return new Map(
    collection.summaries.map((email) => [
      email.subject,
      classify_import_email(email),
    ]),
  );
}

describe("export sidecar files", () => {
  it("recognizes metadata and labels files", () => {
    expect(is_export_sidecar_file("abc.metadata.json")).toBe(true);
    expect(is_export_sidecar_file("mail_20261102/labels.json")).toBe(true);
    expect(is_export_sidecar_file("LABELS.JSON")).toBe(true);
    expect(is_export_sidecar_file("abc.eml")).toBe(false);
    expect(is_export_sidecar_file("package.json")).toBe(false);
    expect(is_supported_import_file("abc.metadata.json")).toBe(true);
    expect(is_supported_import_file("labels.json")).toBe(true);
    expect(is_supported_import_file("other.json")).toBe(false);
  });

  it("parses labels and ignores malformed entries", () => {
    const labels = parse_export_labels([
      { ID: "a", Path: "Work/Projects", Name: "Projects", Type: 3 },
      { ID: "b", Name: "Receipts", Type: 1 },
      { ID: 3, Name: "bad" },
      { ID: "c", Path: "", Name: "", Type: 1 },
      "junk",
    ]);

    expect(labels.get("a")).toEqual({ name: "Work/Projects", type: 3 });
    expect(labels.get("b")).toEqual({ name: "Receipts", type: 1 });
    expect(labels.size).toBe(2);
    expect(parse_export_labels(null).size).toBe(0);
  });

  it("parses unread as a number or a boolean", () => {
    expect(
      parse_export_message({ ID: "x", LabelIDs: ["0"], Unread: 1 }),
    ).toEqual({ id: "x", message: { label_ids: ["0"], unread: true } });
    expect(
      parse_export_message({ ID: "x", LabelIDs: ["0"], Unread: false })?.message
        .unread,
    ).toBe(false);
    expect(
      parse_export_message({ ID: "x", LabelIDs: [] })?.message.unread,
    ).toBeUndefined();
    expect(parse_export_message({ ID: "x" })).toBeNull();
  });

  it("skips files that are not valid JSON", async () => {
    const index = await build_export_metadata_index([
      file("broken.metadata.json", "{not json"),
      file("labels.json", "[]"),
    ]);

    expect(index.by_id.size).toBe(0);
    expect(index.labels.size).toBe(0);
  });
});

describe("importing an export folder", () => {
  it("restores folders, labels, stars, and read state", async () => {
    const result = await classify_collection([
      file("labels.json", LABELS_JSON),
      file("m1.eml", eml("m1", "inbox unread")),
      file("m1.metadata.json", metadata("m1", ["0", "5", "tag1"], 1)),
      file("m2.eml", eml("m2", "archived starred")),
      file("m2.metadata.json", metadata("m2", ["6", "5", "10"], 0)),
      file("m3.eml", eml("m3", "in folder")),
      file("m3.metadata.json", metadata("m3", ["fold1", "5"], false)),
      file("m4.eml", eml("m4", "trashed")),
      file("m4.metadata.json", metadata("m4", ["3", "5"], true)),
      file("m5.eml", eml("m5", "spam")),
      file("m5.metadata.json", metadata("m5", ["4"], 0)),
      file("m6.eml", eml("m6", "sent")),
      file("m6.metadata.json", metadata("m6", ["2", "7", "5"], 0)),
      file("m7.eml", eml("m7", "draft")),
      file("m7.metadata.json", metadata("m7", ["1", "8"], 0)),
    ]);

    expect(result.size).toBe(7);
    expect(result.get("inbox unread")).toMatchObject({
      is_read: false,
      is_archived: false,
      custom_labels: [],
      tag_names: ["Receipts"],
    });
    expect(result.get("archived starred")).toMatchObject({
      is_read: true,
      is_archived: true,
      is_starred: true,
    });
    expect(result.get("in folder")).toMatchObject({
      is_read: true,
      is_archived: false,
      custom_labels: ["Work/Projects"],
    });
    expect(result.get("trashed")).toMatchObject({
      is_read: false,
      is_trashed: true,
    });
    expect(result.get("spam")).toMatchObject({ is_spam: true });
    expect(result.get("sent")).toMatchObject({
      sent: true,
      is_archived: false,
    });
    expect(result.get("draft")?.skip).toBe(true);
  });

  it("matches metadata by file name when the header is missing", async () => {
    const raw = eml("m1", "no header").replace(/X-Pm-Internal-Id: .*\r\n/, "");
    const result = await classify_collection([
      file("m1.eml", raw),
      file("m1.metadata.json", metadata("other-id", ["6", "10"], 1)),
    ]);

    expect(result.get("no header")).toMatchObject({
      is_read: false,
      is_starred: true,
      is_archived: true,
    });
  });

  it("matches metadata by the message id header first", async () => {
    const result = await classify_collection([
      file("renamed.eml", eml("m9", "by header")),
      file("m9.metadata.json", metadata("m9", ["10", "0"], 1)),
      file("renamed.metadata.json", metadata("renamed", ["3"], 0)),
    ]);

    expect(result.get("by header")).toMatchObject({
      is_read: false,
      is_starred: true,
      is_trashed: false,
    });
  });

  it("ignores label ids that collide with object properties", async () => {
    const result = await classify_collection([
      file("labels.json", LABELS_JSON),
      file("m1.eml", eml("m1", "hostile")),
      file(
        "m1.metadata.json",
        metadata("m1", ["__proto__", "constructor", "toString", "0"], 0),
      ),
    ]);

    expect(result.get("hostile")).toMatchObject({
      is_read: true,
      custom_labels: [],
      tag_names: [],
    });
  });

  it("leaves mail without metadata unchanged", async () => {
    const result = await classify_collection([
      file("m1.eml", eml("m1", "plain")),
    ]);

    expect(result.get("plain")).toMatchObject({
      is_starred: false,
      is_archived: false,
      custom_labels: [],
      tag_names: [],
    });
    expect(result.get("plain")?.is_read).toBeUndefined();
  });
});
