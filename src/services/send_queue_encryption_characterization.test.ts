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

const h = vi.hoisted(() => ({
  vault: {
    identity_key: "identity-secret",
    ratchet_identity_key: "",
    ratchet_identity_public: "",
  } as Record<string, unknown> | null,
  passphrase_bytes: null as Uint8Array | null,
  has_passphrase: true,
  ghost_addresses: new Set<string>(),
  unregistered_ghost_addresses: new Set<string>(),
  account: {
    user: { id: "user-1", username: "owner", email: "owner@astermail.org" },
  } as Record<string, unknown> | null,
  public_key_response: {
    data: { public_key: "recipient-public-key" },
  } as Record<string, unknown>,
  simple_send_response: {
    data: { success: true, mail_item_id: "mail-1" },
  } as Record<string, unknown>,
  external_send_response: {
    data: { success: true, mail_item_id: "mail-2" },
  } as Record<string, unknown>,
  listed_items: [] as Record<string, unknown>[],
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  get_vault_from_memory: () => h.vault,
  get_passphrase_from_memory: () => "passphrase",
  get_passphrase_bytes: () =>
    h.passphrase_bytes === null ? null : h.passphrase_bytes.slice(),
  has_passphrase_in_memory: () => h.has_passphrase,
}));

vi.mock("@/services/account_manager", () => ({
  get_current_account: vi.fn(async () => h.account),
}));

vi.mock("@/stores/ghost_alias_store", () => ({
  is_ghost_email: (email: string) => h.ghost_addresses.has(email),
  looks_like_unregistered_ghost_email: (email: string) =>
    h.unregistered_ghost_addresses.has(email),
}));

vi.mock("@/services/api/keys", async (import_original) => {
  const actual = await import_original<Record<string, unknown>>();

  return {
    ...actual,
    get_recipient_public_key: vi.fn(async () => h.public_key_response),
  };
});

vi.mock("@/services/api/send", () => ({
  send_simple_email: vi.fn(async () => h.simple_send_response),
  send_external_email: vi.fn(async () => h.external_send_response),
}));

vi.mock("@/services/api/mail", () => ({
  mark_thread_read: vi.fn(async () => ({ data: {} })),
  list_encrypted_mail_items: vi.fn(async () => ({
    data: { items: h.listed_items, next_cursor: null },
  })),
  update_mail_item: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/services/api/attachments", () => ({
  create_attachment: vi.fn(async () => ({ data: {} })),
}));

vi.mock("@/services/crypto/mail_metadata", () => ({
  encrypt_mail_metadata: vi.fn(async () => ({
    encrypted_metadata: "meta-ct",
    metadata_nonce: "meta-nonce",
  })),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  encrypt_attachments_for_send: vi.fn(async () => []),
  prepare_external_attachments: vi.fn(() => []),
}));

vi.mock("@/services/crypto/secure_message_crypto", () => ({
  encrypt_secure_message: vi.fn(async () => ({
    kdf_salt: "s",
    auth_proof: "p",
    kem_ciphertext: "k",
    encrypted_kem_seed: "e",
    kem_seed_nonce: "n",
    encrypted_subject: "es",
    encrypted_body: "eb",
    encrypted_attachments_bundle: null,
  })),
}));

vi.mock("@/services/crypto/ensure_ratchet_keys", () => ({
  ensure_ratchet_keys: vi.fn(async () => {}),
}));

vi.mock("@/utils/email_crypto", () => ({
  discover_external_recipient_keys: vi.fn(async () => ({
    recipients_with_keys: [],
  })),
  build_subject_bundle: (subject: string, body: string) => `${subject} ${body}`,
  derive_own_public_key: vi.fn(async () => null),
}));

import {
  encrypt_with_ephemeral_key,
  resolve_username_for_key_lookup,
  resolve_own_username_for_key_lookup,
  check_send_readiness_internal,
  fetch_internal_public_keys,
  create_sent_envelope,
  execute_send,
  execute_external_send,
  reencrypt_all_sent_mail,
} from "./send_queue_encryption";

