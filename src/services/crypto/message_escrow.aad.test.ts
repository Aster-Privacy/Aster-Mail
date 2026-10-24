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

const MASTER = new Uint8Array(32).map((_, i) => i + 1);
const posted: Array<Record<string, string>> = [];
const served = new Map<string, Record<string, string>>();
const cached = new Map<string, string>();
const cached_flags = new Map<string, boolean>();
const cached_bindings = new Map<string, unknown>();
const cached_unconfirmed = new Map<string, boolean>();
const foreign_keys = new Set<string>();

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(MASTER),
}));

vi.mock("./legacy_keks", () => ({
  decrypt_with_legacy_derived_keys: async () => null,
}));

vi.mock("./ratchet_plaintext_cache", () => ({
  set_cached_ratchet_plaintext: async (
    key: string,
    value: string,
    unauthenticated?: boolean,
    binding?: unknown,
    unconfirmed_sender?: boolean,
  ) => {
    cached.set(key, value);
    cached_flags.set(key, !!unauthenticated);
    cached_bindings.set(key, binding);
    cached_unconfirmed.set(key, !!unconfirmed_sender);
  },
  is_cached_plaintext_foreign: async (key: string) => foreign_keys.has(key),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    post: async (_url: string, body: Record<string, string>) => {
      posted.push(body);

      return { data: {} };
    },
    get: async (url: string) => {
      if (url.endsWith("/plaintexts")) {
        return { data: [...served.values()] };
      }
      const key = decodeURIComponent(url.split("/plaintext/")[1]);
      const entry = served.get(key);

      return entry ? { data: entry } : { code: "NOT_FOUND" };
    },
  },
}));

import {
  bound_escrow_key,
  clear_escrow_miss_cache,
  escrow_aad_v2,
  escrow_aad_v3,
  fetch_from_escrow,
  fetch_verified_from_escrow,
  sync_escrow_to_cache,
  upload_to_escrow,
} from "./message_escrow";
import { array_to_base64, base64_to_array } from "./base64";
import {
  clear_ratchet_verification_status,
  is_unconfirmed_sender_plaintext,
} from "./ratchet_verification_status";

