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
import type { MailItemMetadata } from "@/types/email";

import { describe, it, expect, vi } from "vitest";

vi.mock("@/services/crypto/encrypted_storage", () => ({
  encrypted_set: vi.fn(),
  encrypted_get: vi.fn(),
  encrypted_list_keys: async () => [],
  secure_overwrite_and_delete: vi.fn(),
}));
vi.mock("@/services/crypto/memory_key_store", () => ({
  has_vault_in_memory: () => false,
  get_derived_encryption_key: () => null,
  get_passphrase_bytes: vi.fn(),
  get_passphrase_from_memory: vi.fn(),
  get_vault_from_memory: vi.fn(),
}));
vi.mock("@/services/account_manager", () => ({
  get_current_account_id: async () => "account-1",
}));
vi.mock("@/services/crypto/legacy_keks", () => ({
  decrypt_aes_gcm_with_fallback: vi.fn(),
}));
vi.mock("@/services/api/mail", () => ({
  list_encrypted_mail_items: vi.fn(),
  list_mail_items: vi.fn(),
  reencrypt_mail_item_envelope: vi.fn(),
}));
vi.mock("@/services/crypto/mail_metadata", () => ({
  decrypt_mail_metadata: vi.fn(),
}));
vi.mock("@/services/crypto/envelope", () => ({
  decrypt_envelope_with_bytes: vi.fn(),
  encrypt_envelope_with_identity_key: vi.fn(),
  base64_to_array: vi.fn(),
  normalize_envelope_from: vi.fn(),
}));
vi.mock("@/workers/pgp_decrypt_pool", () => ({
  decrypt_pgp_message_parallel: vi.fn(),
}));

import { parse_search_query } from "@/utils/search_operators";
import {
  can_refine_scan,
  candidates_are_cacheable,
  operators_equal,
  options_signature,
  passes_search_filters,
  type ScanCacheEntry,
  type ScanCandidate,
  type SearchOptions,
} from "@/hooks/use_search";

const index_state = { built_at: 5000, meta: { saved_at: 900 } } as Parameters<
  typeof can_refine_scan
>[4];

function make_cache(overrides: Partial<ScanCacheEntry> = {}): ScanCacheEntry {
  return {
    terms: ["quar"],
    operators: [],
    options_key: options_signature(),
    built_at: 5000,
    saved_at: 900,
    candidates: [],
    ...overrides,
  };
}

function make_item(overrides: Partial<MailItem> = {}): MailItem {
  return {
    id: "item-1",
    item_type: "received",
    encrypted_envelope: "",
    envelope_nonce: "",
    folder_token: "inbox",
    is_external: false,
    created_at: "2026-03-10T12:00:00Z",
    ...overrides,
  } as MailItem;
}

describe("options_signature", () => {
  it("matches for equal options regardless of label map order", () => {
    const first: SearchOptions = {
      fields: ["all"],
      filters: { is_starred: true },
      label_name_to_tokens: new Map([
        ["work", ["a"]],
        ["home", ["b"]],
      ]),
    };
    const second: SearchOptions = {
      fields: ["all"],
      filters: { is_starred: true },
      label_name_to_tokens: new Map([
        ["home", ["b"]],
        ["work", ["a"]],
      ]),
    };

    expect(options_signature(first)).toBe(options_signature(second));
  });

  it("changes when a filter changes", () => {
    expect(options_signature({ filters: { is_starred: true } })).not.toBe(
      options_signature({ filters: { is_starred: false } }),
    );
  });

  it("changes when the searched fields change", () => {
    expect(options_signature({ fields: ["subject"] })).not.toBe(
      options_signature({ fields: ["all"] }),
    );
  });

  it("changes when body search is disabled", () => {
    expect(options_signature({ search_body: false })).not.toBe(
      options_signature(),
    );
  });
});

describe("operators_equal", () => {
  it("accepts the same operators in the same order", () => {
    expect(
      operators_equal(
        parse_search_query("is:unread from:alice").operators,
        parse_search_query("is:unread from:alice").operators,
      ),
    ).toBe(true);
  });

  it("rejects a different order", () => {
    expect(
      operators_equal(
        parse_search_query("is:unread from:alice").operators,
        parse_search_query("from:alice is:unread").operators,
      ),
    ).toBe(false);
  });

  it("rejects a flipped negation", () => {
    expect(
      operators_equal(
        parse_search_query("from:alice").operators,
        parse_search_query("-from:alice").operators,
      ),
    ).toBe(false);
  });

  it("rejects a different count", () => {
    expect(operators_equal(parse_search_query("is:unread").operators, [])).toBe(
      false,
    );
  });
});