import type { QueuedEmailInternal, MailEnvelope } from "./send_queue_types";

import { send_simple_email, send_external_email } from "./api/send";
import { list_encrypted_mail_items, update_mail_item } from "./api/mail";
import { get_recipient_public_key } from "./api/keys";
import { create_attachment } from "./api/attachments";
import { encrypt_attachments_for_send } from "./crypto/attachment_crypto";
import {
  encrypt_envelope_with_bytes,
  decrypt_envelope_with_bytes,
  array_to_base64,
  base64_to_array,
} from "./crypto/envelope";

function reset_state(): void {
  h.vault = {
    identity_key: "identity-secret",
    ratchet_identity_key: "",
    ratchet_identity_public: "",
  };
  h.passphrase_bytes = new Uint8Array(32).fill(7);
  h.has_passphrase = true;
  h.ghost_addresses = new Set();
  h.unregistered_ghost_addresses = new Set();
  h.account = {
    user: { id: "user-1", username: "owner", email: "owner@astermail.org" },
  };
  h.public_key_response = { data: { public_key: "recipient-public-key" } };
  h.simple_send_response = { data: { success: true, mail_item_id: "mail-1" } };
  h.external_send_response = {
    data: { success: true, mail_item_id: "mail-2" },
  };
  h.listed_items = [];
  vi.clearAllMocks();
}

function queued(
  overrides: Partial<QueuedEmailInternal> = {},
): QueuedEmailInternal {
  return {
    id: "queued-1",
    to: ["outsider@example.com"],
    subject: "Hello",
    body: "Plain body",
    scheduled_time: Date.now(),
    timeout_id: 0,
    callbacks: { on_complete: () => {}, on_cancel: () => {} },
    ...overrides,
  } as QueuedEmailInternal;
}

async function open_ephemeral(
  raw_key: string,
  base_nonce: string,
  ciphertext: string,
  field_id: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    base64_to_array(raw_key),
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const nonce = base64_to_array(base_nonce);
  const derived = new Uint8Array(12);

  derived.set(nonce.subarray(0, 11));
  derived[11] = nonce[11] ^ field_id;

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: derived },
    key,
    base64_to_array(ciphertext),
  );

  return new TextDecoder().decode(plaintext);
}

beforeEach(() => {
  reset_state();
});

describe("encrypt_with_ephemeral_key", () => {
  const recipients = { to: ["a@example.com"], cc: ["b@example.com"] };

  it("round-trips every field under its derived nonce", async () => {
    const result = await encrypt_with_ephemeral_key(
      recipients,
      "The subject",
      "The body",
    );

    expect(
      await open_ephemeral(
        result.ephemeral_key,
        result.nonce,
        result.encrypted_recipients,
        0x01,
      ),
    ).toBe(JSON.stringify(recipients));
    expect(
      await open_ephemeral(
        result.ephemeral_key,
        result.nonce,
        result.encrypted_subject,
        0x02,
      ),
    ).toBe("The subject");
    expect(
      await open_ephemeral(
        result.ephemeral_key,
        result.nonce,
        result.encrypted_body,
        0x03,
      ),
    ).toBe("The body");
  });

  it("exports a 256-bit key and a 12-byte base nonce", async () => {
    const result = await encrypt_with_ephemeral_key(recipients, "s", "b");

    expect(base64_to_array(result.ephemeral_key)).toHaveLength(32);
    expect(base64_to_array(result.nonce)).toHaveLength(12);
  });

  it("uses a fresh key and nonce on every call", async () => {
    const first = await encrypt_with_ephemeral_key(recipients, "s", "b");
    const second = await encrypt_with_ephemeral_key(recipients, "s", "b");

    expect(first.ephemeral_key).not.toBe(second.ephemeral_key);
    expect(first.nonce).not.toBe(second.nonce);
    expect(first.encrypted_body).not.toBe(second.encrypted_body);
  });

  it("never reuses one nonce across the three fields", async () => {
    const result = await encrypt_with_ephemeral_key(
      recipients,
      "same text",
      "same text",
    );

    expect(result.encrypted_subject).not.toBe(result.encrypted_body);
  });

  it("appends a 128-bit authentication tag to each field", async () => {
    const result = await encrypt_with_ephemeral_key(recipients, "", "");

    expect(base64_to_array(result.encrypted_subject)).toHaveLength(16);
    expect(base64_to_array(result.encrypted_body)).toHaveLength(16);
  });

  it("fails to open a field under the wrong field nonce", async () => {
    const result = await encrypt_with_ephemeral_key(recipients, "s", "b");

    await expect(
      open_ephemeral(
        result.ephemeral_key,
        result.nonce,
        result.encrypted_body,
        0x02,
      ),
    ).rejects.toThrow();
  });
});

