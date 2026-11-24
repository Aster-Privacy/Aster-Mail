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
import type { ThreadMessageItem } from "./api/mail_threads";

import { describe, it, expect, beforeEach } from "vitest";

import { decrypt_thread_content_cached } from "./thread_decrypt_cache";
import {
  clear_decrypted_mime_attachments,
  get_shown_decrypted_mime_attachments,
  set_decrypted_mime_attachments,
  were_decrypted_mime_attachments_evicted,
} from "./decrypted_mime_attachments";

const TAG = "tag-of-the-message";

function part(name: string) {
  return {
    filename: name,
    content_type: "application/pdf",
    data: new Uint8Array([1, 2, 3]),
  } as unknown as Parameters<typeof set_decrypted_mime_attachments>[1][number];
}

function message(id: string): ThreadMessageItem {
  return {
    id,
    encrypted_envelope: `envelope-${id}`,
    envelope_nonce: `nonce-${id}`,
  } as unknown as ThreadMessageItem;
}

function decrypt_counting(id: string, counter: { calls: number }) {
  return async () => {
    counter.calls += 1;
    set_decrypted_mime_attachments(id, [part("invoice.pdf")], TAG);

    return {
      value: {
        body_text: "Body",
        decrypted_content_tag: TAG,
      } as never,
      cacheable: true,
    };
  };
}

function push_out_of_the_store(): void {
  for (let i = 0; i < 60; i += 1) {
    set_decrypted_mime_attachments(`other-${i}`, [part("other.pdf")], "other");
  }
}

describe("cached thread content with decrypted attachments", () => {
  beforeEach(() => {
    clear_decrypted_mime_attachments();
  });

  it("reuses the cache while the attachments are still stored", async () => {
    const counter = { calls: 0 };
    const msg = message("kept");

    await decrypt_thread_content_cached(
      msg,
      "thread-a",
      "me@example.test",
      decrypt_counting("kept", counter),
    );
    await decrypt_thread_content_cached(
      msg,
      "thread-a",
      "me@example.test",
      decrypt_counting("kept", counter),
    );

    expect(counter.calls).toBe(1);
    expect(get_shown_decrypted_mime_attachments("kept", TAG)).toHaveLength(1);
  });

  it("decrypts again when the attachments were evicted from the store", async () => {
    const counter = { calls: 0 };
    const msg = message("evicted");

    await decrypt_thread_content_cached(
      msg,
      "thread-b",
      "me@example.test",
      decrypt_counting("evicted", counter),
    );
    push_out_of_the_store();

    expect(get_shown_decrypted_mime_attachments("evicted", TAG)).toHaveLength(
      0,
    );
    expect(were_decrypted_mime_attachments_evicted("evicted", TAG)).toBe(true);

    const content = await decrypt_thread_content_cached(
      msg,
      "thread-b",
      "me@example.test",
      decrypt_counting("evicted", counter),
    );

    expect(counter.calls).toBe(2);
    expect(content?.decrypted_content_tag).toBe(TAG);
    expect(get_shown_decrypted_mime_attachments("evicted", TAG)).toHaveLength(
      1,
    );
    expect(were_decrypted_mime_attachments_evicted("evicted", TAG)).toBe(false);
  });

  it("forgets evictions when the store is cleared", () => {
    set_decrypted_mime_attachments("first", [part("a.pdf")], TAG);
    push_out_of_the_store();
    expect(were_decrypted_mime_attachments_evicted("first", TAG)).toBe(true);

    clear_decrypted_mime_attachments();

    expect(were_decrypted_mime_attachments_evicted("first", TAG)).toBe(false);
  });

  it("does not flag a message whose content changed", () => {
    set_decrypted_mime_attachments("changed", [part("a.pdf")], TAG);
    push_out_of_the_store();

    expect(were_decrypted_mime_attachments_evicted("changed", "new-tag")).toBe(
      false,
    );
    expect(were_decrypted_mime_attachments_evicted(undefined, TAG)).toBe(false);
  });
});
