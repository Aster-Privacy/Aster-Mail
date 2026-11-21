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
import type { SubjectBundle } from "@/utils/email_crypto";

import { describe, it, expect, beforeEach } from "vitest";

import {
  clear_attachment_keys,
  get_attachment_entry,
  get_attachment_key,
  has_sealed_attachment_manifest,
  is_attachment_row_listed,
  register_envelope_attachment_keys,
  register_sealed_attachment_manifest,
} from "./inbound_attachment_keys";
import { settle_sealed_fields } from "./sealed_message_fields";

function manifest_entry(seq: number, key: string, filename: string) {
  return {
    seq,
    key,
    filename,
    content_type: "application/pdf",
    size: 10,
    sha256: "a".repeat(64),
  };
}

describe("each decrypt replaces the attachments of its mail id", () => {
  beforeEach(() => {
    clear_attachment_keys();
  });

  it("drops entries from an earlier manifest under the same id", () => {
    expect(
      register_sealed_attachment_manifest("mail_x", [
        manifest_entry(0, "key_one", "invoice.pdf"),
      ]),
    ).toBe(true);

    expect(
      register_sealed_attachment_manifest("mail_x", [
        manifest_entry(1, "key_two", "notes.pdf"),
      ]),
    ).toBe(true);

    expect(get_attachment_entry("mail_x", 0)).toBeNull();
    expect(get_attachment_key("mail_x", 0)).toBe("");
    expect(is_attachment_row_listed("mail_x", 0)).toBe(false);
    expect(get_attachment_entry("mail_x", 1)?.filename).toBe("notes.pdf");
    expect(has_sealed_attachment_manifest("mail_x")).toBe(true);
  });

  it("clears the sealed mark and entries for an empty manifest", () => {
    register_sealed_attachment_manifest("mail_x", [
      manifest_entry(0, "key_one", "invoice.pdf"),
    ]);

    expect(register_sealed_attachment_manifest("mail_x", [])).toBe(false);

    expect(has_sealed_attachment_manifest("mail_x")).toBe(false);
    expect(get_attachment_entry("mail_x", 0)).toBeNull();
    expect(get_attachment_key("mail_x", 0)).toBe("");
  });

  it("clears the sealed mark when the message has no manifest", () => {
    register_sealed_attachment_manifest("mail_x", [
      manifest_entry(0, "key_one", "invoice.pdf"),
    ]);

    register_sealed_attachment_manifest("mail_x", undefined);

    expect(has_sealed_attachment_manifest("mail_x")).toBe(false);
    expect(get_attachment_entry("mail_x", 0)).toBeNull();
  });

  it("clears the sealed mark when a later decrypt is not sealed", () => {
    register_sealed_attachment_manifest("mail_x", [
      manifest_entry(0, "key_one", "invoice.pdf"),
    ]);

    const bundle = { subject: null, body: "" } as SubjectBundle;

    settle_sealed_fields({ subject: "Later" }, bundle, false, "mail_x");

    expect(has_sealed_attachment_manifest("mail_x")).toBe(false);
    expect(get_attachment_entry("mail_x", 0)).toBeNull();
  });

  it("replaces envelope keys from a different envelope", () => {
    register_envelope_attachment_keys("mail_y", {
      attachment_keys: [{ seq: 0, key: "key_a" }],
    });
    register_envelope_attachment_keys("mail_y", {
      attachment_keys: [{ seq: 1, key: "key_b" }],
    });

    expect(get_attachment_key("mail_y", 0)).toBe("");
    expect(is_attachment_row_listed("mail_y", 0)).toBe(false);
    expect(get_attachment_key("mail_y", 1)).toBe("key_b");
  });

  it("takes a different envelope's keys once a decrypt finds no manifest", () => {
    register_envelope_attachment_keys("mail_z", { attachment_keys: [] });
    register_sealed_attachment_manifest("mail_z", [
      manifest_entry(0, "key_one", "invoice.pdf"),
    ]);

    register_envelope_attachment_keys("mail_z", {
      attachment_keys: [{ seq: 3, key: "key_c" }],
    });

    expect(has_sealed_attachment_manifest("mail_z")).toBe(true);
    expect(get_attachment_key("mail_z", 0)).toBe("key_one");
    expect(get_attachment_key("mail_z", 3)).toBe("");

    register_sealed_attachment_manifest("mail_z", undefined);

    expect(has_sealed_attachment_manifest("mail_z")).toBe(false);
    expect(get_attachment_entry("mail_z", 0)).toBeNull();
    expect(get_attachment_key("mail_z", 3)).toBe("key_c");
  });

  it("keeps the manifest when the same envelope is registered again", () => {
    const envelope = { attachment_keys: [{ seq: 0, key: "outer_key" }] };

    register_envelope_attachment_keys("mail_w", envelope);
    register_sealed_attachment_manifest("mail_w", [
      manifest_entry(0, "key_one", "invoice.pdf"),
    ]);
    register_envelope_attachment_keys("mail_w", structuredClone(envelope));

    expect(has_sealed_attachment_manifest("mail_w")).toBe(true);
    expect(get_attachment_key("mail_w", 0)).toBe("key_one");
    expect(get_attachment_entry("mail_w", 0)?.filename).toBe("invoice.pdf");
  });

  it("keeps the manifest when a cached copy registers in either order", () => {
    const envelope = { attachment_keys: [] };
    const manifest = [manifest_entry(2, "key_two", "notes.pdf")];

    register_sealed_attachment_manifest("mail_v", manifest);
    register_envelope_attachment_keys("mail_v", envelope);
    register_sealed_attachment_manifest("mail_v", manifest);
    register_envelope_attachment_keys("mail_v", envelope);

    expect(has_sealed_attachment_manifest("mail_v")).toBe(true);
    expect(get_attachment_key("mail_v", 2)).toBe("key_two");
    expect(is_attachment_row_listed("mail_v", 2)).toBe(true);
  });
});