describe("resolve_username_for_key_lookup", () => {
  it("returns the local part for an ordinary address", async () => {
    expect(await resolve_username_for_key_lookup("friend@astermail.org")).toBe(
      "friend",
    );
  });

  it("returns the account username for a ghost address", async () => {
    h.ghost_addresses.add("ghost@realiased.me");

    expect(await resolve_username_for_key_lookup("ghost@realiased.me")).toBe(
      "owner",
    );
  });

  it("falls back to the local part when the account has no username", async () => {
    h.ghost_addresses.add("ghost@realiased.me");
    h.account = { user: { id: "user-1" } };

    expect(await resolve_username_for_key_lookup("ghost@realiased.me")).toBe(
      "ghost",
    );
  });

  it("returns null for a malformed address", async () => {
    expect(await resolve_username_for_key_lookup("not-an-address")).toBeNull();
  });

  it("ignores the unregistered-ghost signal", async () => {
    h.unregistered_ghost_addresses.add("maybe@realiased.me");

    expect(await resolve_username_for_key_lookup("maybe@realiased.me")).toBe(
      "maybe",
    );
  });
});

describe("resolve_own_username_for_key_lookup", () => {
  it("returns the local part for an ordinary address", async () => {
    expect(
      await resolve_own_username_for_key_lookup("owner@astermail.org"),
    ).toBe("owner");
  });

  it("returns the account username for a known ghost address", async () => {
    h.ghost_addresses.add("ghost@realiased.me");

    expect(
      await resolve_own_username_for_key_lookup("ghost@realiased.me"),
    ).toBe("owner");
  });

  it("also covers an address that only looks like an unregistered ghost", async () => {
    h.unregistered_ghost_addresses.add("maybe@realiased.me");

    expect(
      await resolve_own_username_for_key_lookup("maybe@realiased.me"),
    ).toBe("owner");
  });

  it("returns null for a malformed address", async () => {
    expect(await resolve_own_username_for_key_lookup("nope")).toBeNull();
  });
});

describe("check_send_readiness_internal", () => {
  it("is ready when a vault and a passphrase are in memory", () => {
    expect(check_send_readiness_internal()).toEqual({ ready: true });
  });

  it("is not ready without a vault", () => {
    h.vault = null;

    const result = check_send_readiness_internal();

    expect(result.ready).toBe(false);
    expect(result.ready === false && result.error.type).toBe(
      "vault_unavailable",
    );
  });

  it("is not ready when the vault has no identity key", () => {
    h.vault = { identity_key: "" };

    expect(check_send_readiness_internal().ready).toBe(false);
  });

  it("is not ready without a passphrase in memory", () => {
    h.has_passphrase = false;

    const result = check_send_readiness_internal();

    expect(result.ready).toBe(false);
    expect(result.ready === false && result.error.type).toBe(
      "vault_unavailable",
    );
  });
});

