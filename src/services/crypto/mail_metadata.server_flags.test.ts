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
import { describe, it, expect } from "vitest";

import type { MailItemMetadata } from "@/types/email";

import {
  extract_metadata_from_server,
  metadata_flag_patch,
} from "./mail_metadata";

function base(overrides: Partial<MailItemMetadata> = {}): MailItemMetadata {
  return {
    is_read: false,
    is_starred: false,
    is_pinned: false,
    is_trashed: false,
    is_archived: false,
    is_spam: false,
    size_bytes: 0,
    has_attachments: false,
    attachment_count: 0,
    message_ts: "2026-07-30T00:00:00.000Z",
    item_type: "received",
    ...overrides,
  };
}

describe("extract_metadata_from_server", () => {
  it("adopts a server trash flag written by another device", () => {
    const merged = extract_metadata_from_server(base(), {
      is_trashed: true,
      item_type: "received",
    });

    expect(merged.is_trashed).toBe(true);
  });

  it("does not un-trash an item whose plaintext column is stale", () => {
    const merged = extract_metadata_from_server(base({ is_trashed: true }), {
      is_trashed: false,
      item_type: "received",
    });

    expect(merged.is_trashed).toBe(true);
  });

  it("lets the server win on read state in both directions", () => {
    expect(
      extract_metadata_from_server(base({ is_read: true }), {
        is_read: false,
        item_type: "received",
      }).is_read,
    ).toBe(false);

    expect(
      extract_metadata_from_server(base({ is_read: false }), {
        is_read: true,
        item_type: "received",
      }).is_read,
    ).toBe(true);
  });

  it("keeps sent items read regardless of the server flag", () => {
    const merged = extract_metadata_from_server(base(), {
      is_read: false,
      item_type: "sent",
    });

    expect(merged.is_read).toBe(true);
  });

  it("adopts archive and spam flags from the server", () => {
    const merged = extract_metadata_from_server(base(), {
      is_archived: true,
      is_spam: true,
      is_starred: true,
      is_pinned: true,
      item_type: "received",
    });

    expect(merged.is_archived).toBe(true);
    expect(merged.is_spam).toBe(true);
    expect(merged.is_starred).toBe(true);
    expect(merged.is_pinned).toBe(true);
  });

  it("seeds every flag from the server when metadata cannot be decrypted", () => {
    const merged = extract_metadata_from_server(null, {
      is_read: true,
      is_starred: true,
      is_trashed: true,
      item_type: "received",
    });

    expect(merged.is_read).toBe(true);
    expect(merged.is_starred).toBe(true);
    expect(merged.is_trashed).toBe(true);
    expect(merged.is_archived).toBe(false);
  });
});

describe("metadata_flag_patch", () => {
  it("emits every plaintext flag the server counts on", () => {
    expect(metadata_flag_patch(base({ is_read: true, is_archived: true }))).toEqual(
      {
        is_read: true,
        is_starred: false,
        is_pinned: false,
        is_trashed: false,
        is_archived: true,
        is_spam: false,
      },
    );
  });

  it("defaults missing flags to false", () => {
    expect(metadata_flag_patch({} as MailItemMetadata)).toEqual({
      is_read: false,
      is_starred: false,
      is_pinned: false,
      is_trashed: false,
      is_archived: false,
      is_spam: false,
    });
  });
});
