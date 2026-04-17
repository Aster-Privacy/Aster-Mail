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
import type { MailItem } from "@/services/api/mail";

import { describe, it, expect, vi, beforeEach } from "vitest";

function encode_envelope(obj: Record<string, unknown>): string {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let binary = "";

  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }

  return btoa(binary);
}

function make_item(overrides: Partial<MailItem> & { id: string }): MailItem {
  return {
    item_type: "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "folder1",
    is_external: false,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

const mock_list_mail_items = vi.fn();
const mock_link_mail_to_thread = vi.fn();
const mock_base64_to_array = vi.fn();
const mock_decrypt_envelope_with_bytes = vi.fn();
const mock_get_passphrase_bytes = vi.fn();
const mock_get_vault_from_memory = vi.fn();
const mock_zero_uint8_array = vi.fn();

vi.mock("@/services/api/mail", () => ({
  list_mail_items: (...args: unknown[]) => mock_list_mail_items(...args),
  link_mail_to_thread: (...args: unknown[]) =>
    mock_link_mail_to_thread(...args),
}));

vi.mock("@/services/crypto/envelope", () => ({
  decrypt_envelope_with_bytes: (...args: unknown[]) =>
    mock_decrypt_envelope_with_bytes(...args),
  base64_to_array: (...args: unknown[]) => mock_base64_to_array(...args),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_passphrase_bytes: () => mock_get_passphrase_bytes(),
  get_vault_from_memory: () => mock_get_vault_from_memory(),
}));

vi.mock("@/services/crypto/secure_memory", () => ({
  zero_uint8_array: (...args: unknown[]) => mock_zero_uint8_array(...args),
}));

function setup_crypto_mocks() {
  mock_get_passphrase_bytes.mockReturnValue(new Uint8Array([1, 2, 3]));
  mock_get_vault_from_memory.mockReturnValue({ identity_key: "test-key" });

  mock_base64_to_array.mockImplementation((b64: string) => {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);

    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  });

  mock_link_mail_to_thread.mockResolvedValue({ data: { success: true } });

  vi.spyOn(crypto.subtle, "digest").mockResolvedValue(
    new Uint8Array(32).buffer,
  );
}

function setup_mail_items(items: MailItem[]) {
  mock_list_mail_items.mockResolvedValue({
    data: {
      items,
      has_more: false,
      next_cursor: null,
    },
  });
}

async function reimport_fresh() {
  vi.resetModules();
  const mod = await import("@/services/import/repair_threads");

  return mod.thread_imported_emails;
}

describe("thread_imported_emails", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-28T12:00:00Z"));
  });

  it("returns 0 when no passphrase bytes available", async () => {
    mock_get_passphrase_bytes.mockReturnValue(null);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(0);
    expect(mock_list_mail_items).not.toHaveBeenCalled();
  });

  it("returns 0 when no vault available", async () => {
    mock_get_passphrase_bytes.mockReturnValue(new Uint8Array([1]));
    mock_get_vault_from_memory.mockReturnValue(null);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(0);
    expect(mock_zero_uint8_array).toHaveBeenCalled();
  });

  it("returns 0 when no vault identity_key", async () => {
    mock_get_passphrase_bytes.mockReturnValue(new Uint8Array([1]));
    mock_get_vault_from_memory.mockReturnValue({ identity_key: null });
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(0);
  });

  it("returns 0 when all items are already threaded", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "1",
        thread_token: "tok1",
        encrypted_envelope: encode_envelope({ subject: "Hello" }),
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(0);
    expect(mock_link_mail_to_thread).not.toHaveBeenCalled();
  });

  it("returns 0 when only 1 unthreaded email with unique subject", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "1",
        encrypted_envelope: encode_envelope({ subject: "Unique subject" }),
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(0);
    expect(mock_link_mail_to_thread).not.toHaveBeenCalled();
  });

  it("groups 2 unthreaded emails with same subject into a thread", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "email-1",
        encrypted_envelope: encode_envelope({ subject: "Refund" }),
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "email-2",
        encrypted_envelope: encode_envelope({ subject: "Re: Refund" }),
        created_at: "2026-01-01T11:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(2);
    expect(mock_link_mail_to_thread).toHaveBeenCalledTimes(2);
    const first_call_token = mock_link_mail_to_thread.mock.calls[0][1];
    const second_call_token = mock_link_mail_to_thread.mock.calls[1][1];

    expect(first_call_token).toBe(second_call_token);
  });

  it("groups emails with various Re/Fwd prefixes", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "a",
        encrypted_envelope: encode_envelope({ subject: "Invoice" }),
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "b",
        encrypted_envelope: encode_envelope({ subject: "RE: Invoice" }),
        created_at: "2026-01-01T11:00:00Z",
      }),
      make_item({
        id: "c",
        encrypted_envelope: encode_envelope({ subject: "Fwd: Invoice" }),
        created_at: "2026-01-01T12:00:00Z",
      }),
      make_item({
        id: "d",
        encrypted_envelope: encode_envelope({ subject: "Re: Re: Invoice" }),
        created_at: "2026-01-01T13:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(4);
    expect(mock_link_mail_to_thread).toHaveBeenCalledTimes(4);
    const tokens = mock_link_mail_to_thread.mock.calls.map(
      (c: unknown[]) => c[1],
    );

    expect(new Set(tokens).size).toBe(1);
  });

  it("does not group emails with different subjects", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "a",
        encrypted_envelope: encode_envelope({ subject: "Topic A" }),
      }),
      make_item({
        id: "b",
        encrypted_envelope: encode_envelope({ subject: "Topic B" }),
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(0);
  });

  it("joins unthreaded email to existing thread with same subject", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "old-1",
        thread_token: "existing-token-abc",
        encrypted_envelope: encode_envelope({ subject: "Refund" }),
        created_at: "2026-01-01T09:00:00Z",
      }),
      make_item({
        id: "new-1",
        encrypted_envelope: encode_envelope({ subject: "Re: Refund" }),
        created_at: "2026-01-01T12:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(1);
    expect(mock_link_mail_to_thread).toHaveBeenCalledTimes(1);
    expect(mock_link_mail_to_thread).toHaveBeenCalledWith(
      "new-1",
      "existing-token-abc",
    );
  });

  it("handles multiple separate thread groups", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "a1",
        encrypted_envelope: encode_envelope({ subject: "Sales" }),
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "a2",
        encrypted_envelope: encode_envelope({ subject: "Re: Sales" }),
        created_at: "2026-01-01T11:00:00Z",
      }),
      make_item({
        id: "b1",
        encrypted_envelope: encode_envelope({ subject: "Support" }),
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "b2",
        encrypted_envelope: encode_envelope({ subject: "Re: Support" }),
        created_at: "2026-01-01T11:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(4);

    const a_calls = mock_link_mail_to_thread.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).startsWith("a"),
    );
    const b_calls = mock_link_mail_to_thread.mock.calls.filter((c: unknown[]) =>
      (c[0] as string).startsWith("b"),
    );

    expect(a_calls[0][1]).toBe(a_calls[1][1]);
    expect(b_calls[0][1]).toBe(b_calls[1][1]);
  });

  it("handles link_mail_to_thread API errors gracefully", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "a",
        encrypted_envelope: encode_envelope({ subject: "Test" }),
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "b",
        encrypted_envelope: encode_envelope({ subject: "Re: Test" }),
        created_at: "2026-01-01T11:00:00Z",
      }),
    ]);
    mock_link_mail_to_thread
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ error: "Internal server error" });
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(1);
  });

  it("respects cooldown between runs", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "a",
        encrypted_envelope: encode_envelope({ subject: "Test" }),
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "b",
        encrypted_envelope: encode_envelope({ subject: "Re: Test" }),
        created_at: "2026-01-01T11:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();

    const first = await thread_imported_emails();

    expect(first).toBe(2);

    const second = await thread_imported_emails();

    expect(second).toBe(0);

    vi.advanceTimersByTime(11_000);

    mock_link_mail_to_thread.mockResolvedValue({ data: { success: true } });
    setup_mail_items([
      make_item({
        id: "c",
        encrypted_envelope: encode_envelope({ subject: "New" }),
        created_at: "2026-01-02T10:00:00Z",
      }),
      make_item({
        id: "d",
        encrypted_envelope: encode_envelope({ subject: "Re: New" }),
        created_at: "2026-01-02T11:00:00Z",
      }),
    ]);
    const third = await thread_imported_emails();

    expect(third).toBe(2);
  });

  it("prevents concurrent execution", async () => {
    setup_crypto_mocks();

    let resolve_list: ((value: unknown) => void) | null = null;

    mock_list_mail_items.mockImplementation(
      () =>
        new Promise((r) => {
          resolve_list = r;
        }),
    );

    const thread_imported_emails = await reimport_fresh();

    const first_promise = thread_imported_emails();
    const second = await thread_imported_emails();

    expect(second).toBe(0);

    resolve_list!({
      data: { items: [], has_more: false, next_cursor: null },
    });
    await first_promise;
  });

  it("handles empty envelope gracefully", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "a",
        encrypted_envelope: "",
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "b",
        encrypted_envelope: "",
        created_at: "2026-01-01T11:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(0);
  });

  it("handles list_mail_items returning error", async () => {
    setup_crypto_mocks();
    mock_list_mail_items.mockResolvedValue({
      error: "Network error",
      data: null,
    });
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(0);
  });

  it("always zeroes passphrase bytes even on error", async () => {
    setup_crypto_mocks();
    mock_list_mail_items.mockRejectedValue(new Error("boom"));
    const thread_imported_emails = await reimport_fresh();

    await expect(thread_imported_emails()).rejects.toThrow("boom");
    expect(mock_zero_uint8_array).toHaveBeenCalled();
  });

  it("handles international Re: prefixes (AW, SV, VS, Ref, Rif)", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "a",
        encrypted_envelope: encode_envelope({ subject: "Rechnung" }),
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "b",
        encrypted_envelope: encode_envelope({ subject: "AW: Rechnung" }),
        created_at: "2026-01-01T11:00:00Z",
      }),
      make_item({
        id: "c",
        encrypted_envelope: encode_envelope({ subject: "SV: Rechnung" }),
        created_at: "2026-01-01T12:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(3);
    const tokens = mock_link_mail_to_thread.mock.calls.map(
      (c: unknown[]) => c[1],
    );

    expect(new Set(tokens).size).toBe(1);
  });

  it("case-insensitive subject matching", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "a",
        encrypted_envelope: encode_envelope({ subject: "URGENT: Meeting" }),
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "b",
        encrypted_envelope: encode_envelope({ subject: "Re: urgent: meeting" }),
        created_at: "2026-01-01T11:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(2);
  });

  it("paginates through multiple pages of items", async () => {
    setup_crypto_mocks();
    mock_list_mail_items
      .mockResolvedValueOnce({
        data: {
          items: [
            make_item({
              id: "a",
              encrypted_envelope: encode_envelope({ subject: "Paginated" }),
              created_at: "2026-01-01T10:00:00Z",
            }),
          ],
          has_more: true,
          next_cursor: "cursor1",
        },
      })
      .mockResolvedValueOnce({
        data: {
          items: [
            make_item({
              id: "b",
              encrypted_envelope: encode_envelope({ subject: "Re: Paginated" }),
              created_at: "2026-01-01T11:00:00Z",
            }),
          ],
          has_more: false,
          next_cursor: null,
        },
      });
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(2);
    expect(mock_list_mail_items).toHaveBeenCalledTimes(2);
  });

  it("new email joins existing thread rather than creating new token", async () => {
    setup_crypto_mocks();
    const existing_token = "pre-existing-thread-token";

    setup_mail_items([
      make_item({
        id: "threaded-1",
        thread_token: existing_token,
        encrypted_envelope: encode_envelope({ subject: "Project Update" }),
        created_at: "2026-01-01T08:00:00Z",
      }),
      make_item({
        id: "threaded-2",
        thread_token: existing_token,
        encrypted_envelope: encode_envelope({ subject: "Re: Project Update" }),
        created_at: "2026-01-01T09:00:00Z",
      }),
      make_item({
        id: "new-unthreaded",
        encrypted_envelope: encode_envelope({
          subject: "Re: Re: Project Update",
        }),
        created_at: "2026-01-01T14:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(1);
    expect(mock_link_mail_to_thread).toHaveBeenCalledWith(
      "new-unthreaded",
      existing_token,
    );
  });

  it("only links unthreaded emails, not already-threaded ones", async () => {
    setup_crypto_mocks();
    setup_mail_items([
      make_item({
        id: "threaded",
        thread_token: "tok",
        encrypted_envelope: encode_envelope({ subject: "Hello" }),
        created_at: "2026-01-01T10:00:00Z",
      }),
      make_item({
        id: "unthreaded",
        encrypted_envelope: encode_envelope({ subject: "Re: Hello" }),
        created_at: "2026-01-01T11:00:00Z",
      }),
    ]);
    const thread_imported_emails = await reimport_fresh();
    const result = await thread_imported_emails();

    expect(result).toBe(1);
    expect(mock_link_mail_to_thread).toHaveBeenCalledTimes(1);
    expect(mock_link_mail_to_thread).toHaveBeenCalledWith("unthreaded", "tok");
  });
});