describe("fetch_internal_public_keys", () => {
  it("collects one key per internal recipient and skips external ones", async () => {
    const keys = await fetch_internal_public_keys([
      "a@astermail.org",
      "b@aster.cx",
      "outsider@example.com",
    ]);

    expect(keys).toEqual(["recipient-public-key", "recipient-public-key"]);
    expect(vi.mocked(get_recipient_public_key)).toHaveBeenCalledTimes(2);
  });

  it("returns an empty list when there are no internal recipients", async () => {
    expect(await fetch_internal_public_keys(["outsider@example.com"])).toEqual(
      [],
    );
    expect(vi.mocked(get_recipient_public_key)).not.toHaveBeenCalled();
  });

  it("ignores an address with no domain", async () => {
    expect(await fetch_internal_public_keys(["broken"])).toEqual([]);
    expect(vi.mocked(get_recipient_public_key)).not.toHaveBeenCalled();
  });

  it("throws when the key lookup fails", async () => {
    h.public_key_response = { data: null, error: "not found" };

    await expect(
      fetch_internal_public_keys(["a@astermail.org"]),
    ).rejects.toThrow();
  });
});

describe("create_sent_envelope", () => {
  it("seals an envelope the sender's passphrase can reopen", async () => {
    const data = await create_sent_envelope(
      queued({ subject: "Subject line", body: "Plain body" }),
      "owner@astermail.org",
    );

    const opened = await decrypt_envelope_with_bytes<MailEnvelope>(
      data.encrypted_envelope,
      new Uint8Array(32).fill(7),
    );

    expect(opened).not.toBeNull();
    expect(opened!.version).toBe(1);
    expect(opened!.subject).toBe("Subject line");
    expect(opened!.body_text).toBe("Plain body");
    expect(opened!.body_html).toBe("Plain body");
    expect(opened!.from).toEqual({ name: "", email: "owner@astermail.org" });
    expect(opened!.to).toEqual([{ name: "", email: "outsider@example.com" }]);
  });

  it("prefers the envelope subject over the wire subject", async () => {
    const data = await create_sent_envelope(
      queued({ subject: "", envelope_subject: "Real subject" }),
      "owner@astermail.org",
    );

    const opened = await decrypt_envelope_with_bytes<MailEnvelope>(
      data.encrypted_envelope,
      new Uint8Array(32).fill(7),
    );

    expect(opened!.subject).toBe("Real subject");
  });

  it("extracts a plain-text rendition from an html body", async () => {
    const data = await create_sent_envelope(
      queued({ body: "<p>One</p><p>Two</p><script>bad()</script>" }),
      "owner@astermail.org",
    );

    const opened = await decrypt_envelope_with_bytes<MailEnvelope>(
      data.encrypted_envelope,
      new Uint8Array(32).fill(7),
    );

    expect(opened!.body_html).toContain("<p>One</p>");
    expect(opened!.body_text).toContain("One");
    expect(opened!.body_text).toContain("Two");
    expect(opened!.body_text).not.toContain("bad()");
  });

  it("derives the sent folder token from the identity key", async () => {
    const data = await create_sent_envelope(queued(), "owner@astermail.org");

    const expected = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode("identity-secretfolder:sent"),
    );

    expect(data.folder_token).toBe(array_to_base64(new Uint8Array(expected)));
  });

  it("carries the encrypted metadata through", async () => {
    const data = await create_sent_envelope(queued(), "owner@astermail.org");

    expect(data.encrypted_metadata).toBe("meta-ct");
    expect(data.metadata_nonce).toBe("meta-nonce");
  });

  it("uses a fresh envelope nonce on every call", async () => {
    const first = await create_sent_envelope(queued(), "owner@astermail.org");
    const second = await create_sent_envelope(queued(), "owner@astermail.org");

    expect(first.encrypted_envelope).not.toBe(second.encrypted_envelope);
  });

  it("refuses without a vault", async () => {
    h.vault = null;

    await expect(
      create_sent_envelope(queued(), "owner@astermail.org"),
    ).rejects.toMatchObject({ type: "vault_unavailable" });
  });

  it("refuses without passphrase bytes", async () => {
    h.passphrase_bytes = null;

    await expect(
      create_sent_envelope(queued(), "owner@astermail.org"),
    ).rejects.toMatchObject({ type: "vault_unavailable" });
  });
});