async function escrow_key(): Promise<CryptoKey> {
  const base = await crypto.subtle.importKey("raw", MASTER, "HKDF", false, [
    "deriveKey",
  ]);

  return crypto.subtle.deriveKey(
    {
      name: "HKDF",
      salt: new TextEncoder().encode("Aster_Mail_Plaintext_Escrow"),
      info: new TextEncoder().encode("plaintext_escrow_key"),
      hash: "SHA-256",
    },
    base,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function seal(
  message_id: string,
  plaintext: string,
  additional_data?: Uint8Array,
): Promise<Record<string, string>> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = additional_data
    ? { name: "AES-GCM", iv: nonce, additionalData: additional_data }
    : { name: "AES-GCM", iv: nonce };
  const ciphertext = await crypto.subtle.encrypt(
    params,
    await escrow_key(),
    new TextEncoder().encode(plaintext),
  );

  return {
    message_id,
    encrypted_plaintext: array_to_base64(new Uint8Array(ciphertext)),
    plaintext_nonce: array_to_base64(nonce),
  };
}

const ALICE = { sender: "alice@astermail.org", conversation_id: "conv-a" };
const MALLORY = {
  sender: "mallory@astermail.org",
  conversation_id: "conv-m",
};
const KEY = "mail-1:BA==:3";

function serve_posted(): void {
  for (const entry of posted) served.set(entry.message_id, entry);
}

function bound_body(
  sender: string,
  conversation_id: string,
  plaintext: string,
): string {
  return `${JSON.stringify({ s: sender, c: conversation_id })}\n${plaintext}`;
}

describe("escrow entries are bound to their message", () => {
  beforeEach(() => {
    posted.length = 0;
    served.clear();
    cached.clear();
    cached_flags.clear();
    cached_bindings.clear();
    cached_unconfirmed.clear();
    foreign_keys.clear();
    clear_escrow_miss_cache();
    clear_ratchet_verification_status();
  });

  it("carries an unconfirmed sender key to the other devices", async () => {
    await upload_to_escrow(KEY, "first contact body", ALICE, true);
    serve_posted();

    expect(await fetch_from_escrow(KEY, ALICE)).toEqual({
      plaintext: "first contact body",
      verified: true,
      unconfirmed_sender: true,
    });
    expect(cached_unconfirmed.get(KEY)).toBe(true);
    expect(is_unconfirmed_sender_plaintext("first contact body")).toBe(true);
  });

  it("keeps the unconfirmed mark when upgrading from the escrow", async () => {
    await upload_to_escrow(KEY, "upgraded body", ALICE, true);
    serve_posted();

    expect(await fetch_verified_from_escrow(KEY, ALICE)).toBe("upgraded body");
    expect(is_unconfirmed_sender_plaintext("upgraded body")).toBe(true);
  });

  it("keeps the unconfirmed mark during a full sync", async () => {
    await upload_to_escrow("mail-u:BA==:1", "synced body", ALICE, true);
    serve_posted();

    await sync_escrow_to_cache();

    expect(cached_unconfirmed.get("mail-u:BA==:1")).toBe(true);
  });

  it("writes the same bound header as before for a confirmed sender key", async () => {
    await upload_to_escrow(KEY, "known body", ALICE, false);
    serve_posted();

    expect(await fetch_from_escrow(KEY, ALICE)).toEqual({
      plaintext: "known body",
      verified: true,
      unconfirmed_sender: false,
    });
    expect(is_unconfirmed_sender_plaintext("known body")).toBe(false);
  });

  it("keeps a bound entry without a flag confirmed", async () => {
    const sealed = await seal(
      KEY,
      `${JSON.stringify({ s: "alice@astermail.org", c: "conv-a" })}\nlegacy body`,
      escrow_aad_v3(KEY),
    );

    served.set(bound_escrow_key(KEY), {
      ...sealed,
      message_id: bound_escrow_key(KEY),
    });

    expect(await fetch_from_escrow(KEY, ALICE)).toEqual({
      plaintext: "legacy body",
      verified: true,
      unconfirmed_sender: false,
    });
    expect(is_unconfirmed_sender_plaintext("legacy body")).toBe(false);
  });

  it("refuses an entry already bound to another sender", async () => {
    await upload_to_escrow(KEY, "real body", ALICE);
    serve_posted();
    foreign_keys.add(KEY);

    expect(await fetch_from_escrow(KEY, MALLORY)).toBeNull();
    expect(await fetch_verified_from_escrow(KEY, MALLORY)).toBeNull();
    expect(cached.has(KEY)).toBe(false);
  });

  it("writes a sender-bound entry and a v2 entry for the mobile apps", async () => {
    await upload_to_escrow(KEY, "real body", ALICE);

    expect(posted.map((entry) => entry.message_id)).toEqual([
      bound_escrow_key(KEY),
      KEY,
    ]);
  });

  it("verifies a bound entry for the sender it was written for", async () => {
    await upload_to_escrow(KEY, "real body", ALICE);
    serve_posted();

    expect(await fetch_from_escrow(KEY, ALICE)).toEqual({
      plaintext: "real body",
      verified: true,
      unconfirmed_sender: false,
    });
    expect(cached_bindings.get(KEY)).toEqual(ALICE);
    expect(cached_flags.get(KEY)).toBe(false);
  });

  it("matches the sender regardless of case and whitespace", async () => {
    await upload_to_escrow(KEY, "real body", {
      sender: " Alice@AsterMail.org ",
      conversation_id: "conv-a",
    });
    serve_posted();

    expect(await fetch_verified_from_escrow(KEY, ALICE)).toBe("real body");
  });

  it("refuses a bound entry when another sender reuses the message key", async () => {
    await upload_to_escrow(KEY, "real body", ALICE);
    serve_posted();

    expect(await fetch_from_escrow(KEY, MALLORY)).toBeNull();
    expect(await fetch_verified_from_escrow(KEY, MALLORY)).toBeNull();
    expect(cached.has(KEY)).toBe(false);
  });

  it("refuses a bound entry from the same sender in another conversation", async () => {
    await upload_to_escrow(KEY, "real body", ALICE);
    serve_posted();

    expect(
      await fetch_verified_from_escrow(KEY, {
        sender: ALICE.sender,
        conversation_id: "conv-other",
      }),
    ).toBeNull();
  });

  it("treats a v2-only entry as unverified", async () => {
    served.set(KEY, await seal(KEY, "mobile body", escrow_aad_v2(KEY)));

    expect(await fetch_from_escrow(KEY, MALLORY)).toEqual({
      plaintext: "mobile body",
      verified: false,
      unconfirmed_sender: false,
    });
    expect(cached_flags.get(KEY)).toBe(true);
    expect(cached_bindings.get(KEY)).toEqual(MALLORY);
  });

  it("never verifies from a v2-only entry", async () => {
    served.set(KEY, await seal(KEY, "mobile body", escrow_aad_v2(KEY)));

    expect(await fetch_verified_from_escrow(KEY, ALICE)).toBeNull();
    expect(cached.has(KEY)).toBe(false);
  });

  it("does not verify a v2 entry relabeled as a bound entry", async () => {
    const v2 = await seal(KEY, "mobile body", escrow_aad_v2(KEY));

    served.set(bound_escrow_key(KEY), {
      ...v2,
      message_id: bound_escrow_key(KEY),
    });
    served.set(KEY, v2);

    expect(await fetch_from_escrow(KEY, ALICE)).toEqual({
      plaintext: "mobile body",
      verified: false,
      unconfirmed_sender: false,
    });
  });

  it("does not verify a bound entry moved to another message", async () => {
    await upload_to_escrow("mail-a:BA==:1", "body of a", ALICE);
    const moved = posted[0];

    served.set(bound_escrow_key(KEY), {
      ...moved,
      message_id: bound_escrow_key(KEY),
    });

    expect(await fetch_verified_from_escrow(KEY, ALICE)).toBeNull();
    expect(await fetch_from_escrow(KEY, ALICE)).toBeNull();
  });

  it("rejects a bound entry without a sender header", async () => {
    served.set(
      bound_escrow_key(KEY),
      await seal(bound_escrow_key(KEY), "no header", escrow_aad_v3(KEY)),
    );

    expect(await fetch_verified_from_escrow(KEY, ALICE)).toBeNull();
  });

  it("keeps newlines and JSON in the escrowed body", async () => {
    const body = 'line one\n{"s":"mallory@astermail.org"}\nline three';

    await upload_to_escrow(KEY, body, ALICE);
    serve_posted();

    expect(await fetch_verified_from_escrow(KEY, ALICE)).toBe(body);
  });

  it("uses the same authenticated data as Aster Bridge", () => {
    expect(new TextDecoder().decode(escrow_aad_v2("k"))).toBe(
      "aster.escrow.v2\u0000k",
    );
    expect(new TextDecoder().decode(escrow_aad_v3("k"))).toBe(
      "aster.escrow.v3\u0000k",
    );
  });

  it("uploads entries that open only with their own key bound", async () => {
    await upload_to_escrow(KEY, "secret body", ALICE);
    const key = await escrow_key();
    const open = (
      entry: Record<string, string>,
      additional_data?: Uint8Array,
    ) =>
      crypto.subtle.decrypt(
        additional_data
          ? {
              name: "AES-GCM",
              iv: base64_to_array(entry.plaintext_nonce),
              additionalData: additional_data,
            }
          : { name: "AES-GCM", iv: base64_to_array(entry.plaintext_nonce) },
        key,
        base64_to_array(entry.encrypted_plaintext),
      );
    const [v3, v2] = posted;

    expect(new TextDecoder().decode(await open(v2, escrow_aad_v2(KEY)))).toBe(
      "secret body",
    );
    expect(new TextDecoder().decode(await open(v3, escrow_aad_v3(KEY)))).toBe(
      bound_body("alice@astermail.org", "conv-a", "secret body"),
    );
    await expect(open(v2)).rejects.toThrow();
    await expect(open(v2, escrow_aad_v2("mail-2:BA==:3"))).rejects.toThrow();
    await expect(open(v3, escrow_aad_v2(KEY))).rejects.toThrow();
    await expect(open(v3, escrow_aad_v3("mail-2:BA==:3"))).rejects.toThrow();
  });

  it("still reads entries written before binding existed as unverified", async () => {
    served.set("mail-old:BA==:1", await seal("mail-old:BA==:1", "old body"));

    expect(await fetch_from_escrow("mail-old:BA==:1", ALICE)).toEqual({
      plaintext: "old body",
      verified: false,
      unconfirmed_sender: false,
    });
  });

  it("rejects a v2 entry served for a different message", async () => {
    const for_a = await seal(
      "mail-a:BA==:1",
      "body of a",
      escrow_aad_v2("mail-a:BA==:1"),
    );

    served.set("mail-b:BA==:1", { ...for_a, message_id: "mail-b:BA==:1" });

    expect(await fetch_from_escrow("mail-b:BA==:1", ALICE)).toBeNull();
    expect(cached.has("mail-b:BA==:1")).toBe(false);
  });

  it("opens the escrow vector shared with the Android and iOS apps", async () => {
    const dedupe_key =
      "73e9433f-67d5-4b28-9b2f-51bc53819c5d:BAbCdEf0123456789xyz=:7";

    served.set(dedupe_key, {
      message_id: dedupe_key,
      encrypted_plaintext:
        "y8cIU6Ssg4bk6eKQohqECUVi3WGoxw1aVg90oJANtQtVDCIb47SoqbnYgDjlvPXMubLJmBc6RYV2jDDKDg==",
      plaintext_nonce: "oKGio6Slpqeoqaqr",
    });

    expect(await fetch_from_escrow(dedupe_key, ALICE)).toEqual({
      plaintext: "Hello from the escrow vector. Ünïcödé ✓",
      verified: false,
      unconfirmed_sender: false,
    });
  });

  it("caches only bound entries during a full sync, bound to their sender", async () => {
    await upload_to_escrow("mail-a:BA==:1", "body of a", ALICE);
    serve_posted();
    served.set(
      "mail-v2:BA==:1",
      await seal("mail-v2:BA==:1", "v2 body", escrow_aad_v2("mail-v2:BA==:1")),
    );

    await sync_escrow_to_cache();

    expect(cached.get("mail-a:BA==:1")).toBe("body of a");
    expect(cached_bindings.get("mail-a:BA==:1")).toEqual(ALICE);
    expect(cached_flags.get("mail-a:BA==:1")).toBe(false);
    expect(cached.has("mail-v2:BA==:1")).toBe(false);
    expect(cached.has(bound_escrow_key("mail-a:BA==:1"))).toBe(false);
  });

  it("skips swapped bound entries during a full sync", async () => {
    await upload_to_escrow("mail-a:BA==:1", "body of a", ALICE);
    const [v3] = posted;

    served.set(v3.message_id, v3);
    served.set(bound_escrow_key("mail-b:BA==:1"), {
      ...v3,
      message_id: bound_escrow_key("mail-b:BA==:1"),
    });

    await sync_escrow_to_cache();

    expect(cached.get("mail-a:BA==:1")).toBe("body of a");
    expect(cached.has("mail-b:BA==:1")).toBe(false);
  });
});
