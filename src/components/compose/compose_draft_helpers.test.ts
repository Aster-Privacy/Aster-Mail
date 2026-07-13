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
import { describe, it, expect, vi } from "vitest";

import type { Attachment } from "@/components/compose/compose_shared";

const array_buffer_to_base64_spy = vi.fn((buffer: ArrayBuffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = "";

  for (const byte of bytes) binary += String.fromCharCode(byte);

  return btoa(binary);
});

vi.mock("@/components/compose/compose_base64", () => ({
  array_buffer_to_base64: (buffer: ArrayBuffer) =>
    array_buffer_to_base64_spy(buffer),
  base64_to_array_buffer: () => new ArrayBuffer(0),
}));

import { attachments_to_draft_data } from "@/components/compose/compose_draft_helpers";

function make_attachment(id: string, bytes: number[]): Attachment {
  const buffer = new Uint8Array(bytes).buffer;

  return {
    id,
    name: `${id}.bin`,
    size: `${bytes.length} B`,
    size_bytes: bytes.length,
    mime_type: "application/octet-stream",
    data: buffer,
  };
}

describe("attachments_to_draft_data caching", () => {
  it("encodes each attachment buffer only once across repeated autosaves", () => {
    array_buffer_to_base64_spy.mockClear();

    const att_a = make_attachment("a", [1, 2, 3]);
    const att_b = make_attachment("b", [4, 5, 6]);
    const attachments = [att_a, att_b];

    const first = attachments_to_draft_data(attachments);
    const second = attachments_to_draft_data(attachments);

    expect(array_buffer_to_base64_spy).toHaveBeenCalledTimes(2);
    expect(second[0].data_base64).toBe(first[0].data_base64);
    expect(second[1].data_base64).toBe(first[1].data_base64);
  });

  it("re-encodes when an attachment buffer actually changes", () => {
    array_buffer_to_base64_spy.mockClear();

    const original = make_attachment("c", [7, 8, 9]);

    attachments_to_draft_data([original]);

    const replaced = make_attachment("c", [10, 11, 12]);

    attachments_to_draft_data([replaced]);

    expect(array_buffer_to_base64_spy).toHaveBeenCalledTimes(2);
  });
});
