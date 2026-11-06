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
import type { ApiResponse } from "@/services/api/client";
import type { EncryptedVault } from "../key_manager_core";
import type { ResealApi, ResealStep } from "./reseal_io";

import { beforeAll, describe, expect, it, vi } from "vitest";

import { array_to_base64, base64_to_array } from "../base64";
import {
  STORAGE_KDF_VERSION_LEGACY,
  STORAGE_KDF_VERSION_STRETCHED,
  derive_encryption_key_from_passphrase,
} from "../memory_key_store";
import { ratchet_state_bound_aad } from "../ratchet_state_container";
import {
  derive_storage_hmac_key,
  import_storage_aes_key,
} from "../storage_write_key";
import { derive_ratchet_aes_key } from "./reseal_keys";
import { memory_progress_store } from "./reseal_io";
import {
  MAIL_TOKENS_PATH,
  STORAGE_REKEY_PATH,
  USER_REKEY_PATH,
} from "./step_helpers";
import { run_storage_reseal } from "./run";
import {
  ALIAS_HMAC_INFO,
  deleted_aliases_step,
  ghost_aliases_step,
} from "./steps_addresses";
import {
  PROFILE_NOTES_HMAC_INFO,
  alias_directories_step,
  alias_items_step,
  contact_extras_step,
  contact_field_definitions_step,
  profile_notes_step,
  ratchet_states_step,
  signatures_step,
  sync_sources_step,
  templates_step,
} from "./steps_categories";
import { RECENT_RECIPIENTS_INFO, recent_recipients_step } from "./steps_lists";

const PASSWORD = "Rotation-Passw0rd-77";
const LONG_TEST = { timeout: 120000 };
const no_sleep = async (): Promise<void> => {};

type Row = Record<string, unknown>;
type KeyKind = "storage" | "ratchet";

interface Expectation {
  table: string;
  id: string;
  ciphertext_field: string;
  nonce_field: string;
  plaintext: string;
  kind: KeyKind;
  aad?: Uint8Array;
}

interface RecordedWrite {
  method: "post" | "put";
  path: string;
  body: unknown;
}

let v1_raw: Uint8Array;
let v2_raw: Uint8Array;
let key_material_raw: Uint8Array;

function random_raw(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(32));
}

function old_raws(): Uint8Array[] {
  return [v1_raw, v2_raw, key_material_raw];
}

async function key_for(raw: Uint8Array, kind: KeyKind): Promise<CryptoKey> {
  return kind === "ratchet"
    ? derive_ratchet_aes_key(raw)
    : import_storage_aes_key(raw);
}

async function seal(
  raw: Uint8Array,
  value: string,
  kind: KeyKind = "storage",
  aad?: Uint8Array,
): Promise<{ ciphertext: string; nonce: string }> {
  const key = await key_for(raw, kind);
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const params: AesGcmParams = aad
    ? { name: "AES-GCM", iv: nonce, additionalData: aad }
    : { name: "AES-GCM", iv: nonce };
  const ciphertext = await crypto.subtle.encrypt(
    params,
    key,
    new TextEncoder().encode(value),
  );

  return {
    ciphertext: array_to_base64(new Uint8Array(ciphertext)),
    nonce: array_to_base64(nonce),
  };
}