describe("execute_send", () => {
  it("sends the bundled body and the sealed envelope", async () => {
    await execute_send(queued({ subject: "Hi", body: "Body text" }));

    expect(vi.mocked(send_simple_email)).toHaveBeenCalledTimes(1);

    const request = vi.mocked(send_simple_email).mock.calls[0][0];

    expect(request.to).toEqual(["outsider@example.com"]);
    expect(request.is_e2e_encrypted).toBe(false);
    expect(request.subject).toBe("Hi");
    expect(request.body).toBe("Body text");
    expect(request.encrypted_envelope).toBeTruthy();
    expect(request.envelope_nonce).toBeTruthy();
    expect(request.folder_token).toBeTruthy();
    expect(request.thread_token).toBeTruthy();
  });

  it("keeps an explicit thread id", async () => {
    await execute_send(queued({ thread_id: "thread-abc" }));

    expect(vi.mocked(send_simple_email).mock.calls[0][0].thread_token).toBe(
      "thread-abc",
    );
  });

  it("mints a 256-bit thread token when none is supplied", async () => {
    await execute_send(queued());

    const token = vi.mocked(send_simple_email).mock.calls[0][0].thread_token;

    expect(base64_to_array(token as string)).toHaveLength(32);
  });

  it("blocks an internal recipient without post-quantum keys", async () => {
    await expect(
      execute_send(queued({ to: ["friend@astermail.org"] })),
    ).rejects.toMatchObject({
      type: "post_quantum_unavailable",
      recipients: ["friend@astermail.org"],
    });
    expect(vi.mocked(send_simple_email)).not.toHaveBeenCalled();
  });

  it("refuses before sending when the vault is locked", async () => {
    h.has_passphrase = false;

    await expect(execute_send(queued())).rejects.toMatchObject({
      type: "vault_unavailable",
    });
    expect(vi.mocked(send_simple_email)).not.toHaveBeenCalled();
  });

  it("refuses when no account is signed in", async () => {
    h.account = null;

    await expect(execute_send(queued())).rejects.toThrow();
    expect(vi.mocked(send_simple_email)).not.toHaveBeenCalled();
  });

  it("maps a rate-limit response to a rate_limited error", async () => {
    h.simple_send_response = {
      data: { success: false },
      code: "RATE_LIMIT_EXCEEDED",
      resets_at: new Date(Date.now() + 3600_000).toISOString(),
    };

    await expect(execute_send(queued())).rejects.toMatchObject({
      type: "rate_limited",
    });
  });

  it("maps any other failure to a send_failed error", async () => {
    h.simple_send_response = { data: { success: false }, error: "nope" };

    await expect(execute_send(queued())).rejects.toMatchObject({
      type: "send_failed",
    });
  });
});

