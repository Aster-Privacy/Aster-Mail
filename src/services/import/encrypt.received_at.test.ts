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
import type { EncryptedVault } from "@/services/crypto/key_manager";
import type { ParsedEmail } from "./types";

import { describe, expect, it, vi } from "vitest";

const sealed_envelopes: Record<string, unknown>[] = [];

vi.mock("@/services/crypto/stored_envelope_write", () => ({
  encrypt_envelope_for_storage: vi.fn(
    async (envelope: Record<string, unknown>) => {
      sealed_envelopes.push(envelope);

      return { encrypted: "sealed", nonce: "nonce" };
    },
  ),
}));

vi.mock("@/services/crypto/identity_key_required", () => ({
  with_identity_key: vi.fn((vault: unknown) => ({
    ...(vault as object),
    identity_key: "identity",
  })),
}));

vi.mock("./dedupe_hash", () => ({
  compute_import_dedupe_hash: vi.fn(async () => "hash"),
}));

const { encrypt_imported_email } = await import("./encrypt");
const { sealed_timestamp } =
  await import("@/services/crypto/sealed_message_fields");

function parsed_email(date: Date): ParsedEmail {
  return {
    message_id: "<one@example.com>",
    from: "a@example.com",
    to: ["b@example.com"],
    cc: [],
    bcc: [],
    subject: "Hello",
    date,
    html_body: null,
    text_body: "Body",
    attachments: [],
    raw_headers: {},
  };
}

describe("imported mail timestamps", () => {
  it("sends the server only the day of an imported message", async () => {
    const sent = new Date("2019-03-14T07:26:53.589Z");
    const result = await encrypt_imported_email(
      parsed_email(sent),
      {} as EncryptedVault,
      "mbox",
      "msgid",
    );

    expect(result.received_at).not.toBe(sent.toISOString());
    expect(result.received_at).toBe("2019-03-14T12:00:00.000Z");
  });

  it("keeps the exact time inside the encrypted envelope", async () => {
    sealed_envelopes.length = 0;
    const sent = new Date("2021-11-02T23:59:10.000Z");

    await encrypt_imported_email(
      parsed_email(sent),
      {} as EncryptedVault,
      "mbox",
      "msgid",
    );

    expect(sealed_envelopes[0]?.sent_at).toBe(sent.toISOString());
  });

  it("shows the sealed time for imported mail", () => {
    expect(
      sealed_timestamp(
        {
          sent_at: "2019-03-14T07:26:53.589Z",
          imported_at: "2026-01-01T00:00:00.000Z",
        },
        false,
        "2019-03-14T12:00:00.000Z",
      ),
    ).toBe("2019-03-14T07:26:53.589Z");
  });

  it("keeps the served time for other mail", () => {
    expect(
      sealed_timestamp(
        { sent_at: "2019-03-14T07:26:53.589Z" },
        false,
        "2019-03-14T07:30:00.000Z",
      ),
    ).toBe("2019-03-14T07:30:00.000Z");
  });
});