async function opens(
  raw: Uint8Array,
  ciphertext: string,
  nonce: string,
  kind: KeyKind,
  aad?: Uint8Array,
): Promise<string | null> {
  const key = await key_for(raw, kind);
  const params: AesGcmParams = aad
    ? { name: "AES-GCM", iv: base64_to_array(nonce), additionalData: aad }
    : { name: "AES-GCM", iv: base64_to_array(nonce) };

  try {
    const plain = await crypto.subtle.decrypt(
      params,
      key,
      base64_to_array(ciphertext),
    );

    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

async function hmac(
  raw: Uint8Array,
  info: string,
  value: string,
): Promise<string> {
  const key = await derive_storage_hmac_key(raw, info);
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(value),
  );

  return array_to_base64(new Uint8Array(sig));
}

const SEALED_COLUMNS: Record<string, [string, string]> = {
  alias_pins: ["encrypted_sender", "sender_nonce"],
  alias_contacts: ["encrypted_contact", "contact_nonce"],
  alias_destinations: ["encrypted_destination", "destination_nonce"],
  alias_directories: ["encrypted_label", "label_nonce"],
  contact_field_definitions: ["encrypted_name", "name_nonce"],
};

class FakeServer {
  tables = new Map<string, Map<string, Row>>();
  writes: RecordedWrite[] = [];

  table(name: string): Map<string, Row> {
    let table = this.tables.get(name);

    if (!table) {
      table = new Map();
      this.tables.set(name, table);
    }

    return table;
  }

  row_count(): number {
    let total = 0;

    for (const table of this.tables.values()) total += table.size;

    return total;
  }

  rows(name: string, owner?: string): Row[] {
    return [...this.table(name).values()].filter(
      (row) => owner === undefined || row.owner === owner,
    );
  }

  api: ResealApi = {
    get: async <T>(path: string): Promise<ApiResponse<T>> =>
      this.handle_get(path) as ApiResponse<T>,
    post: async <T>(path: string, body: unknown): Promise<ApiResponse<T>> => {
      this.writes.push({ method: "post", path, body });

      return this.handle_post(path, body as Row) as ApiResponse<T>;
    },
    put: async <T>(path: string, body: unknown): Promise<ApiResponse<T>> => {
      this.writes.push({ method: "put", path, body });

      return this.handle_put(path, body as Row) as ApiResponse<T>;
    },
  };

  private strip(rows: Row[]): Row[] {
    return rows.map(({ owner: _owner, ...rest }) => rest);
  }

  private handle_get(path: string): ApiResponse<unknown> {
    const url = new URL(path, "https://fake.invalid");
    const p = url.pathname;
    const ok = (data: unknown): ApiResponse<unknown> => ({ data });
    let match: RegExpMatchArray | null;

    if (p === "/crypto/v1/ratchet/states") return ok(this.rows("ratchet"));
    if (p === "/settings/v1/profile_notes/all") {
      return ok({ notes: this.rows("notes") });
    }
    if (p === "/contacts/v1") {
      const ids = [...this.table("contacts").keys()].sort();
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const cursor = url.searchParams.get("cursor");
      const start = cursor ? ids.findIndex((id) => id > cursor) : 0;
      const slice = start < 0 ? [] : ids.slice(start, start + limit);
      const has_more = start >= 0 && start + limit < ids.length;

      return ok({
        items: slice.map((id) => this.table("contacts").get(id)),
        next_cursor: has_more ? slice[slice.length - 1] : null,
        has_more,
      });
    }
    if (p === "/contacts/v1/blocked_senders") return ok({ blocked_senders: [] });
    if (p === "/contacts/v1/allowed_senders") return ok({ allowed_senders: [] });
    if (p === "/contacts/v1/recent_recipients") {
      const limit = Number(url.searchParams.get("limit") ?? "100");
      const offset = Number(url.searchParams.get("offset") ?? "0");

      return ok({ items: this.rows("recent").slice(offset, offset + limit) });
    }
    if (p === "/contacts/v1/fields") {
      return ok({ items: this.rows("contact_field_definitions") });
    }
    if (p === "/contacts/v1/sync/sources") {
      return ok({ items: this.rows("sync_sources") });
    }
    if (p === "/addresses/v1/aliases") {
      return ok({ aliases: this.rows("aliases"), has_more: false });
    }
    if (p === "/addresses/v1/aliases/ghost") {
      return ok({ aliases: this.rows("ghost") });
    }
    if (p === "/addresses/v1/aliases/deleted") {
      return ok({ aliases: this.rows("deleted") });
    }
    if (p === "/addresses/v1/aliases/directories") {
      return ok({ directories: this.rows("alias_directories") });
    }
    if (p === "/addresses/v1/domains") return ok({ domains: this.rows("domains") });
    if ((match = p.match(/^\/addresses\/v1\/domains\/([^/]+)\/addresses$/))) {
      return ok({ addresses: this.strip(this.rows("domain_addresses", match[1])) });
    }
    if (
      (match = p.match(
        /^\/addresses\/v1\/aliases\/(?:domain-addresses\/)?([^/]+)\/(pins|contacts|destinations)$/,
      ))
    ) {
      const table = `alias_${match[2]}`;
      const key = { pins: "pins", contacts: "contacts", destinations: "destinations" }[
        match[2]
      ] as string;

      return ok({ [key]: this.strip(this.rows(table, match[1])) });
    }
    if ((match = p.match(/^\/contacts\/v1\/([^/]+)\/fields$/))) {
      return ok({ items: this.strip(this.rows("field_values", match[1])) });
    }
    if ((match = p.match(/^\/contacts\/v1\/([^/]+)\/attachments$/))) {
      return ok({
        items: this.rows("attachments", match[1]).map((row) => ({
          id: row.id,
          encrypted_meta: row.encrypted_meta,
          meta_nonce: row.meta_nonce,
          size_bytes: row.size_bytes,
        })),
      });
    }
    if ((match = p.match(/^\/contacts\/v1\/([^/]+)\/attachments\/([^/]+)$/))) {
      const row = this.table("attachments").get(match[2]);

      return row ? ok(this.strip([row])[0]) : { error: "not found", status: 404 };
    }
    if ((match = p.match(/^\/contacts\/v1\/([^/]+)\/photo$/))) {
      const row = this.rows("photos", match[1])[0];

      return row ? ok(this.strip([row])[0]) : { error: "not found", status: 404 };
    }
    if ((match = p.match(/^\/mail\/v1\/(signatures|templates)$/))) {
      return ok({ [match[1]]: this.rows(match[1]) });
    }
    if ((match = p.match(/^\/mail\/v1\/(signatures|templates)\/([^/]+)$/))) {
      const row = this.table(match[1]).get(match[2]);

      return row ? ok(row) : { error: "not found", status: 404 };
    }

    throw new Error(`unexpected GET ${path}`);
  }

  private apply_sealed(category: string, items: Row[]): void {
    const [ct_field, nonce_field] = SEALED_COLUMNS[category];

    for (const item of items) {
      const row = this.table(category).get(String(item.id));

      if (!row) continue;
      row[ct_field] = item.ciphertext;
      row[nonce_field] = item.nonce;
    }
  }

  private handle_post(path: string, body: Row): ApiResponse<unknown> {
    let match: RegExpMatchArray | null;

    if (path === MAIL_TOKENS_PATH) return { data: { done: true } };
    if (path === STORAGE_REKEY_PATH) return this.storage_rekey(body);
    if (path === USER_REKEY_PATH) {
      for (const item of (body.re_encrypted_aliases ?? []) as Row[]) {
        const row = this.table("ghost").get(String(item.id));

        if (row) Object.assign(row, item);
      }

      return { data: { success: true } };
    }
    if ((match = path.match(/^\/contacts\/v1\/([^/]+)\/photo$/))) {
      const existing = this.rows("photos", match[1])[0];
      const id = existing ? String(existing.id) : `photo-${match[1]}`;

      this.table("photos").set(id, { id, owner: match[1], ...body });

      return { data: { success: true } };
    }

    throw new Error(`unexpected POST ${path}`);
  }

  private storage_rekey(body: Row): ApiResponse<unknown> {
    for (const category of Object.keys(SEALED_COLUMNS)) {
      if (body[category]) this.apply_sealed(category, body[category] as Row[]);
    }
    for (const item of (body.ratchet_states ?? []) as Row[]) {
      const row = this.table("ratchet").get(String(item.id));

      if (!row || row.state_version !== item.expected_version) continue;
      row.encrypted_state = item.encrypted_state;
      row.state_nonce = item.state_nonce;
      row.state_version = Number(row.state_version) + 1;
    }
    const notes = (body.profile_notes ?? []) as Row[];

    for (const item of notes) {
      const clash = this.rows("notes").some(
        (row) => row.id !== item.id && row.email_token === item.email_token,
      );

      if (clash) return { error: "conflict", status: 409 };
    }
    for (const item of notes) {
      const row = this.table("notes").get(String(item.id));

      if (row) Object.assign(row, item);
    }
    for (const item of (body.contact_attachments ?? []) as Row[]) {
      const row = this.table("attachments").get(String(item.id));

      if (!row) continue;
      if (
        String(item.encrypted_data).length !== String(row.encrypted_data).length
      ) {
        return { error: "size mismatch", status: 400 };
      }
      Object.assign(row, item);
    }
    for (const item of (body.deleted_aliases ?? []) as Row[]) {
      const row = this.table("deleted").get(String(item.id));

      if (row) Object.assign(row, item);
    }
    for (const item of (body.recent_recipients ?? []) as Row[]) {
      const row = this.table("recent").get(String(item.id));

      if (row) Object.assign(row, item);
    }

    return { data: { success: true } };
  }

  private handle_put(path: string, body: Row): ApiResponse<unknown> {
    let match: RegExpMatchArray | null;

    if ((match = path.match(/^\/contacts\/v1\/([^/]+)\/fields\/([^/]+)$/))) {
      const row = this.rows("field_values", match[1]).find(
        (value) => value.field_definition_id === match![2],
      );

      if (!row) return { error: "not found", status: 404 };
      Object.assign(row, body);

      return { data: { success: true } };
    }
    if ((match = path.match(/^\/mail\/v1\/(signatures|templates)\/([^/]+)$/))) {
      const row = this.table(match[1]).get(match[2]);

      if (!row) return { error: "not found", status: 404 };
      Object.assign(row, body);

      return { data: { success: true } };
    }
    if ((match = path.match(/^\/contacts\/v1\/sync\/sources\/([^/]+)$/))) {
      const row = this.table("sync_sources").get(match[1]);

      if (!row) return { error: "not found", status: 404 };
      Object.assign(row, body);

      return { data: { success: true } };
    }

    throw new Error(`unexpected PUT ${path}`);
  }
}

function rotated_vault(data_kek: Uint8Array): EncryptedVault {
  const now = new Date().toISOString();
  const prior = old_raws().map((raw) => array_to_base64(raw));

  return {
    identity_key: "identity",
    signed_prekey: "prekey",
    signed_prekey_private: "prekey_private",
    recovery_codes: [],
    vault_format: 2,
    data_kek: array_to_base64(data_kek),
    data_kek_random: true,
    legacy_keks: prior.map((k) => ({ k, added_at: now })),
    storage_rekey: { state: "pending", started_at: now, prior_keys: prior },
  };
}

class Seeder {
  expectations: Expectation[] = [];
  private turn = 0;

  constructor(private server: FakeServer) {}

  next_old(): Uint8Array {
    const raw = old_raws()[this.turn % 3];

    this.turn += 1;

    return raw;
  }

  async sealed_row(
    table: string,
    id: string,
    fields: Row,
    ciphertext_field: string,
    nonce_field: string,
    plaintext: string,
    options: { kind?: KeyKind; aad?: Uint8Array; raw?: Uint8Array } = {},
  ): Promise<Row> {
    const kind = options.kind ?? "storage";
    const sealed = await seal(
      options.raw ?? this.next_old(),
      plaintext,
      kind,
      options.aad,
    );
    const row: Row = {
      id,
      ...fields,
      [ciphertext_field]: sealed.ciphertext,
      [nonce_field]: sealed.nonce,
    };

    this.server.table(table).set(id, row);
    if (!options.raw) {
      this.expectations.push({
        table,
        id,
        ciphertext_field,
        nonce_field,
        plaintext,
        kind,
        aad: options.aad,
      });
    }

    return row;
  }

  async add_pair(
    row: Row,
    table: string,
    ciphertext_field: string,
    nonce_field: string,
    plaintext: string,
  ): Promise<void> {
    const sealed = await seal(this.next_old(), plaintext);

    row[ciphertext_field] = sealed.ciphertext;
    row[nonce_field] = sealed.nonce;
    this.expectations.push({
      table,
      id: String(row.id),
      ciphertext_field,
      nonce_field,
      plaintext,
      kind: "storage",
    });
  }
}

async function expect_resealed(
  server: FakeServer,
  expectations: Expectation[],
  new_raw: Uint8Array,
): Promise<void> {
  for (const item of expectations) {
    const row = server.table(item.table).get(item.id);
    const label = `${item.table}/${item.id}/${item.ciphertext_field}`;

    expect(row, label).toBeDefined();

    const ciphertext = String(row![item.ciphertext_field]);
    const nonce = String(row![item.nonce_field]);

    expect(
      await opens(new_raw, ciphertext, nonce, item.kind, item.aad),
      label,
    ).toBe(item.plaintext);
    for (const raw of old_raws()) {
      for (const kind of ["storage", "ratchet"] as KeyKind[]) {
        expect(await opens(raw, ciphertext, nonce, kind), label).toBeNull();
        if (item.aad) {
          expect(
            await opens(raw, ciphertext, nonce, kind, item.aad),
            label,
          ).toBeNull();
        }
      }
    }
  }
}

async function run_twice(
  server: FakeServer,
  steps: ResealStep[],
  expectations: Expectation[],
  unreadable = 0,
): Promise<void> {
  const new_raw = random_raw();
  const vault = rotated_vault(new_raw);
  const rows_before = server.row_count();
  const options = {
    vault,
    api: server.api,
    finish: vi.fn(async () => "done" as const),
    still_current: async () => true,
    sleep: no_sleep,
    steps,
  };

  const first = await run_storage_reseal({
    ...options,
    store: memory_progress_store(),
  });

  expect(first.status).toBe("done");
  expect(first.counts.unreadable).toBe(unreadable);
  expect(first.counts.rejected).toBe(0);
  expect(first.counts.resealed).toBeGreaterThan(0);
  expect(server.row_count()).toBe(rows_before);
  await expect_resealed(server, expectations, new_raw);

  const writes_after_first = server.writes.length;
  const second = await run_storage_reseal({
    ...options,
    store: memory_progress_store(),
  });

  expect(second.status).toBe("done");
  expect(second.counts.resealed).toBe(0);
  expect(second.counts.conflicts).toBe(0);
  expect(server.writes.length).toBe(writes_after_first);
  expect(server.row_count()).toBe(rows_before);
  await expect_resealed(server, expectations, new_raw);
}

function b64_text(value: string): string {
  return array_to_base64(new TextEncoder().encode(value));
}

function ratchet_json(conversation_id: string, bound: boolean): string {
  return JSON.stringify({
    state: { root: `root-${conversation_id}`, conversation_id },
    ...(bound ? { conversation_id, sync_version: 5 } : {}),
  });
}

describe("storage reseal categories", () => {
  beforeAll(async () => {
    const bytes = new TextEncoder().encode(PASSWORD);

    v1_raw = await derive_encryption_key_from_passphrase(
      bytes,
      STORAGE_KDF_VERSION_LEGACY,
    );
    v2_raw = await derive_encryption_key_from_passphrase(
      bytes,
      STORAGE_KDF_VERSION_STRETCHED,
    );

    const base = await crypto.subtle.importKey("raw", bytes, "PBKDF2", false, [
      "deriveBits",
    ]);

    key_material_raw = new Uint8Array(
      await crypto.subtle.deriveBits(
        {
          name: "PBKDF2",
          salt: new TextEncoder().encode("account-salt"),
          iterations: 1000,
          hash: "SHA-256",
        },
        base,
        256,
      ),
    );
  }, 120000);

  it("reseals ratchet states and keeps their binding", LONG_TEST, async () => {
    const server = new FakeServer();
    const seeder = new Seeder(server);
    const bound_aad = ratchet_state_bound_aad("conv-bound");

    await seeder.sealed_row(
      "ratchet",
      "r1",
      { conversation_id: b64_text("conv-bound"), state_version: 3 },
      "encrypted_state",
      "state_nonce",
      ratchet_json("conv-bound", true),
      { kind: "ratchet", aad: bound_aad },
    );
    const legacy = await seal(v2_raw, ratchet_json("conv-legacy", false));

    server.table("ratchet").set("r2", {
      id: "r2",
      conversation_id: b64_text("conv-legacy"),
      state_version: 7,
      encrypted_state: legacy.ciphertext,
      state_nonce: legacy.nonce,
    });
    seeder.expectations.push({
      table: "ratchet",
      id: "r2",
      ciphertext_field: "encrypted_state",
      nonce_field: "state_nonce",
      plaintext: ratchet_json("conv-legacy", false),
      kind: "ratchet",
    });
    const derived = await seal(
      key_material_raw,
      ratchet_json("conv-derived", true),
      "ratchet",
    );

    server.table("ratchet").set("r3", {
      id: "r3",
      conversation_id: b64_text("conv-derived"),
      state_version: 1,
      encrypted_state: derived.ciphertext,
      state_nonce: derived.nonce,
    });
    seeder.expectations.push({
      table: "ratchet",
      id: "r3",
      ciphertext_field: "encrypted_state",
      nonce_field: "state_nonce",
      plaintext: ratchet_json("conv-derived", true),
      kind: "ratchet",
    });
    const loose = await seal(v1_raw, ratchet_json("conv-loose", false), "ratchet");

    server.table("ratchet").set("r4", {
      id: "r4",
      conversation_id: b64_text("conv-loose"),
      state_version: 2,
      encrypted_state: loose.ciphertext,
      state_nonce: loose.nonce,
    });

    await run_twice(server, [ratchet_states_step], seeder.expectations, 1);

    expect(server.table("ratchet").get("r1")!.state_version).toBe(4);
    expect(server.table("ratchet").get("r4")!.encrypted_state).toBe(
      loose.ciphertext,
    );
  });

  it("reseals alias pins, contacts, destinations and directories", LONG_TEST, async () => {
    const server = new FakeServer();
    const seeder = new Seeder(server);

    server.table("aliases").set("a1", { id: "a1" });
    server.table("ghost").set("g1", { id: "g1" });
    server.table("domains").set("dom1", { id: "dom1", domain_name: "example.org" });
    server.table("domain_addresses").set("da1", { id: "da1", owner: "dom1" });

    for (const owner of ["a1", "g1", "da1"]) {
      await seeder.sealed_row(
        "alias_pins",
        `pin-${owner}`,
        { owner },
        "encrypted_sender",
        "sender_nonce",
        `pinned-${owner}@example.com`,
      );
      await seeder.sealed_row(
        "alias_contacts",
        `ac-${owner}`,
        { owner },
        "encrypted_contact",
        "contact_nonce",
        `friend-${owner}@example.com`,
      );
      await seeder.sealed_row(
        "alias_destinations",
        `dest-${owner}`,
        { owner },
        "encrypted_destination",
        "destination_nonce",
        `dest-${owner}@example.net`,
      );
    }
    await seeder.sealed_row(
      "alias_directories",
      "dir1",
      {},
      "encrypted_label",
      "label_nonce",
      "Shopping",
    );
    await seeder.sealed_row(
      "alias_directories",
      "dir-lost",
      {},
      "encrypted_label",
      "label_nonce",
      "Lost",
      { raw: random_raw() },
    );

    await run_twice(
      server,
      [alias_directories_step, alias_items_step],
      seeder.expectations,
      1,
    );
  });

  it("reseals deleted and ghost aliases with new lookup hashes", LONG_TEST, async () => {
    const server = new FakeServer();
    const seeder = new Seeder(server);
    const deleted_raw = v1_raw;
    const ghost_raw = v2_raw;

    await seeder.sealed_row(
      "deleted",
      "del1",
      {
        domain: "astermail.org",
        is_random: false,
        alias_address_hash: await hmac(
          deleted_raw,
          ALIAS_HMAC_INFO,
          "oldname@astermail.org",
        ),
      },
      "encrypted_local_part",
      "local_part_nonce",
      "oldname",
      { raw: deleted_raw },
    );
    await seeder.sealed_row(
      "ghost",
      "gh1",
      {
        domain: "astermail.org",
        is_random: true,
        alias_address_hash: await hmac(
          ghost_raw,
          ALIAS_HMAC_INFO,
          "ghostname@astermail.org",
        ),
      },
      "encrypted_local_part",
      "local_part_nonce",
      "ghostname",
      { raw: ghost_raw },
    );
    for (const [table, id, plaintext] of [
      ["deleted", "del1", "oldname"],
      ["ghost", "gh1", "ghostname"],
    ]) {
      seeder.expectations.push({
        table,
        id,
        ciphertext_field: "encrypted_local_part",
        nonce_field: "local_part_nonce",
        plaintext,
        kind: "storage",
      });
    }

    await run_twice(
      server,
      [deleted_aliases_step, ghost_aliases_step],
      seeder.expectations,
    );

    expect(server.writes.some((write) => write.path === MAIL_TOKENS_PATH)).toBe(
      true,
    );
  });

  it("reseals contact fields, attachments and photos", LONG_TEST, async () => {
    const server = new FakeServer();
    const seeder = new Seeder(server);

    await seeder.sealed_row(
      "contact_field_definitions",
      "fd1",
      {},
      "encrypted_name",
      "name_nonce",
      "Birthday",
    );
    for (const cid of ["c1", "c2"]) {
      await seeder.sealed_row(
        "contacts",
        cid,
        {},
        "encrypted_data",
        "data_nonce",
        JSON.stringify({ emails: [`${cid}@example.com`] }),
        { raw: random_raw() },
      );
      await seeder.sealed_row(
        "field_values",
        `fv-${cid}`,
        { owner: cid, field_definition_id: "fd1" },
        "encrypted_value",
        "value_nonce",
        `value ${cid}`,
      );
      const attachment = await seeder.sealed_row(
        "attachments",
        `att-${cid}`,
        { owner: cid, size_bytes: 9 },
        "encrypted_data",
        "data_nonce",
        `file body ${cid}`,
      );

      await seeder.add_pair(
        attachment,
        "attachments",
        "encrypted_meta",
        "meta_nonce",
        JSON.stringify({ name: `${cid}.pdf` }),
      );
      const photo = await seeder.sealed_row(
        "photos",
        `photo-${cid}`,
        { owner: cid, size_bytes: 4 },
        "encrypted_data",
        "data_nonce",
        `jpeg ${cid}`,
      );

      await seeder.add_pair(
        photo,
        "photos",
        "encrypted_meta",
        "meta_nonce",
        JSON.stringify({ type: "image/jpeg" }),
      );
    }

    const lengths = new Map(
      server
        .rows("attachments")
        .map((row) => [row.id, String(row.encrypted_data).length]),
    );

    await run_twice(
      server,
      [contact_field_definitions_step, contact_extras_step],
      seeder.expectations,
    );

    for (const row of server.rows("attachments")) {
      expect(String(row.encrypted_data).length).toBe(lengths.get(row.id));
    }
    for (const write of server.writes) {
      const body = write.body as Record<string, unknown[] | undefined>;

      if (body.contact_attachments) {
        expect(body.contact_attachments.length).toBeLessThanOrEqual(4);
      }
    }
  });

  it("reseals profile notes and moves their lookup tokens", LONG_TEST, async () => {
    const server = new FakeServer();
    const seeder = new Seeder(server);
    const known = "Friend@Example.com";
    const note_raw = v1_raw;

    await seeder.sealed_row(
      "contacts",
      "c1",
      {},
      "encrypted_data",
      "data_nonce",
      JSON.stringify({ emails: [known] }),
      { raw: v2_raw },
    );
    await seeder.sealed_row(
      "notes",
      "n1",
      {
        email_token: await hmac(
          note_raw,
          PROFILE_NOTES_HMAC_INFO,
          known.toLowerCase(),
        ),
        integrity_hash: "old",
      },
      "encrypted_note",
      "note_nonce",
      "met at the conference",
    );
    const orphan_token = await hmac(
      note_raw,
      PROFILE_NOTES_HMAC_INFO,
      "nobody@example.com",
    );

    await seeder.sealed_row(
      "notes",
      "n2",
      { email_token: orphan_token, integrity_hash: "old" },
      "encrypted_note",
      "note_nonce",
      "no matching address",
    );

    const new_raw = random_raw();
    const vault = rotated_vault(new_raw);
    const result = await run_storage_reseal({
      vault,
      api: server.api,
      store: memory_progress_store(),
      finish: vi.fn(async () => "done" as const),
      still_current: async () => true,
      sleep: no_sleep,
      steps: [profile_notes_step],
    });

    expect(result.status).toBe("done");
    expect(result.counts.resealed).toBe(2);
    await expect_resealed(server, seeder.expectations, new_raw);

    const n1 = server.table("notes").get("n1")!;
    const n2 = server.table("notes").get("n2")!;

    expect(n1.email_token).toBe(
      await hmac(new_raw, PROFILE_NOTES_HMAC_INFO, known.toLowerCase()),
    );
    expect(n2.email_token).toBe(orphan_token);
    for (const note of [n1, n2]) {
      expect(note.integrity_hash).toBe(
        await hmac(
          new_raw,
          PROFILE_NOTES_HMAC_INFO,
          `${note.encrypted_note}:${note.note_nonce}:profile-notes-v1`,
        ),
      );
    }

    const writes = server.writes.length;
    const again = await run_storage_reseal({
      vault,
      api: server.api,
      store: memory_progress_store(),
      finish: vi.fn(async () => "done" as const),
      still_current: async () => true,
      sleep: no_sleep,
      steps: [profile_notes_step],
    });

    expect(again.counts.resealed).toBe(0);
    expect(server.writes.length).toBe(writes);
    expect(server.row_count()).toBe(3);
  });

  it("reseals signatures, templates and sync sources", LONG_TEST, async () => {
    const server = new FakeServer();
    const seeder = new Seeder(server);
    const signature = await seeder.sealed_row(
      "signatures",
      "s1",
      {},
      "encrypted_name",
      "name_nonce",
      "Work",
    );

    await seeder.add_pair(
      signature,
      "signatures",
      "encrypted_content",
      "content_nonce",
      "<p>Regards</p>",
    );
    const template = await seeder.sealed_row(
      "templates",
      "t1",
      {},
      "encrypted_name",
      "name_nonce",
      "Follow up",
    );

    await seeder.add_pair(
      template,
      "templates",
      "encrypted_category",
      "category_nonce",
      "Sales",
    );
    await seeder.add_pair(
      template,
      "templates",
      "encrypted_content",
      "content_nonce",
      "Checking in.",
    );
    await seeder.sealed_row(
      "sync_sources",
      "src1",
      { source_type: "carddav" },
      "encrypted_config",
      "config_nonce",
      JSON.stringify({ url: "https://dav.example.com" }),
    );

    await run_twice(
      server,
      [signatures_step, templates_step, sync_sources_step],
      seeder.expectations,
    );

    expect(server.table("sync_sources").get("src1")!.source_type).toBe(
      "carddav",
    );
  });

  it("reaches every recent recipient past the first page", LONG_TEST, async () => {
    const server = new FakeServer();
    const seeder = new Seeder(server);

    for (let i = 0; i < 230; i++) {
      await seeder.sealed_row(
        "recent",
        `rr${String(i).padStart(3, "0")}`,
        { email_token: "old" },
        "encrypted_email",
        "email_nonce",
        `person${i}@example.com`,
      );
    }

    await run_twice(server, [recent_recipients_step], seeder.expectations);

    const sample = server.table("recent").get("rr229")!;

    expect(sample.email_token).not.toBe("old");
    expect(RECENT_RECIPIENTS_INFO).toBe("recent-recipients-hmac-v1");
  });
});
