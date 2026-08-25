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
import { describe, it, expect, vi, beforeEach } from "vitest";

const list_attachments = vi.fn();

vi.mock("@/services/api/attachments", () => ({
  list_attachments: (...args: unknown[]) => list_attachments(...args),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  decrypt_attachment_meta: vi.fn(),
  decrypt_attachment_data: vi.fn(),
}));

import { resolve_cid_references } from "./cid_resolver";
import { clear_attachment_preview_cache } from "@/services/attachment_preview_cache";

const html = '<img src="cid:logo@a" alt="logo">';

describe("inline images when the attachment list cannot be fetched", () => {
  beforeEach(() => {
    list_attachments.mockReset();
    clear_attachment_preview_cache();
  });

  it("reports the records as unavailable so the caller can retry", async () => {
    list_attachments.mockRejectedValue(new Error("network down"));

    const result = await resolve_cid_references(html, "item_1");

    expect(result.records_unavailable).toBe(true);
  });

  it("does not report unavailable when the message truly has no attachments", async () => {
    list_attachments.mockResolvedValue({ data: { attachments: [] } });

    const result = await resolve_cid_references(html, "item_2");

    expect(result.records_unavailable).toBe(false);
  });
});