describe("execute_external_send", () => {
  it("sends ephemeral-encrypted fields plus the sender envelope", async () => {
    await execute_external_send({
      to: ["outsider@example.com"],
      subject: "External subject",
      body: "External body",
    });

    expect(vi.mocked(send_external_email)).toHaveBeenCalledTimes(1);

    const request = vi.mocked(send_external_email).mock.calls[0][0];

    expect(
      await open_ephemeral(
        request.ephemeral_key,
        request.nonce,
        request.encrypted_subject,
        0x02,
      ),
    ).toBe("External subject");
    expect(
      await open_ephemeral(
        request.ephemeral_key,
        request.nonce,
        request.encrypted_body,
        0x03,
      ),
    ).toBe("External body");
    expect(request.encrypted_envelope).toBeTruthy();
    expect(request.acknowledge_server_readable).toBe(true);
    expect(request.thread_token).toBeTruthy();
  });

  it("replaces the ephemeral fields with a placeholder for a secure message", async () => {
    await execute_external_send({
      to: ["outsider@example.com"],
      subject: "External subject",
      body: "External body",
      secure_external: true,
      expiry_password: "secret",
    });

    const request = vi.mocked(send_external_email).mock.calls[0][0];

    expect(
      await open_ephemeral(
        request.ephemeral_key,
        request.nonce,
        request.encrypted_subject,
        0x02,
      ),
    ).toBe("[secure message]");
    expect(request.secure_message).toBeTruthy();
    expect(request.expiry_password).toBeUndefined();
    expect(request.attachments).toBeUndefined();
    expect(request.force_pgp).toBeUndefined();
  });

  it("still reports success when the sent copy attachment upload fails", async () => {
    vi.mocked(encrypt_attachments_for_send).mockResolvedValueOnce([
      {
        encrypted_data: "ct",
        data_nonce: "n",
        sender_encrypted_meta: "m",
        sender_meta_nonce: "mn",
      },
    ] as never);
    vi.mocked(create_attachment).mockRejectedValueOnce(
      new Error("attachment store unavailable"),
    );

    await expect(
      execute_external_send({
        to: ["outsider@example.com"],
        subject: "s",
        body: "b",
        attachments: [
          {
            id: "a1",
            name: "report.pdf",
            size: "1 KB",
            size_bytes: 1024,
            mime_type: "application/pdf",
            data: new ArrayBuffer(1024),
          },
        ],
      } as never),
    ).resolves.toBeUndefined();
  });

  it("retries a sent copy attachment upload that fails once", async () => {
    vi.mocked(encrypt_attachments_for_send).mockResolvedValueOnce([
      {
        encrypted_data: "ct",
        data_nonce: "n",
        sender_encrypted_meta: "m",
        sender_meta_nonce: "mn",
      },
    ] as never);
    vi.mocked(create_attachment).mockRejectedValueOnce(
      new Error("bad gateway"),
    );

    await execute_external_send({
      to: ["outsider@example.com"],
      subject: "s",
      body: "b",
      attachments: [
        {
          id: "a1",
          name: "report.pdf",
          size: "1 KB",
          size_bytes: 1024,
          mime_type: "application/pdf",
          data: new ArrayBuffer(1024),
        },
      ],
    } as never);

    expect(vi.mocked(create_attachment).mock.calls.length).toBeGreaterThan(1);
  });

  it("honours the acknowledge flag", async () => {
    await execute_external_send(
      { to: ["outsider@example.com"], subject: "s", body: "b" },
      false,
    );

    expect(
      vi.mocked(send_external_email).mock.calls[0][0]
        .acknowledge_server_readable,
    ).toBe(false);
  });

  it("refuses when encryption is required but no keys are discovered", async () => {
    await expect(
      execute_external_send({
        to: ["outsider@example.com"],
        subject: "s",
        body: "b",
        encryption_options: {
          auto_discover_keys: true,
          encrypt_emails: true,
          require_encryption: true,
        },
      }),
    ).rejects.toMatchObject({ type: "encryption_failed" });
    expect(vi.mocked(send_external_email)).not.toHaveBeenCalled();
  });

  it("still sends when encryption is optional and no keys are discovered", async () => {
    await execute_external_send({
      to: ["outsider@example.com"],
      subject: "s",
      body: "b",
      encryption_options: {
        auto_discover_keys: true,
        encrypt_emails: true,
        require_encryption: false,
      },
    });

    expect(vi.mocked(send_external_email)).toHaveBeenCalledTimes(1);
  });

  it("refuses before sending when the vault is locked", async () => {
    h.has_passphrase = false;

    await expect(
      execute_external_send({
        to: ["outsider@example.com"],
        subject: "s",
        body: "b",
      }),
    ).rejects.toMatchObject({ type: "vault_unavailable" });
    expect(vi.mocked(send_external_email)).not.toHaveBeenCalled();
  });

  it("maps a rate-limit response to a rate_limited error", async () => {
    h.external_send_response = {
      data: { success: false },
      code: "RATE_LIMIT_EXCEEDED",
      resets_at: new Date(Date.now() + 60_000).toISOString(),
    };

    await expect(
      execute_external_send({
        to: ["outsider@example.com"],
        subject: "s",
        body: "b",
      }),
    ).rejects.toMatchObject({ type: "rate_limited" });
  });
});