describe("can_refine_scan", () => {
  it("reuses the previous candidates when every term grew", () => {
    expect(
      can_refine_scan(
        make_cache(),
        ["quarterly"],
        [],
        options_signature(),
        index_state,
      ),
    ).toBe(true);
  });

  it("reuses the previous candidates when a term was added", () => {
    expect(
      can_refine_scan(
        make_cache(),
        ["quar", "report"],
        [],
        options_signature(),
        index_state,
      ),
    ).toBe(true);
  });

  it("refuses when a term was dropped", () => {
    expect(
      can_refine_scan(
        make_cache({ terms: ["quar", "report"] }),
        ["quar"],
        [],
        options_signature(),
        index_state,
      ),
    ).toBe(false);
  });

  it("refuses when a term was shortened", () => {
    expect(
      can_refine_scan(
        make_cache({ terms: ["quarterly"] }),
        ["quart"],
        [],
        options_signature(),
        index_state,
      ),
    ).toBe(false);
  });

  it("refuses without a previous scan", () => {
    expect(
      can_refine_scan(null, ["quar"], [], options_signature(), index_state),
    ).toBe(false);
  });

  it("refuses when the options changed", () => {
    expect(
      can_refine_scan(
        make_cache(),
        ["quarterly"],
        [],
        options_signature({ filters: { is_starred: true } }),
        index_state,
      ),
    ).toBe(false);
  });

  it("refuses when the index was rebuilt", () => {
    expect(
      can_refine_scan(
        make_cache({ built_at: 4000 }),
        ["quarterly"],
        [],
        options_signature(),
        index_state,
      ),
    ).toBe(false);
  });

  it("refuses when the disk snapshot was rewritten", () => {
    expect(
      can_refine_scan(
        make_cache({ saved_at: 800 }),
        ["quarterly"],
        [],
        options_signature(),
        index_state,
      ),
    ).toBe(false);
  });

  it("refuses when the operators changed", () => {
    expect(
      can_refine_scan(
        make_cache(),
        ["quarterly"],
        parse_search_query("is:unread").operators,
        options_signature(),
        index_state,
      ),
    ).toBe(false);
  });
});

describe("candidates_are_cacheable", () => {
  function make_candidate(body_chars: number): ScanCandidate {
    return {
      item: make_item(),
      entry: {
        envelope: null,
        metadata: null,
        search_body_text: "x".repeat(body_chars),
        meta_fp: "fp",
        has_body: true,
      },
      result: {} as ScanCandidate["result"],
    };
  }

  it("accepts an empty candidate set", () => {
    expect(candidates_are_cacheable([])).toBe(true);
  });

  it("accepts a modest candidate set", () => {
    expect(
      candidates_are_cacheable(
        Array.from({ length: 100 }, () => make_candidate(1000)),
      ),
    ).toBe(true);
  });

  it("refuses a candidate set that would retain too much body text", () => {
    expect(
      candidates_are_cacheable(
        Array.from({ length: 500 }, () => make_candidate(20_000)),
      ),
    ).toBe(false);
  });
});

describe("passes_search_filters", () => {
  const starred = { is_starred: true } as MailItemMetadata;
  const plain = {} as MailItemMetadata;

  it("passes everything without filters", () => {
    expect(passes_search_filters(make_item(), null)).toBe(true);
  });

  it("filters on attachments in both directions", () => {
    expect(
      passes_search_filters(make_item(), plain, { has_attachments: true }),
    ).toBe(false);
    expect(
      passes_search_filters(make_item(), plain, { has_attachments: false }),
    ).toBe(true);
  });

  it("filters on stars", () => {
    expect(
      passes_search_filters(make_item(), starred, { is_starred: true }),
    ).toBe(true);
    expect(
      passes_search_filters(make_item(), plain, { is_starred: true }),
    ).toBe(false);
  });

  it("treats date bounds as local whole days", () => {
    const item = make_item({ message_ts: "2026-03-10T12:00:00Z" });

    expect(
      passes_search_filters(item, plain, {
        date_from: "2026-03-10",
        date_to: "2026-03-10",
      }),
    ).toBe(true);
    expect(
      passes_search_filters(item, plain, { date_from: "2026-03-11" }),
    ).toBe(false);
    expect(passes_search_filters(item, plain, { date_to: "2026-03-09" })).toBe(
      false,
    );
  });

  it("keeps undated mail inside a date filter", () => {
    const item = make_item({ message_ts: "", created_at: "not-a-date" });

    expect(
      passes_search_filters(item, plain, {
        date_from: "2026-03-01",
        date_to: "2026-03-31",
      }),
    ).toBe(true);
  });
});
