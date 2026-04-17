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
import {
  encrypted_get,
  encrypted_set,
  encrypted_delete,
} from "./encrypted_storage";
import {
  get_derived_encryption_key,
  has_vault_in_memory,
} from "./memory_key_store";

const _KE = ["EC", "DH"].join("");
const _KC = ["P", "256"].join("-");

const HASH_ALG = ["SHA", "256"].join("-");
const KDF_INFO_ROOT = new TextEncoder().encode("Aster Mail_Root_KDF");
const KDF_INFO_CHAIN = new TextEncoder().encode("Aster Mail_Chain_KDF");
const MAX_SKIP = 1000;

interface RatchetKeyPair {
  public_key: Uint8Array;
  secret_key: Uint8Array;
}

interface SkippedMessageKey {
  dh_public: string;
  message_number: number;
  message_key: string;
  timestamp: number;
}

interface RatchetState {
  dh_keypair: {
    public_key: string;
    secret_key: string;
  };
  dh_remote_public: string | null;
  root_key: string;
  chain_key_send: string | null;
  chain_key_recv: string | null;
  send_message_number: number;
  recv_message_number: number;
  previous_chain_length: number;
  skipped_message_keys: SkippedMessageKey[];
  version: number;
  created_at: number;
  updated_at: number;
}

interface SerializedState {
  state: RatchetState;
  conversation_id: string;
}

interface EncryptedMessage {
  header: {
    dh_public: string;
    previous_chain_length: number;
    message_number: number;
  };
  ciphertext: string;
  nonce: string;
}

function array_to_base64(array: Uint8Array): string {
  return btoa(String.fromCharCode(...array));
}

function base64_to_array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }

  return bytes;
}

async function generate_dh_keypair(): Promise<RatchetKeyPair> {
  const keypair = await crypto.subtle.generateKey(
    { name: _KE, namedCurve: _KC },
    true,
    ["deriveBits"],
  );

  const public_key_raw = await crypto.subtle.exportKey(
    "raw",
    keypair.publicKey,
  );
  const private_key_jwk = await crypto.subtle.exportKey(
    "jwk",
    keypair.privateKey,
  );
  const private_key_d = base64_to_array(
    private_key_jwk.d!.replace(/-/g, "+").replace(/_/g, "/"),
  );

  return {
    public_key: new Uint8Array(public_key_raw),
    secret_key: private_key_d,
  };
}

async function import_public_key(public_key: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    public_key,
    { name: _KE, namedCurve: _KC },
    true,
    [],
  );
}

async function import_secret_key(secret_key: Uint8Array): Promise<CryptoKey> {
  const x_y = await generate_public_from_private(secret_key);
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: _KC,
    d: array_to_base64(secret_key)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, ""),
    x: array_to_base64(x_y.x)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, ""),
    y: array_to_base64(x_y.y)
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=/g, ""),
  };

  return crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: _KE, namedCurve: _KC },
    true,
    ["deriveBits"],
  );
}

async function generate_public_from_private(
  secret_key: Uint8Array,
): Promise<{ x: Uint8Array; y: Uint8Array }> {
  const temp_keypair = await crypto.subtle.generateKey(
    { name: _KE, namedCurve: _KC },
    true,
    ["deriveBits"],
  );

  const jwk = await crypto.subtle.exportKey("jwk", temp_keypair.privateKey);

  jwk.d = array_to_base64(secret_key)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  const imported = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: _KE, namedCurve: _KC },
    true,
    ["deriveBits"],
  );

  const public_jwk = await crypto.subtle.exportKey("jwk", imported);

  return {
    x: base64_to_array(public_jwk.x!.replace(/-/g, "+").replace(/_/g, "/")),
    y: base64_to_array(public_jwk.y!.replace(/-/g, "+").replace(/_/g, "/")),
  };
}

async function dh(
  secret_key: CryptoKey,
  public_key: CryptoKey,
): Promise<Uint8Array> {
  const shared_bits = await crypto.subtle.deriveBits(
    { name: _KE, public: public_key },
    secret_key,
    256,
  );

  return new Uint8Array(shared_bits);
}

async function hkdf(
  input_key_material: Uint8Array,
  salt: Uint8Array,
  info: Uint8Array,
  output_length: number,
): Promise<Uint8Array> {
  const key_material = await crypto.subtle.importKey(
    "raw",
    input_key_material,
    "HKDF",
    false,
    ["deriveBits"],
  );

  const derived = await crypto.subtle.deriveBits(
    { name: "HKDF", salt, info, hash: HASH_ALG },
    key_material,
    output_length * 8,
  );

  return new Uint8Array(derived);
}