describe("reencrypt_all_sent_mail", () => {
  const marker_nonce = array_to_base64(new Uint8Array([1]));

  it("rewrites a marked envelope so the new passphrase opens it", async () => {
    const old_bytes = new TextEncoder().encode("old-pass");
    const sealed = await encrypt_envelope_with_bytes(
      { subject: "kept" },
      old_bytes,
    );

    h.listed_items = [
      {
        id: "item-1",
        encrypted_envelope: sealed.encrypted,
        envelope_nonce: marker_nonce,
      },
    ];

    await reencrypt_all_sent_mail("old-pass", "new-pass");

    expect(vi.mocked(update_mail_item)).toHaveBeenCalledTimes(1);

    const [item_id, patch] = vi.mocked(update_mail_item).mock.calls[0] as [
      string,
      { encrypted_envelope: string; envelope_nonce: string },
    ];

    expect(item_id).toBe("item-1");
    expect(patch.encrypted_envelope).not.toBe(sealed.encrypted);
    expect(
      await decrypt_envelope_with_bytes<{ subject: string }>(
        patch.encrypted_envelope,
        new TextEncoder().encode("new-pass"),
      ),
    ).toEqual({ subject: "kept" });
  });

  it("leaves the old passphrase unable to open the rewritten envelope", async () => {
    const old_bytes = new TextEncoder().encode("old-pass");
    const sealed = await encrypt_envelope_with_bytes(
      { subject: "kept" },
      old_bytes,
    );

    h.listed_items = [
      {
        id: "item-1",
        encrypted_envelope: sealed.encrypted,
        envelope_nonce: marker_nonce,
      },
    ];

    await reencrypt_all_sent_mail("old-pass", "new-pass");

    const [, patch] = vi.mocked(update_mail_item).mock.calls[0] as [
      string,
      { encrypted_envelope: string },
    ];

    expect(
      await decrypt_envelope_with_bytes(
        patch.encrypted_envelope,
        new TextEncoder().encode("old-pass"),
      ),
    ).toBeNull();
  });

  it("skips items whose envelope nonce is not the inline marker", async () => {
    const sealed = await encrypt_envelope_with_bytes(
      { subject: "kept" },
      new TextEncoder().encode("old-pass"),
    );

    h.listed_items = [
      {
        id: "item-1",
        encrypted_envelope: sealed.encrypted,
        envelope_nonce: array_to_base64(new Uint8Array(12)),
      },
    ];

    await reencrypt_all_sent_mail("old-pass", "new-pass");

    expect(vi.mocked(update_mail_item)).not.toHaveBeenCalled();
  });

  it("skips items with no stored envelope", async () => {
    h.listed_items = [
      { id: "item-1", encrypted_envelope: null, envelope_nonce: null },
    ];

    await reencrypt_all_sent_mail("old-pass", "new-pass");

    expect(vi.mocked(update_mail_item)).not.toHaveBeenCalled();
  });

  it("isolates an undecryptable item and keeps going", async () => {
    const good = await encrypt_envelope_with_bytes(
      { subject: "kept" },
      new TextEncoder().encode("old-pass"),
    );
    const bad = await encrypt_envelope_with_bytes(
      { subject: "lost" },
      new TextEncoder().encode("other-pass"),
    );

    h.listed_items = [
      {
        id: "bad",
        encrypted_envelope: bad.encrypted,
        envelope_nonce: marker_nonce,
      },
      {
        id: "good",
        encrypted_envelope: good.encrypted,
        envelope_nonce: marker_nonce,
      },
    ];

    await reencrypt_all_sent_mail("old-pass", "new-pass");

    expect(vi.mocked(update_mail_item)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(update_mail_item).mock.calls[0][0]).toBe("good");
  });

  it("stops when the listing comes back empty", async () => {
    await reencrypt_all_sent_mail("old-pass", "new-pass");

    expect(vi.mocked(list_encrypted_mail_items)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(update_mail_item)).not.toHaveBeenCalled();
  });
});
