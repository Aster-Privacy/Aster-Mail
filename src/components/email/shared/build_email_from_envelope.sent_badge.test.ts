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
import type { DecryptedEnvelope } from "@/types/email";

import { describe, expect, it, vi } from "vitest";

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: vi.fn(() => null),
  get_passphrase_from_memory: vi.fn(() => null),
  get_passphrase_bytes: vi.fn(() => null),
  get_derived_encryption_key: vi.fn(() => new Uint8Array(32).fill(7)),
  has_vault_in_memory: vi.fn(() => false),
  wait_for_keys_ready: vi.fn(async () => undefined),
}));

import {
  process_envelope_body,
  raw_envelope_body,
} from "./build_email_from_envelope";

function sent_copy(sent_encryption?: unknown): DecryptedEnvelope {
  return {
    subject: "Sent copy",
    body_text: "Plain body",
    body_html: "<p>Plain body</p>",
    from: { name: "", email: "me@astermail.org" },
    to: [{ name: "", email: "pal@example.com" }],
    cc: [],
    bcc: [],
    sent_at: "2026-11-03T10:00:00.000Z",
    ...(sent_encryption === undefined ? {} : { sent_encryption }),
  } as unknown as DecryptedEnvelope;
}

describe("sent copy encryption badge", () => {
  it("marks a sent copy end-to-end when every outside recipient got PGP", async () => {
    const result = await process_envelope_body(
      sent_copy({ outside: 1, outside_pgp: 1, internal_readable: 0 }),
      "me@astermail.org",
      "item-1",
    );

    expect(result.e2e_verified).toBe(true);
    expect(result.sent_encryption_scope).toBe("outside");
  });

  it("marks an encrypted send to Aster recipients end-to-end", async () => {
    const result = await process_envelope_body(
      sent_copy({ outside: 0, outside_pgp: 0, internal_readable: 0 }),
      "me@astermail.org",
      "item-5",
    );

    expect(result.e2e_verified).toBe(true);
    expect(result.sent_encryption_scope).toBe("internal");
  });

  it("leaves a mixed send unverified", async () => {
    const result = await process_envelope_body(
      sent_copy({ outside: 2, outside_pgp: 1, internal_readable: 0 }),
      "me@astermail.org",
      "item-2",
    );

    expect(result.e2e_verified).toBe(false);
  });

  it("leaves a send with a readable internal copy unverified", async () => {
    const result = await process_envelope_body(
      sent_copy({ outside: 1, outside_pgp: 1, internal_readable: 1 }),
      "me@astermail.org",
      "item-3",
    );

    expect(result.e2e_verified).toBe(false);
  });

  it("leaves a legacy sent copy without evidence unverified", async () => {
    const result = await process_envelope_body(
      sent_copy(),
      "me@astermail.org",
      "item-4",
    );

    expect(result.e2e_verified).toBe(false);
  });

  it("keeps the evidence when the body falls back to the raw envelope", () => {
    expect(
      raw_envelope_body(
        sent_copy({ outside: 1, outside_pgp: 1, internal_readable: 0 }),
      ).e2e_verified,
    ).toBe(true);
    expect(raw_envelope_body(sent_copy()).e2e_verified).toBe(false);
    expect(
      raw_envelope_body(sent_copy()).sent_encryption_scope,
    ).toBeUndefined();
  });
});
