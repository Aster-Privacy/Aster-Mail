// @vitest-environment node
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
import { describe, it, expect, beforeAll, vi } from "vitest";
import * as openpgp from "openpgp";

vi.mock("@/services/api/client", () => ({ api_client: {} }));

import { decrypt_message_verifiable_with_any_key } from "@/services/crypto/key_manager_pgp";
import { clear_unlocked_key_cache } from "@/services/crypto/key_manager_pgp_unlocked_cache";
import { is_transient_decrypt_error } from "@/services/crypto/decrypt_readiness";
import { is_crypto_module_load_error } from "@/services/crypto/openpgp_loader";

const PASSPHRASE = "parity passphrase";

type worker_message = { kind?: string; handle?: number };

type worker_scope = {
  onmessage: ((event: { data: unknown; origin: string }) => unknown) | null;
  location: { origin: string };
  postMessage: (response: unknown) => void;
};

const bridge = {
  posted: [] as worker_message[],
  reply: null as ((event: MessageEvent) => void) | null,
  drop_handles: false,
};

const scope: worker_scope = {
  onmessage: null,
  location: { origin: "" },
  postMessage: (response) => {
    const data = structuredClone(response);

    setTimeout(() => bridge.reply?.({ data } as MessageEvent), 0);
  },
};

class bridged_worker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;

  postMessage(message: worker_message): void {
    bridge.posted.push(message);
    bridge.reply = (event) => this.onmessage?.(event);

    const data =
      bridge.drop_handles && message.kind === "verify"
        ? { ...structuredClone(message), handle: -1 }
        : structuredClone(message);

    setTimeout(() => void scope.onmessage?.({ data, origin: "" }), 0);
  }

  terminate(): void {
    this.onmessage = null;
  }
}

interface fixture_keys {
  recipient_private: string;
  sender_private: string;
  sender_public: string;
  stranger_private: string;
  stranger_public: string;
  recipient_public: string;
}

async function make_key(
  type: "curve25519" | "rsa",
): Promise<{ private_armored: string; public_armored: string }> {
  const generated =
    type === "rsa"
      ? await openpgp.generateKey({
          type: "rsa",
          rsaBits: 2048,
          userIDs: [{ email: "rsa@example.test" }],
          passphrase: PASSPHRASE,
        })
      : await openpgp.generateKey({
          type: "ecc",
          curve: "curve25519Legacy",
          userIDs: [{ email: "ecc@example.test" }],
          passphrase: PASSPHRASE,
        });

  return {
    private_armored: generated.privateKey,
    public_armored: generated.publicKey,
  };
}

async function make_fixture(type: "curve25519" | "rsa"): Promise<fixture_keys> {
  const [recipient, sender, stranger] = await Promise.all([
    make_key(type),
    make_key("curve25519"),
    make_key("curve25519"),
  ]);

  return {
    recipient_private: recipient.private_armored,
    recipient_public: recipient.public_armored,
    sender_private: sender.private_armored,
    sender_public: sender.public_armored,
    stranger_private: stranger.private_armored,
    stranger_public: stranger.public_armored,
  };
}

async function encrypt(
  keys: fixture_keys,
  text: string,
  signed: boolean,
): Promise<string> {
  const encryption_key = await openpgp.readKey({
    armoredKey: keys.recipient_public,
  });
  const signing_key = signed
    ? await openpgp.decryptKey({
        privateKey: await openpgp.readPrivateKey({
          armoredKey: keys.sender_private,
        }),
        passphrase: PASSPHRASE,
      })
    : undefined;

  return (await openpgp.encrypt({
    message: await openpgp.createMessage({ text }),
    encryptionKeys: encryption_key,
    ...(signing_key ? { signingKeys: signing_key } : {}),
  })) as string;
}

async function load_pool() {
  vi.resetModules();

  return import("./pgp_decrypt_pool");
}

async function settle<T>(
  run: () => Promise<T>,
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    return { ok: false, error };
  }
}

function classify(error: unknown) {
  const { name, message } = error as { name?: unknown; message?: unknown };

  return {
    name,
    message,
    transient: is_transient_decrypt_error(error),
    module_load: is_crypto_module_load_error(error),
  };
}

const fixtures: Partial<Record<"curve25519" | "rsa", fixture_keys>> = {};

function fixture_for(type: "curve25519" | "rsa"): fixture_keys {
  const keys = fixtures[type];

  if (!keys) throw new Error("fixture missing");

  return keys;
}