async function kdf_root_key(
  root_key: Uint8Array,
  dh_output: Uint8Array,
): Promise<{ new_root_key: Uint8Array; chain_key: Uint8Array }> {
  const output = await hkdf(dh_output, root_key, KDF_INFO_ROOT, 64);

  return {
    new_root_key: output.slice(0, 32),
    chain_key: output.slice(32, 64),
  };
}

async function kdf_chain_key(
  chain_key: Uint8Array,
): Promise<{ new_chain_key: Uint8Array; message_key: Uint8Array }> {
  const output = await hkdf(chain_key, new Uint8Array(32), KDF_INFO_CHAIN, 64);

  return {
    new_chain_key: output.slice(0, 32),
    message_key: output.slice(32, 64),
  };
}

async function encrypt_with_key(
  plaintext: Uint8Array,
  message_key: Uint8Array,
): Promise<{ ciphertext: Uint8Array; nonce: Uint8Array }> {
  const key = await crypto.subtle.importKey(
    "raw",
    message_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt"],
  );

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    plaintext,
  );

  return {
    ciphertext: new Uint8Array(ciphertext),
    nonce,
  };
}

async function decrypt_with_key(
  ciphertext: Uint8Array,
  nonce: Uint8Array,
  message_key: Uint8Array,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    message_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["decrypt"],
  );

  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    ciphertext,
  );

  return new Uint8Array(plaintext);
}

export class DoubleRatchet {
  private state: RatchetState;
  private conversation_id: string;

  private constructor(state: RatchetState, conversation_id: string) {
    this.state = state;
    this.conversation_id = conversation_id;
  }

