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
import { beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const get = vi.fn();
const del = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
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
vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: (
    key: CryptoKey,
    sealed: Uint8Array,
    iv: Uint8Array,
  ) => crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, sealed),
  decrypt_account_context_with_fallback: vi.fn(async () => {
    throw new Error("no key");
  }),
}));
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

const { cancel_scheduled_email, create_scheduled_email, get_scheduled_email } =
  await import("./scheduled");

const SOON = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const VAULT = { identity_key: "identity-current" };
const SNAPSHOT_WITH_S1 = {
  v: 1,
  at: "2026-11-01T00:00:00.000Z",
  ids: ["s1", "s7"],
};

function to_bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function to_base64(bytes: Uint8Array): string {
  return btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""));
}

function content(subject: string) {
  return {
    to_recipients: ["friend@example.com"],
    cc_recipients: [],
    bcc_recipients: [],
    subject,
    body: "see you at noon",
    scheduled_at: SOON,
  };
}

async function aes_key(raw: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [
    "encrypt",
    "decrypt",
  ]);
}

async function seal(raw_key: Uint8Array, value: unknown) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    await aes_key(raw_key),
    new TextEncoder().encode(JSON.stringify(value)),
  );

  return {
    id: "s1",
    encrypted_envelope: to_base64(new Uint8Array(sealed)),
    envelope_nonce: to_base64(iv),
    scheduled_at: SOON,
    status: "pending",
    created_at: SOON,
    updated_at: "2026-10-30T00:00:00.000Z",
    ephemeral_key: to_base64(raw_key),
  };
}

async function scheduled_by_this_client(vault: object, subject: string) {
  await create_scheduled_email(vault as never, content(subject), {
    sender_email: "me@astermail.org",
  });
  const request = post.mock.calls.at(-1)![1];
  const raw_key = to_bytes(request.ephemeral_key);
  const opened = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: to_bytes(request.envelope_nonce) },
    await aes_key(raw_key),
    to_bytes(request.encrypted_envelope),
  );

  return {
    raw_key,
    envelope: JSON.parse(new TextDecoder().decode(opened)),
    stored: {
      id: "s1",
      encrypted_envelope: request.encrypted_envelope,
      envelope_nonce: request.envelope_nonce,
      scheduled_at: SOON,
      status: "pending",
      created_at: SOON,
      updated_at: "2026-10-30T00:00:00.000Z",
      ephemeral_key: request.ephemeral_key,
    },
  };
}

async function forged_tag(identity_key: string, value: object) {
  const { scheduled_tag_message, SCHEDULED_TAG_CONTEXT } =
    await import("@/services/crypto/scheduled_content_tag");
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(identity_key + SCHEDULED_TAG_CONTEXT),
  );
  const key = await crypto.subtle.importKey(
    "raw",
    digest,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    scheduled_tag_message(value),
  );

  return to_base64(new Uint8Array(signature));
}

beforeEach(() => {
  del.mockReset();
  post.mockReset();
  post.mockResolvedValue({
    data: { id: "s1", scheduled_at: SOON, success: true },
  });
  get.mockReset();
});