describe.each(["curve25519", "rsa"] as const)(
  "worker and main thread give the same %s results",
  (type) => {
    beforeAll(async () => {
      vi.stubGlobal("self", scope);
      vi.stubGlobal("Worker", bridged_worker);
      vi.stubGlobal("navigator", { hardwareConcurrency: 2 });
      await import("./pgp_decrypt_worker");
      fixtures[type] = await make_fixture(type);
    }, 120_000);

    it("matches plaintext and every verification outcome", async () => {
      const keys = fixture_for(type);

      for (const signed of [true, false]) {
        const text = `parity ${type} ${signed ? "signed" : "unsigned"} é\u{1f512}`;
        const ciphertext = await encrypt(keys, text, signed);
        const main = await decrypt_message_verifiable_with_any_key(
          ciphertext,
          [keys.stranger_private, keys.recipient_private],
          PASSPHRASE,
          [],
        );
        const { decrypt_pgp_verifiable_parallel } = await load_pool();
        const posted_before = bridge.posted.length;
        const pooled = await decrypt_pgp_verifiable_parallel(
          ciphertext,
          [keys.stranger_private, keys.recipient_private],
          PASSPHRASE,
          false,
        );

        expect(bridge.posted[posted_before]?.kind).toBe("verifiable");
        expect(pooled.plaintext).toBe(main.plaintext);
        expect(pooled.plaintext).toBe(text);
        expect(pooled.verification).toBe(main.verification);
        expect(pooled.has_signature).toBe(main.has_signature);

        for (const verification_keys of [
          [keys.sender_public],
          [keys.stranger_public],
          [keys.stranger_public, keys.sender_public],
          [],
          ["not a key"],
        ]) {
          const verify_before = bridge.posted.length;
          const main_result = await main.verify(verification_keys);
          const pooled_result = await pooled.verify(verification_keys);

          expect(bridge.posted[verify_before]?.kind).toBe("verify");
          expect(pooled_result).toEqual(main_result);
        }

        pooled.release();
      }
    }, 120_000);

    it("matches the error classification when no key fits", async () => {
      const keys = fixture_for(type);
      const ciphertext = await encrypt(keys, "not for you", true);
      const main = await settle(() =>
        decrypt_message_verifiable_with_any_key(
          ciphertext,
          [keys.stranger_private],
          PASSPHRASE,
          [],
        ),
      );
      const { decrypt_pgp_verifiable_parallel } = await load_pool();
      const pooled = await settle(() =>
        decrypt_pgp_verifiable_parallel(
          ciphertext,
          [keys.stranger_private],
          PASSPHRASE,
          false,
        ),
      );

      expect(main.ok).toBe(false);
      expect(pooled.ok).toBe(false);
      if (main.ok || pooled.ok) return;
      expect(classify(pooled.error)).toEqual(classify(main.error));
    }, 120_000);

    it("matches the error classification for a wrong passphrase", async () => {
      const keys = fixture_for(type);
      const ciphertext = await encrypt(keys, "locked", false);
      const main = await settle(() =>
        decrypt_message_verifiable_with_any_key(
          ciphertext,
          [keys.recipient_private],
          "wrong passphrase",
          [],
        ),
      );
      clear_unlocked_key_cache();
      const { decrypt_pgp_verifiable_parallel } = await load_pool();
      const pooled = await settle(() =>
        decrypt_pgp_verifiable_parallel(
          ciphertext,
          [keys.recipient_private],
          "wrong passphrase",
          false,
        ),
      );

      expect(main.ok).toBe(false);
      expect(pooled.ok).toBe(false);
      if (main.ok || pooled.ok) return;
      expect(classify(pooled.error)).toEqual(classify(main.error));
    }, 120_000);

    it("verifies on the main thread when the worker lost the message", async () => {
      const keys = fixture_for(type);
      const ciphertext = await encrypt(keys, "handle gone", true);
      const main = await decrypt_message_verifiable_with_any_key(
        ciphertext,
        [keys.recipient_private],
        PASSPHRASE,
        [],
      );
      const { decrypt_pgp_verifiable_parallel } = await load_pool();
      const pooled = await decrypt_pgp_verifiable_parallel(
        ciphertext,
        [keys.recipient_private],
        PASSPHRASE,
        false,
      );

      bridge.drop_handles = true;

      try {
        const main_result = await main.verify([keys.sender_public]);

        expect(await pooled.verify([keys.sender_public])).toEqual(main_result);
        expect(main_result.verification).toBe("verified");
      } finally {
        bridge.drop_handles = false;
        pooled.release();
      }
    }, 120_000);
  },
);