  static async init_sender(
    shared_secret: Uint8Array,
    remote_public_key: Uint8Array,
    conversation_id: string,
  ): Promise<DoubleRatchet> {
    const dh_keypair = await generate_dh_keypair();
    const secret_key = await import_secret_key(dh_keypair.secret_key);
    const public_key = await import_public_key(remote_public_key);
    const dh_output = await dh(secret_key, public_key);

    const { new_root_key, chain_key } = await kdf_root_key(
      shared_secret,
      dh_output,
    );

    const state: RatchetState = {
      dh_keypair: {
        public_key: array_to_base64(dh_keypair.public_key),
        secret_key: array_to_base64(dh_keypair.secret_key),
      },
      dh_remote_public: array_to_base64(remote_public_key),
      root_key: array_to_base64(new_root_key),
      chain_key_send: array_to_base64(chain_key),
      chain_key_recv: null,
      send_message_number: 0,
      recv_message_number: 0,
      previous_chain_length: 0,
      skipped_message_keys: [],
      version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    return new DoubleRatchet(state, conversation_id);
  }

  static async init_receiver(
    shared_secret: Uint8Array,
    own_keypair: RatchetKeyPair,
    conversation_id: string,
  ): Promise<DoubleRatchet> {
    const state: RatchetState = {
      dh_keypair: {
        public_key: array_to_base64(own_keypair.public_key),
        secret_key: array_to_base64(own_keypair.secret_key),
      },
      dh_remote_public: null,
      root_key: array_to_base64(shared_secret),
      chain_key_send: null,
      chain_key_recv: null,
      send_message_number: 0,
      recv_message_number: 0,
      previous_chain_length: 0,
      skipped_message_keys: [],
      version: 1,
      created_at: Date.now(),
      updated_at: Date.now(),
    };

    return new DoubleRatchet(state, conversation_id);
  }

  async encrypt(plaintext: string): Promise<EncryptedMessage> {
    const encoder = new TextEncoder();
    const plaintext_bytes = encoder.encode(plaintext);

    if (!this.state.chain_key_send) {
      throw new Error("Cannot encrypt: sending chain not initialized");
    }

    const chain_key = base64_to_array(this.state.chain_key_send);
    const { new_chain_key, message_key } = await kdf_chain_key(chain_key);

    const { ciphertext, nonce } = await encrypt_with_key(
      plaintext_bytes,
      message_key,
    );

    const header = {
      dh_public: this.state.dh_keypair.public_key,
      previous_chain_length: this.state.previous_chain_length,
      message_number: this.state.send_message_number,
    };

    this.state.chain_key_send = array_to_base64(new_chain_key);
    this.state.send_message_number++;
    this.state.updated_at = Date.now();

    secure_zero_memory(chain_key);
    secure_zero_memory(message_key);

    return {
      header,
      ciphertext: array_to_base64(ciphertext),
      nonce: array_to_base64(nonce),
    };
  }

  async decrypt(message: EncryptedMessage): Promise<string> {
    const plaintext = await this.try_skipped_message_keys(message);

    if (plaintext !== null) {
      return plaintext;
    }

    const header_dh_public = base64_to_array(message.header.dh_public);

    if (
      this.state.dh_remote_public === null ||
      message.header.dh_public !== this.state.dh_remote_public
    ) {
      await this.skip_message_keys(message.header.previous_chain_length);
      await this.dh_ratchet(header_dh_public);
    }

    await this.skip_message_keys(message.header.message_number);

    if (!this.state.chain_key_recv) {
      throw new Error("Cannot decrypt: receiving chain not initialized");
    }

    const chain_key = base64_to_array(this.state.chain_key_recv);
    const { new_chain_key, message_key } = await kdf_chain_key(chain_key);

    const ciphertext = base64_to_array(message.ciphertext);
    const nonce = base64_to_array(message.nonce);

    const plaintext_bytes = await decrypt_with_key(
      ciphertext,
      nonce,
      message_key,
    );

    this.state.chain_key_recv = array_to_base64(new_chain_key);
    this.state.recv_message_number++;
    this.state.updated_at = Date.now();

    secure_zero_memory(chain_key);
    secure_zero_memory(message_key);

    const decoder = new TextDecoder();

    return decoder.decode(plaintext_bytes);
  }

  private async try_skipped_message_keys(
    message: EncryptedMessage,
  ): Promise<string | null> {
    const index = this.state.skipped_message_keys.findIndex(
      (k) =>
        k.dh_public === message.header.dh_public &&
        k.message_number === message.header.message_number,
    );

    if (index === -1) {
      return null;
    }

    const skipped = this.state.skipped_message_keys[index];

    this.state.skipped_message_keys.splice(index, 1);

    const message_key = base64_to_array(skipped.message_key);
    const ciphertext = base64_to_array(message.ciphertext);
    const nonce = base64_to_array(message.nonce);

    const plaintext_bytes = await decrypt_with_key(
      ciphertext,
      nonce,
      message_key,
    );

    secure_zero_memory(message_key);

    const decoder = new TextDecoder();

    return decoder.decode(plaintext_bytes);
  }

  private async skip_message_keys(until: number): Promise<void> {
    if (!this.state.chain_key_recv) {
      return;
    }

    if (until - this.state.recv_message_number > MAX_SKIP) {
      throw new Error("Too many skipped messages");
    }

    let chain_key = base64_to_array(this.state.chain_key_recv);

    while (this.state.recv_message_number < until) {
      const { new_chain_key, message_key } = await kdf_chain_key(chain_key);

      this.state.skipped_message_keys.push({
        dh_public: this.state.dh_remote_public!,
        message_number: this.state.recv_message_number,
        message_key: array_to_base64(message_key),
        timestamp: Date.now(),
      });

      secure_zero_memory(chain_key);
      chain_key = new_chain_key;
      this.state.recv_message_number++;
    }

    this.state.chain_key_recv = array_to_base64(chain_key);
    this.cleanup_old_skipped_keys();
  }

  private async dh_ratchet(remote_public_key: Uint8Array): Promise<void> {
    this.state.previous_chain_length = this.state.send_message_number;
    this.state.send_message_number = 0;
    this.state.recv_message_number = 0;
    this.state.dh_remote_public = array_to_base64(remote_public_key);

    const root_key = base64_to_array(this.state.root_key);
    const secret_key = await import_secret_key(
      base64_to_array(this.state.dh_keypair.secret_key),
    );
    const public_key = await import_public_key(remote_public_key);

    const dh_output = await dh(secret_key, public_key);
    const { new_root_key, chain_key } = await kdf_root_key(root_key, dh_output);

    this.state.root_key = array_to_base64(new_root_key);
    this.state.chain_key_recv = array_to_base64(chain_key);

    const new_dh_keypair = await generate_dh_keypair();

    this.state.dh_keypair = {
      public_key: array_to_base64(new_dh_keypair.public_key),
      secret_key: array_to_base64(new_dh_keypair.secret_key),
    };

    const new_secret_key = await import_secret_key(new_dh_keypair.secret_key);
    const new_dh_output = await dh(new_secret_key, public_key);
    const { new_root_key: newer_root_key, chain_key: send_chain_key } =
      await kdf_root_key(new_root_key, new_dh_output);

    this.state.root_key = array_to_base64(newer_root_key);
    this.state.chain_key_send = array_to_base64(send_chain_key);

    secure_zero_memory(root_key);
    secure_zero_memory(dh_output);
    secure_zero_memory(new_root_key);
    secure_zero_memory(chain_key);
    secure_zero_memory(new_dh_keypair.secret_key);
    secure_zero_memory(new_dh_output);
    secure_zero_memory(newer_root_key);
    secure_zero_memory(send_chain_key);
  }

  private cleanup_old_skipped_keys(): void {
    const one_week_ago = Date.now() - 7 * 24 * 60 * 60 * 1000;

    this.state.skipped_message_keys = this.state.skipped_message_keys.filter(
      (k) => k.timestamp > one_week_ago,
    );

    while (this.state.skipped_message_keys.length > MAX_SKIP) {
      this.state.skipped_message_keys.shift();
    }
  }

  get_public_key(): string {
    return this.state.dh_keypair.public_key;
  }

  get_conversation_id(): string {
    return this.conversation_id;
  }

  get_state_version(): number {
    return this.state.version;
  }

  async serialize(): Promise<SerializedState> {
    return {
      state: { ...this.state },
      conversation_id: this.conversation_id,
    };
  }

  static deserialize(data: SerializedState): DoubleRatchet {
    return new DoubleRatchet(data.state, data.conversation_id);
  }
}

function secure_zero_memory(buffer: Uint8Array): void {
  crypto.getRandomValues(buffer);
  buffer.fill(0);
}

const RATCHET_STORAGE_KEY_PREFIX = "ratchet_state_";
const RATCHET_INDEX_KEY = "ratchet_conversation_index";

async function get_storage_encryption_key(): Promise<CryptoKey> {
  if (!has_vault_in_memory()) {
    throw new Error("Session expired. Please log in again.");
  }

  const encryption_key = get_derived_encryption_key();

  if (!encryption_key) {
    throw new Error("Key material unavailable. Please log in again.");
  }

  const crypto_key = await crypto.subtle.importKey(
    "raw",
    encryption_key,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  secure_zero_memory(encryption_key);

  return crypto_key;
}

export async function save_ratchet_state(
  ratchet: DoubleRatchet,
): Promise<void> {
  const serialized = await ratchet.serialize();
  const storage_key = await get_storage_encryption_key();
  const state_key = `${RATCHET_STORAGE_KEY_PREFIX}${serialized.conversation_id}`;

  await encrypted_set(state_key, serialized, storage_key);

  const index =
    (await encrypted_get<string[]>(RATCHET_INDEX_KEY, storage_key)) || [];

  if (!index.includes(serialized.conversation_id)) {
    index.push(serialized.conversation_id);
    await encrypted_set(RATCHET_INDEX_KEY, index, storage_key);
  }
}

export async function load_ratchet_state(
  conversation_id: string,
): Promise<DoubleRatchet | null> {
  const storage_key = await get_storage_encryption_key();
  const state_key = `${RATCHET_STORAGE_KEY_PREFIX}${conversation_id}`;

  const state = await encrypted_get<SerializedState>(state_key, storage_key);

  if (!state) return null;

  return DoubleRatchet.deserialize(state);
}

export async function delete_ratchet_state(
  conversation_id: string,
): Promise<void> {
  const storage_key = await get_storage_encryption_key();
  const state_key = `${RATCHET_STORAGE_KEY_PREFIX}${conversation_id}`;

  await encrypted_delete(state_key);

  const index =
    (await encrypted_get<string[]>(RATCHET_INDEX_KEY, storage_key)) || [];
  const filtered = index.filter((id) => id !== conversation_id);

  if (filtered.length === 0) {
    await encrypted_delete(RATCHET_INDEX_KEY);
  } else {
    await encrypted_set(RATCHET_INDEX_KEY, filtered, storage_key);
  }
}

export async function list_ratchet_conversations(): Promise<string[]> {
  try {
    const storage_key = await get_storage_encryption_key();
    const index = await encrypted_get<string[]>(RATCHET_INDEX_KEY, storage_key);

    return index || [];
  } catch {
    return [];
  }
}

export async function clear_all_ratchet_states(): Promise<void> {
  try {
    const storage_key = await get_storage_encryption_key();
    const index =
      (await encrypted_get<string[]>(RATCHET_INDEX_KEY, storage_key)) || [];

    for (const conversation_id of index) {
      const state_key = `${RATCHET_STORAGE_KEY_PREFIX}${conversation_id}`;

      await encrypted_delete(state_key);
    }

    await encrypted_delete(RATCHET_INDEX_KEY);
  } catch {
    return;
  }
}

export async function generate_keypair(): Promise<RatchetKeyPair> {
  return generate_dh_keypair();
}

export type { RatchetKeyPair, EncryptedMessage, RatchetState };