describe("scheduled mail opened with the delivery key the server holds", () => {
  it("opens untagged mail listed when tagging started and marks it unverified", async () => {
    const delivery_key = crypto.getRandomValues(new Uint8Array(32));

    get.mockResolvedValue({
      data: await seal(delivery_key, content("scheduled on a phone")),
    });

    const response = await get_scheduled_email("s1", {
      ...VAULT,
      scheduled_untagged: SNAPSHOT_WITH_S1,
    } as never);

    expect(response.data?.content.subject).toBe("scheduled on a phone");
    expect(response.data?.content_verified).toBe(false);
  });

  it("refuses untagged mail that appeared after tagging started", async () => {
    const server_key = crypto.getRandomValues(new Uint8Array(32));

    get.mockResolvedValue({
      data: {
        ...(await seal(server_key, content("planted later"))),
        id: "s9",
      },
    });

    const response = await get_scheduled_email("s9", {
      ...VAULT,
      scheduled_untagged: SNAPSHOT_WITH_S1,
    } as never);

    expect(response.data).toBeNull();
  });

  it("refuses untagged mail when no snapshot can be recorded", async () => {
    const server_key = crypto.getRandomValues(new Uint8Array(32));

    get.mockResolvedValue({
      data: await seal(server_key, content("no snapshot")),
    });

    const response = await get_scheduled_email("s1", VAULT as never);

    expect(response.data).toBeNull();
  });

  it("still cancels untagged mail it refuses to open", async () => {
    del.mockResolvedValue({ data: { success: true } });

    const response = await cancel_scheduled_email("s9");

    expect(del).toHaveBeenCalledWith("/mail/v1/scheduled/s9");
    expect(response.error).toBeUndefined();
  });

  it("refuses a tag keyed by a placeholder identity", async () => {
    const server_key = crypto.getRandomValues(new Uint8Array(32));
    const placeholder_vault = {
      identity_key: "undefined",
      scheduled_untagged: SNAPSHOT_WITH_S1,
    };
    const forged = await forged_tag("undefined", content("placeholder"));

    get.mockResolvedValue({
      data: await seal(server_key, {
        ...content("placeholder"),
        content_tag: forged,
      }),
    });

    const response = await get_scheduled_email(
      "s1",
      placeholder_vault as never,
    );

    expect(response.data).toBeNull();
    await expect(
      create_scheduled_email(placeholder_vault as never, content("x"), {
        sender_email: "me@astermail.org",
      }),
    ).rejects.toThrow();
  });

  it("refuses content sealed under another key with a forged tag", async () => {
    const server_key = crypto.getRandomValues(new Uint8Array(32));

    get.mockResolvedValue({
      data: await seal(server_key, {
        ...content("planted by the server"),
        content_tag: "",
      }),
    });

    const response = await get_scheduled_email("s1", VAULT as never);

    expect(response.data).toBeNull();
  });

  it("refuses content the server rewrote while keeping the stored fields", async () => {
    const { raw_key, envelope } = await scheduled_by_this_client(
      VAULT,
      "lunch",
    );

    get.mockResolvedValue({
      data: await seal(raw_key, { ...envelope, subject: "rewritten" }),
    });

    const response = await get_scheduled_email("s1", VAULT as never);

    expect(response.data).toBeNull();
  });

  it("refuses a local item once the server attaches a delivery key", async () => {
    const server_key = crypto.getRandomValues(new Uint8Array(32));

    get.mockResolvedValue({
      data: await seal(server_key, {
        ...content("swapped"),
        content_tag: to_base64(crypto.getRandomValues(new Uint8Array(32))),
      }),
    });

    const response = await get_scheduled_email("s1", VAULT as never);

    expect(response.data).toBeNull();
  });

  it("opens mail this client scheduled for outside recipients", async () => {
    const { stored } = await scheduled_by_this_client(VAULT, "lunch");

    get.mockResolvedValue({ data: stored });

    const response = await get_scheduled_email("s1", VAULT as never);

    expect(response.error).toBeUndefined();
    expect(response.data?.content.subject).toBe("lunch");
    expect(response.data?.content).not.toHaveProperty("content_tag");
    expect(response.data?.content_verified).toBe(true);
  });

  it("opens mail scheduled before the identity key rotated", async () => {
    const { stored } = await scheduled_by_this_client(
      { identity_key: "identity-before" },
      "before rotation",
    );

    get.mockResolvedValue({ data: stored });

    const response = await get_scheduled_email("s1", {
      identity_key: "identity-after",
      previous_keys: ["identity-before"],
    } as never);

    expect(response.data?.content.subject).toBe("before rotation");
  });

  it("refuses mail tagged under an identity this vault never held", async () => {
    const { stored } = await scheduled_by_this_client(
      { identity_key: "someone-else" },
      "foreign",
    );

    get.mockResolvedValue({ data: stored });

    const response = await get_scheduled_email("s1", VAULT as never);

    expect(response.data).toBeNull();
  });
});
