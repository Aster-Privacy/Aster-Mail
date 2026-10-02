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
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const post = vi.fn();
const private_bcc = vi.fn();
let internal = true;
let write_key: CryptoKey;

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./keys", () => ({ is_internal_email: () => true }));
vi.mock("@/services/api/keys", () => ({ is_internal_email: () => true }));
vi.mock("@/services/recipient_classification", () => ({
  classify_recipients: vi.fn(async () => new Map()),
  is_internal_recipient: () => internal,
}));
vi.mock("@/hooks/use_mail_stats", () => ({ invalidate_mail_stats: vi.fn() }));
vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));
vi.mock("@/services/crypto/account_data_writer", () => ({
  account_data_write_key: vi.fn(async () => write_key),
}));
vi.mock("@/services/send_private_bcc", () => ({
  encrypt_with_private_bcc: (...args: unknown[]) => private_bcc(...args),
}));
vi.mock("@/utils/email_crypto", () => ({
  build_subject_bundle: (subject: string, body: string) =>
    JSON.stringify({ subject, body }),
}));

vi.mock("@/services/api/domains", () => ({
  add_domain_address: vi.fn(() => {
    throw new Error("Wildcard sending must not create an address");
  }),
}));

const { create_scheduled_email } = await import("./scheduled");

const SOON = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString();
const TOO_FAR = new Date(Date.now() + 29 * 24 * 60 * 60 * 1000).toISOString();
const OPTIONS = { sender_email: "me@astermail.org" };

function to_bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function open_with(
  key: CryptoKey,
  request: { encrypted_envelope: string; envelope_nonce: string },
) {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: to_bytes(request.envelope_nonce) },
    key,
    to_bytes(request.encrypted_envelope),
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}

async function open_envelope(request: {
  encrypted_envelope: string;
  envelope_nonce: string;
  ephemeral_key?: string;
}) {
  if (!request.ephemeral_key) return open_with(write_key, request);

  const key = await crypto.subtle.importKey(
    "raw",
    to_bytes(request.ephemeral_key),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );

  return open_with(key, request);
}

function content(overrides: Record<string, unknown> = {}) {
  return {
    to_recipients: ["a@astermail.org"],
    cc_recipients: [],
    bcc_recipients: [],
    subject: "s",
    body: "b",
    scheduled_at: SOON,
    ...overrides,
  };
}

beforeAll(async () => {
  write_key = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
});

beforeEach(() => {
  internal = true;
  post.mockReset();
  post.mockResolvedValue({
    data: { id: "s1", scheduled_at: SOON, success: true },
  });
  private_bcc.mockReset();
  private_bcc.mockResolvedValue({
    is_encrypted: true,
    encrypted_body: "sealed-shared",
    recipient_bodies: { "hidden@astermail.org": "sealed-hidden" },
  });
});

describe("scheduled envelope", () => {
  it("carries the sender and threading fields when present", async () => {
    await create_scheduled_email(
      {} as never,
      content({
        from: { name: "Me", email: "alias@example.com" },
        in_reply_to: "<orig@example.com>",
        thread_id: "thread-1",
      }),
      { ...OPTIONS, sender_alias_hash: "hash" },
    );

    const request = post.mock.calls.at(-1)![1];
    const envelope = await open_envelope(request);

    expect(request.sender_alias_hash).toBe("hash");
    expect(envelope.from).toEqual({ name: "Me", email: "alias@example.com" });
    expect(envelope.in_reply_to).toBe("<orig@example.com>");
    expect(envelope.thread_id).toBe("thread-1");
  });

  it("omits the optional fields when absent", async () => {
    await create_scheduled_email({} as never, content(), OPTIONS);

    const envelope = await open_envelope(post.mock.calls.at(-1)![1]);

    expect(envelope).not.toHaveProperty("from");
    expect(envelope).not.toHaveProperty("in_reply_to");
    expect(envelope).not.toHaveProperty("thread_id");
  });

  it("seals a wildcard From address without registering an individual address", async () => {
    await create_scheduled_email(
      {} as never,
      content({ from: { name: "Me", email: "shopping@my.example" } }),
      OPTIONS,
    );
    const request = post.mock.calls.at(-1)![1];

    expect(request.sender_alias_hash).toBeUndefined();
    const { add_domain_address } = await import("@/services/api/domains");

    expect(add_domain_address).not.toHaveBeenCalled();
    expect((await open_envelope(request)).from.email).toBe(
      "shopping@my.example",
    );
  });

  it("never gives the server a readable key for Aster recipients", async () => {
    await create_scheduled_email(
      {} as never,
      content({ bcc_recipients: ["hidden@astermail.org"] }),
      OPTIONS,
    );
    const request = post.mock.calls.at(-1)![1];

    expect(request).not.toHaveProperty("ephemeral_key");
    expect(request).not.toHaveProperty("base_nonce");
    expect(request.is_external).toBe(false);
    expect(request.delivery.internal_encrypted_body).toBe("sealed-shared");
    expect(request.delivery.recipient_bodies).toEqual({
      "hidden@astermail.org": "sealed-hidden",
    });
    expect(request.delivery.bcc).toEqual(["hidden@astermail.org"]);
    expect(JSON.stringify(request)).not.toContain('"body":"b"');
    expect(private_bcc).toHaveBeenCalledWith(
      expect.any(String),
      {
        to: ["a@astermail.org"],
        cc: [],
        bcc: ["hidden@astermail.org"],
      },
      "me@astermail.org",
      false,
    );
  });

  it("refuses to schedule when end-to-end sealing fails", async () => {
    private_bcc.mockResolvedValue({ is_encrypted: false });

    await expect(
      create_scheduled_email({} as never, content(), OPTIONS),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });

  it("uses a delivery key only for outside recipients", async () => {
    internal = false;

    await create_scheduled_email(
      {} as never,
      content({ to_recipients: ["a@example.com"] }),
      OPTIONS,
    );
    const request = post.mock.calls.at(-1)![1];

    expect(request.is_external).toBe(true);
    expect(typeof request.ephemeral_key).toBe("string");
    expect(request).not.toHaveProperty("delivery");
    expect(private_bcc).not.toHaveBeenCalled();
  });

  it("rejects times more than 28 days ahead", async () => {
    await expect(
      create_scheduled_email(
        {} as never,
        content({ scheduled_at: TOO_FAR }),
        OPTIONS,
      ),
    ).rejects.toThrow();
    expect(post).not.toHaveBeenCalled();
  });
});
