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
import { describe, expect, it, vi } from "vitest";

const post = vi.fn();

vi.mock("./client", () => ({
  api_client: {
    post: (...args: unknown[]) => post(...args),
    get: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("./keys", () => ({ is_internal_email: () => true }));
vi.mock("@/hooks/use_mail_stats", () => ({ invalidate_mail_stats: vi.fn() }));
vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));

const { create_scheduled_email } = await import("./scheduled");

function to_bytes(base64: string): Uint8Array {
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

async function open_envelope(request: {
  encrypted_envelope: string;
  envelope_nonce: string;
  ephemeral_key: string;
}) {
  const key = await crypto.subtle.importKey(
    "raw",
    to_bytes(request.ephemeral_key),
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: to_bytes(request.envelope_nonce) },
    key,
    to_bytes(request.encrypted_envelope),
  );

  return JSON.parse(new TextDecoder().decode(plaintext));
}

describe("scheduled envelope", () => {
  it("carries the sender and threading fields when present", async () => {
    post.mockResolvedValue({
      data: { id: "s1", scheduled_at: "x", success: true },
    });

    await create_scheduled_email(
      {} as never,
      {
        to_recipients: ["a@example.com"],
        cc_recipients: [],
        bcc_recipients: [],
        subject: "s",
        body: "b",
        scheduled_at: "2030-01-01T00:00:00.000Z",
        from: { name: "Me", email: "alias@example.com" },
        in_reply_to: "<orig@example.com>",
        thread_id: "thread-1",
      },
      "hash",
    );

    const envelope = await open_envelope(post.mock.calls.at(-1)![1]);

    expect(envelope.from).toEqual({ name: "Me", email: "alias@example.com" });
    expect(envelope.in_reply_to).toBe("<orig@example.com>");
    expect(envelope.thread_id).toBe("thread-1");
  });

  it("omits the optional fields when absent", async () => {
    post.mockResolvedValue({
      data: { id: "s2", scheduled_at: "x", success: true },
    });

    await create_scheduled_email({} as never, {
      to_recipients: ["a@example.com"],
      cc_recipients: [],
      bcc_recipients: [],
      subject: "s",
      body: "b",
      scheduled_at: "2030-01-01T00:00:00.000Z",
    });

    const envelope = await open_envelope(post.mock.calls.at(-1)![1]);

    expect(envelope).not.toHaveProperty("from");
    expect(envelope).not.toHaveProperty("in_reply_to");
    expect(envelope).not.toHaveProperty("thread_id");
  });
});
