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

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: () => new Uint8Array(MASTER),
}));

vi.mock("./legacy_keks", () => ({
  decrypt_with_legacy_derived_keys: async () => null,
}));

vi.mock("./ratchet_plaintext_cache", () => ({
  set_cached_ratchet_plaintext: async (key: string, value: string) => {
    cached.set(key, value);
  },
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
  clear_escrow_miss_cache,
  escrow_aad_v2,
  fetch_from_escrow,
  sync_escrow_to_cache,
  upload_to_escrow,
} from "./message_escrow";
import { array_to_base64, base64_to_array } from "./base64";
import { is_unauthenticated_plaintext } from "./ratchet_verification_status";

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

describe("escrow entries are bound to their message", () => {
  beforeEach(() => {
    posted.length = 0;
    served.clear();
    cached.clear();
    clear_escrow_miss_cache();
  });

  it("uses the same authenticated data as Aster Bridge", () => {
    expect(new TextDecoder().decode(escrow_aad_v2("k"))).toBe(
      "aster.escrow.v2\u0000k",
    );
  });

  it("uploads entries that open only with their own key bound", async () => {
    await upload_to_escrow("mail-1:BA==:3", "secret body");
    const entry = posted[0];
    const key = await escrow_key();
    const open = (additional_data?: Uint8Array) =>
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

    const bound = await open(escrow_aad_v2("mail-1:BA==:3"));

    expect(new TextDecoder().decode(bound)).toBe("secret body");
    await expect(open()).rejects.toThrow();
    await expect(open(escrow_aad_v2("mail-2:BA==:3"))).rejects.toThrow();
  });

  it("reads back what it uploaded", async () => {
    await upload_to_escrow("mail-1:BA==:3", "round trip");
    served.set("mail-1:BA==:3", posted[0]);

    expect(await fetch_from_escrow("mail-1:BA==:3")).toBe("round trip");
  });

  it("still reads entries written before binding existed", async () => {
    served.set("mail-old:BA==:1", await seal("mail-old:BA==:1", "old body"));

    expect(await fetch_from_escrow("mail-old:BA==:1")).toBe("old body");
    expect(is_unauthenticated_plaintext("old body")).toBe(true);
  });

  it("refuses an unbound entry when a bound one is required", async () => {
    served.set("mail-old:BA==:2", await seal("mail-old:BA==:2", "old two"));

    expect(
      await fetch_from_escrow("mail-old:BA==:2", { require_bound: true }),
    ).toBeNull();
  });

  it("keeps a bound entry authenticated", async () => {
    await upload_to_escrow("mail-1:BA==:3", "bound body");
    served.set("mail-1:BA==:3", posted[0]);

    expect(await fetch_from_escrow("mail-1:BA==:3")).toBe("bound body");
    expect(is_unauthenticated_plaintext("bound body")).toBe(false);
  });

  it("rejects a bound entry served for a different message", async () => {
    const for_a = await seal(
      "mail-a:BA==:1",
      "body of a",
      escrow_aad_v2("mail-a:BA==:1"),
    );

    served.set("mail-b:BA==:1", { ...for_a, message_id: "mail-b:BA==:1" });

    expect(await fetch_from_escrow("mail-b:BA==:1")).toBeNull();
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

    expect(await fetch_from_escrow(dedupe_key)).toBe(
      "Hello from the escrow vector. Ünïcödé ✓",
    );
  });

  it("skips swapped entries during a full sync", async () => {
    const for_a = await seal(
      "mail-a:BA==:1",
      "body of a",
      escrow_aad_v2("mail-a:BA==:1"),
    );

    served.set("mail-a:BA==:1", for_a);
    served.set("mail-b:BA==:1", { ...for_a, message_id: "mail-b:BA==:1" });

    await sync_escrow_to_cache();

    expect(cached.get("mail-a:BA==:1")).toBe("body of a");
    expect(cached.has("mail-b:BA==:1")).toBe(false);
  });
});
