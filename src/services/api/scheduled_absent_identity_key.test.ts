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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { en } from "@/lib/i18n/translations/en";
import {
  clear_legacy_keks_from_memory,
  load_legacy_keks_into_memory,
  load_previous_key_derived_keks_into_memory,
  serialize_kek_for_vault,
} from "@/services/crypto/legacy_keks";

const get = vi.fn();
const del = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: vi.fn(),
    get: (...args: unknown[]) => get(...args),
    patch: vi.fn(),
    delete: (...args: unknown[]) => del(...args),
  },
}));

vi.mock("./keys", () => ({ is_internal_email: () => false }));
vi.mock("@/services/api/keys", () => ({ is_internal_email: () => false }));
vi.mock("@/services/recipient_classification", () => ({
  classify_recipients: vi.fn(async () => new Map()),
  is_internal_recipient: () => false,
}));
vi.mock("@/hooks/use_mail_stats", () => ({ invalidate_mail_stats: vi.fn() }));
vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: vi.fn(async () => null),
}));
vi.mock("@/services/send_private_bcc", () => ({
  encrypt_with_private_bcc: vi.fn(),
}));
vi.mock("@/utils/email_crypto", () => ({
  build_subject_bundle: (subject: string, body: string) =>
    JSON.stringify({ subject, body }),
}));
vi.mock("@/services/search/index_removals", () => ({
  note_purged_mail: vi.fn(),
}));
vi.mock("@/services/send_queue_recipients", () => ({
  plain_text_to_html: (text: string) => text,
}));

const { cancel_scheduled_email, get_scheduled_email } =
  await import("./scheduled");

const SOON = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const SCHEDULED_CONTEXT = "astermail-scheduled-v1";

function to_base64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

async function scheduled_key_for(identity_key: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(identity_key + SCHEDULED_CONTEXT),
    ),
  );
}

async function stored_under(raw_key: Uint8Array, subject: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    raw_key,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(
      JSON.stringify({
        to_recipients: ["friend@example.com"],
        cc_recipients: [],
        bcc_recipients: [],
        subject,
        body: "meet at noon",
        scheduled_at: SOON,
      }),
    ),
  );

  return {
    id: "s1",
    encrypted_envelope: to_base64(new Uint8Array(sealed)),
    envelope_nonce: to_base64(iv),
    scheduled_at: SOON,
    status: "pending",
    created_at: SOON,
    updated_at: SOON,
    ephemeral_key: null,
  };
}

beforeEach(async () => {
  get.mockReset();
  del.mockReset();
  del.mockResolvedValue({ data: { success: true } });
  await load_legacy_keks_into_memory([
    serialize_kek_for_vault(await scheduled_key_for("undefined")),
  ]);
});

afterEach(() => {
  clear_legacy_keks_from_memory();
});

describe("scheduled mail sealed under the absent-identity key", () => {
  it("opens mail sealed under the account's own scheduled key", async () => {
    get.mockResolvedValue({
      data: await stored_under(
        await scheduled_key_for("identity-current"),
        "from this account",
      ),
    });

    const response = await get_scheduled_email("s1", {
      identity_key: "identity-current",
    } as never);

    expect(response.error).toBeUndefined();
    expect(response.data?.content.subject).toBe("from this account");
  });

  it.each([
    ["a present identity", "identity-current"],
    ["an absent identity", undefined],
  ])(
    "shows the message as unreadable for %s",
    async (_label, identity_key) => {
      get.mockResolvedValue({
        data: await stored_under(
          await scheduled_key_for("undefined"),
          "placed by someone else",
        ),
      });

      const response = await get_scheduled_email("s1", {
        identity_key,
      } as never);

      expect(response.data).toBeNull();
      expect(response.unreadable).toBe(true);
      expect(response.error).toBe(en.errors.load_failed);
    },
  );

  it("still cancels a message it cannot open", async () => {
    get.mockResolvedValue({
      data: await stored_under(
        await scheduled_key_for("undefined"),
        "placed by someone else",
      ),
    });

    const opened = await get_scheduled_email("s1", {
      identity_key: "identity-current",
    } as never);
    const cancelled = await cancel_scheduled_email("s1");

    expect(opened.data).toBeNull();
    expect(del).toHaveBeenCalledWith("/mail/v1/scheduled/s1");
    expect(cancelled.error).toBeUndefined();
    expect(cancelled.data?.success).toBe(true);
  });
});

describe("scheduled mail sealed under a stored previous key", () => {
  it.each([["undefined"], [" undefined "], ["null"], ["[object Object]"]])(
    "never reads with the placeholder previous key %j",
    async (previous_key) => {
      clear_legacy_keks_from_memory();
      await load_previous_key_derived_keks_into_memory([previous_key]);
      get.mockResolvedValue({
        data: await stored_under(
          await scheduled_key_for(previous_key),
          "placed by someone else",
        ),
      });

      const response = await get_scheduled_email("s1", {
        identity_key: "identity-current",
      } as never);

      expect(response.data).toBeNull();
      expect(response.unreadable).toBe(true);
    },
  );

  it("still reads with a real previous key", async () => {
    clear_legacy_keks_from_memory();
    await load_previous_key_derived_keks_into_memory([
      "undefined",
      "identity-old",
    ]);
    get.mockResolvedValue({
      data: await stored_under(
        await scheduled_key_for("identity-old"),
        "written before a key change",
      ),
    });

    const response = await get_scheduled_email("s1", {
      identity_key: "identity-current",
    } as never);

    expect(response.error).toBeUndefined();
    expect(response.data?.content.subject).toBe("written before a key change");
  });
});
