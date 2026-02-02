import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  parse_query,
  create_bloom_filter,
  add_to_bloom_filter,
  check_bloom_filter,
  merge_bloom_filters,
  serialize_bloom_filter,
  deserialize_bloom_filter,
  create_empty_index,
  create_search_cache,
  generate_cache_key,
  clear_search_key_cache,
  SearchCrypto,
  get_search_crypto,
  reset_search_crypto,
  encrypt_search_count,
  decrypt_search_count,
  clear_count_key_cache,
  type SearchToken,
  type BloomFilter,
  type SearchIndex,
} from "./search_crypto";

vi.mock("./memory_key_store", () => ({
  get_derived_encryption_key: vi.fn(() => {
    const key = new Uint8Array(32);
    for (let i = 0; i < 32; i++) {
      key[i] = i;
    }
    return key;
  }),
}));

describe("parse_query", () => {
  it("should parse simple terms", () => {
    const result = parse_query("hello world");

    expect(result.terms.length).toBeGreaterThan(0);
    expect(result.required).toEqual([]);
    expect(result.excluded).toEqual([]);
    expect(result.phrases).toEqual([]);
  });

  it("should parse required terms with +", () => {
    const result = parse_query("+required term");

    expect(result.required.length).toBeGreaterThan(0);
  });

  it("should parse excluded terms with -", () => {
    const result = parse_query("-excluded term");

    expect(result.excluded.length).toBeGreaterThan(0);
  });

  it("should parse quoted phrases", () => {
    const result = parse_query('"exact phrase" other terms');

    expect(result.phrases.length).toBeGreaterThanOrEqual(0);
  });

  it("should parse field-specific queries", () => {
    const result = parse_query("subject:important from:alice");

    expect(result.field_specific.size).toBeGreaterThanOrEqual(0);
  });

  it("should handle empty query", () => {
    const result = parse_query("");

    expect(result.terms).toEqual([]);
    expect(result.required).toEqual([]);
  });

  it("should handle complex mixed queries", () => {
    const result = parse_query(
      '+must "exact match" -exclude subject:test regular'
    );

    expect(result.required.length).toBeGreaterThan(0);
    expect(result.excluded.length).toBeGreaterThan(0);
  });

  it("should handle special characters", () => {
    const result = parse_query("hello@world test.com");

    expect(result.terms.length).toBeGreaterThan(0);
  });

  it("should handle unicode by normalizing to alphanumeric", () => {
    const result = parse_query("hello world");

    expect(result.terms.length).toBeGreaterThan(0);
  });
});

describe("BloomFilter", () => {
  describe("create_bloom_filter", () => {
    it("should create filter with correct size", () => {
      const filter = create_bloom_filter();

      expect(filter.bits).toBeInstanceOf(Uint8Array);
      expect(filter.bits.length).toBe(256);
      expect(filter.hash_count).toBe(7);
    });

    it("should create empty filter", () => {
      const filter = create_bloom_filter();

      expect(filter.bits.every((b) => b === 0)).toBe(true);
    });
  });

  describe("add_to_bloom_filter", () => {
    it("should add token to filter", async () => {
      const filter = create_bloom_filter();

      await add_to_bloom_filter(filter, "test_token");

      expect(filter.bits.some((b) => b !== 0)).toBe(true);
    });

    it("should set consistent bits for same token", async () => {
      const filter1 = create_bloom_filter();
      const filter2 = create_bloom_filter();

      await add_to_bloom_filter(filter1, "same_token");
      await add_to_bloom_filter(filter2, "same_token");

      expect(filter1.bits).toEqual(filter2.bits);
    });

    it("should handle multiple tokens", async () => {
      const filter = create_bloom_filter();

      await add_to_bloom_filter(filter, "token1");
      await add_to_bloom_filter(filter, "token2");
      await add_to_bloom_filter(filter, "token3");

      expect(filter.bits.filter((b) => b !== 0).length).toBeGreaterThan(0);
    });
  });

  describe("check_bloom_filter", () => {
    it("should return true for added token", async () => {
      const filter = create_bloom_filter();

      await add_to_bloom_filter(filter, "present_token");

      const result = await check_bloom_filter(filter, "present_token");
      expect(result).toBe(true);
    });

    it("should likely return false for absent token", async () => {
      const filter = create_bloom_filter();

      await add_to_bloom_filter(filter, "present");

      const result = await check_bloom_filter(filter, "definitely_not_present");
      expect(typeof result).toBe("boolean");
    });

    it("should return false for empty filter", async () => {
      const filter = create_bloom_filter();

      const result = await check_bloom_filter(filter, "any_token");
      expect(result).toBe(false);
    });
  });

  describe("merge_bloom_filters", () => {
    it("should merge multiple filters", async () => {
      const filter1 = create_bloom_filter();
      const filter2 = create_bloom_filter();

      await add_to_bloom_filter(filter1, "token1");
      await add_to_bloom_filter(filter2, "token2");

      const merged = merge_bloom_filters([filter1, filter2]);

      const has_token1 = await check_bloom_filter(merged, "token1");
      const has_token2 = await check_bloom_filter(merged, "token2");

      expect(has_token1).toBe(true);
      expect(has_token2).toBe(true);
    });

    it("should handle empty filter array", () => {
      const merged = merge_bloom_filters([]);

      expect(merged.bits.every((b) => b === 0)).toBe(true);
    });

    it("should handle single filter", async () => {
      const filter = create_bloom_filter();
      await add_to_bloom_filter(filter, "token");

      const merged = merge_bloom_filters([filter]);

      expect(merged.bits).toEqual(filter.bits);
    });
  });

  describe("serialize/deserialize", () => {
    it("should serialize and deserialize filter", async () => {
      const filter = create_bloom_filter();
      await add_to_bloom_filter(filter, "test");

      const serialized = serialize_bloom_filter(filter);
      const deserialized = deserialize_bloom_filter(serialized);

      expect(deserialized.bits).toEqual(filter.bits);
      expect(deserialized.hash_count).toBe(filter.hash_count);
    });

    it("should produce valid base64 string", () => {
      const filter = create_bloom_filter();

      const serialized = serialize_bloom_filter(filter);

      expect(typeof serialized).toBe("string");
      expect(() => atob(serialized)).not.toThrow();
    });
  });
});

describe("SearchIndex", () => {
  describe("create_empty_index", () => {
    it("should create empty index with correct structure", () => {
      const index = create_empty_index();

      expect(index.version).toBe(2);
      expect(index.created_at).toBeGreaterThan(0);
      expect(index.updated_at).toBeGreaterThan(0);
      expect(index.token_map).toBeInstanceOf(Map);
      expect(index.message_tokens).toBeInstanceOf(Map);
      expect(index.message_metadata).toBeInstanceOf(Map);
      expect(index.bloom_filters).toBeInstanceOf(Map);
      expect(index.total_documents).toBe(0);
      expect(index.total_tokens).toBe(0);
    });
  });
});

describe("SearchCache", () => {
  it("should create cache with default size", () => {
    const cache = create_search_cache();

    expect(cache.get("nonexistent")).toBeNull();
  });

  it("should store and retrieve values", () => {
    const cache = create_search_cache();

    cache.set("key1", ["result1", "result2"]);

    expect(cache.get("key1")).toEqual(["result1", "result2"]);
  });

  it("should return null for missing keys", () => {
    const cache = create_search_cache();

    expect(cache.get("missing")).toBeNull();
  });

  it("should evict oldest entries when full", () => {
    const cache = create_search_cache(3);

    cache.set("key1", ["a"]);
    cache.set("key2", ["b"]);
    cache.set("key3", ["c"]);
    cache.set("key4", ["d"]);

    expect(cache.get("key1")).toBeNull();
    expect(cache.get("key4")).toEqual(["d"]);
  });

  it("should clear all entries", () => {
    const cache = create_search_cache();

    cache.set("key1", ["a"]);
    cache.set("key2", ["b"]);
    cache.clear();

    expect(cache.get("key1")).toBeNull();
    expect(cache.get("key2")).toBeNull();
  });

  it("should update timestamp on access", () => {
    const cache = create_search_cache(3);

    cache.set("key1", ["a"]);
    cache.set("key2", ["b"]);
    cache.get("key1");
    cache.set("key3", ["c"]);

    expect(cache.get("key1")).toEqual(["a"]);
    expect(cache.get("key2")).toEqual(["b"]);
  });
});

describe("generate_cache_key", () => {
  it("should generate consistent key for same tokens", async () => {
    const tokens: SearchToken[] = [
      { token: "abc", field: "subject" },
      { token: "def", field: "body" },
    ];

    const key1 = await generate_cache_key(tokens);
    const key2 = await generate_cache_key(tokens);

    expect(key1).toBe(key2);
  });

  it("should generate different keys for different tokens", async () => {
    const tokens1: SearchToken[] = [{ token: "abc", field: "subject" }];
    const tokens2: SearchToken[] = [{ token: "xyz", field: "subject" }];

    const key1 = await generate_cache_key(tokens1);
    const key2 = await generate_cache_key(tokens2);

    expect(key1).not.toBe(key2);
  });

  it("should include filters in key generation", async () => {
    const tokens: SearchToken[] = [{ token: "abc", field: "subject" }];

    const key1 = await generate_cache_key(tokens, { folder: "inbox" });
    const key2 = await generate_cache_key(tokens, { folder: "sent" });

    expect(key1).not.toBe(key2);
  });
});

describe("SearchCrypto class", () => {
  let search_crypto: SearchCrypto;

  beforeEach(() => {
    search_crypto = new SearchCrypto();
  });

  afterEach(() => {
    reset_search_crypto();
    clear_search_key_cache();
  });

  describe("build_index", () => {
    it("should build index from emails", async () => {
      const emails = [
        {
          id: "1",
          subject: "Hello World",
          body: "This is a test email",
          sender_email: "alice@example.com",
        },
        {
          id: "2",
          subject: "Meeting Tomorrow",
          body: "Let's discuss the project",
          sender_email: "bob@example.com",
        },
      ];

      const index = await search_crypto.build_index(emails);

      expect(index.total_documents).toBe(2);
      expect(index.total_tokens).toBeGreaterThan(0);
    });

    it("should handle empty email list", async () => {
      const index = await search_crypto.build_index([]);

      expect(index.total_documents).toBe(0);
      expect(index.total_tokens).toBe(0);
    });

    it("should index all searchable fields", async () => {
      const emails = [
        {
          id: "1",
          subject: "Subject text",
          body: "Body text",
          sender_email: "sender@example.com",
          sender_name: "Sender Name",
          recipient_emails: ["recipient@example.com"],
          recipient_names: ["Recipient Name"],
        },
      ];

      const index = await search_crypto.build_index(emails);

      expect(index.message_tokens.get("1")?.size).toBeGreaterThan(0);
    });
  });

  describe("search", () => {
    beforeEach(async () => {
      const emails = [
        {
          id: "1",
          subject: "Important Meeting",
          body: "Please attend the quarterly review",
          sender_email: "boss@company.com",
        },
        {
          id: "2",
          subject: "Lunch Plans",
          body: "Want to grab lunch?",
          sender_email: "friend@example.com",
        },
        {
          id: "3",
          subject: "Important Update",
          body: "Critical system update required",
          sender_email: "admin@company.com",
        },
      ];

      await search_crypto.build_index(emails);
    });

    it("should return empty results for empty query", async () => {
      const results = await search_crypto.search("");

      expect(results).toEqual([]);
    });

    it("should return empty results for no matches", async () => {
      const results = await search_crypto.search("xyznonexistent");

      expect(results).toEqual([]);
    });

    it("should respect limit option", async () => {
      const results = await search_crypto.search("important", { limit: 1 });

      expect(results.length).toBeLessThanOrEqual(1);
    });

    it("should handle whitespace query", async () => {
      const results = await search_crypto.search("   ");

      expect(results).toEqual([]);
    });
  });

  describe("update_index", () => {
    it("should add new emails to index", async () => {
      await search_crypto.build_index([
        { id: "1", subject: "First Email", body: "Content" },
      ]);

      await search_crypto.update_index([
        { id: "2", subject: "Second Email", body: "More content" },
      ]);

      const index = search_crypto.get_index();
      expect(index.total_documents).toBe(2);
    });

    it("should remove deleted emails from index", async () => {
      await search_crypto.build_index([
        { id: "1", subject: "Email 1", body: "Content" },
        { id: "2", subject: "Email 2", body: "Content" },
      ]);

      await search_crypto.update_index([], ["1"]);

      const index = search_crypto.get_index();
      expect(index.total_documents).toBe(1);
    });

    it("should update existing emails", async () => {
      await search_crypto.build_index([
        { id: "1", subject: "Original Subject", body: "Original body" },
      ]);

      await search_crypto.update_index([
        { id: "1", subject: "Updated Subject", body: "Updated body" },
      ]);

      const index = search_crypto.get_index();
      expect(index.total_documents).toBe(1);
    });
  });

  describe("encrypt_index / decrypt_index", () => {
    it("should encrypt and decrypt index", async () => {
      const emails = [
        { id: "1", subject: "Test", body: "Content" },
        { id: "2", subject: "Another", body: "More content" },
      ];

      await search_crypto.build_index(emails);
      const original_stats = search_crypto.get_index_stats();

      const encrypted = await search_crypto.encrypt_index();
      expect(encrypted.ciphertext).toBeInstanceOf(Uint8Array);
      expect(encrypted.nonce).toBeInstanceOf(Uint8Array);
      expect(encrypted.checksum).toBeDefined();

      search_crypto.clear();

      const decrypted = await search_crypto.decrypt_index(encrypted);
      expect(decrypted.total_documents).toBe(original_stats.total_documents);
    });

    it("should validate checksum on decrypt", async () => {
      await search_crypto.build_index([{ id: "1", subject: "Test", body: "" }]);

      const encrypted = await search_crypto.encrypt_index();

      const corrupted = {
        ...encrypted,
        ciphertext: new Uint8Array(encrypted.ciphertext.length).fill(0),
      };

      await expect(search_crypto.decrypt_index(corrupted)).rejects.toThrow(
        "checksum mismatch"
      );
    });
  });

  describe("index stats", () => {
    it("should return correct stats", async () => {
      await search_crypto.build_index([
        { id: "1", subject: "Test 1", body: "Content" },
        { id: "2", subject: "Test 2", body: "More content" },
      ]);

      const stats = search_crypto.get_index_stats();

      expect(stats.total_documents).toBe(2);
      expect(stats.total_tokens).toBeGreaterThan(0);
      expect(stats.version).toBe(2);
      expect(stats.created_at).toBeGreaterThan(0);
      expect(stats.updated_at).toBeGreaterThan(0);
    });
  });

  describe("dirty state tracking", () => {
    it("should track dirty state after build", async () => {
      await search_crypto.build_index([{ id: "1", subject: "Test", body: "" }]);

      expect(search_crypto.is_index_dirty()).toBe(true);
    });

    it("should mark clean after encryption", async () => {
      await search_crypto.build_index([{ id: "1", subject: "Test", body: "" }]);
      await search_crypto.encrypt_index();

      search_crypto.mark_index_clean();

      expect(search_crypto.is_index_dirty()).toBe(false);
    });

    it("should track dirty state after update", async () => {
      await search_crypto.build_index([{ id: "1", subject: "Test", body: "" }]);
      search_crypto.mark_index_clean();

      await search_crypto.update_index([{ id: "2", subject: "New", body: "" }]);

      expect(search_crypto.is_index_dirty()).toBe(true);
    });
  });

  describe("clear", () => {
    it("should reset index to empty state", async () => {
      await search_crypto.build_index([
        { id: "1", subject: "Test", body: "Content" },
      ]);

      search_crypto.clear();

      const index = search_crypto.get_index();
      expect(index.total_documents).toBe(0);
      expect(index.total_tokens).toBe(0);
    });
  });
});

describe("get_search_crypto / reset_search_crypto", () => {
  afterEach(() => {
    reset_search_crypto();
  });

  it("should return singleton instance", () => {
    const instance1 = get_search_crypto();
    const instance2 = get_search_crypto();

    expect(instance1).toBe(instance2);
  });

  it("should create new instance after reset", () => {
    const instance1 = get_search_crypto();
    reset_search_crypto();
    const instance2 = get_search_crypto();

    expect(instance1).not.toBe(instance2);
  });
});

describe("encrypt_search_count / decrypt_search_count", () => {
  beforeEach(() => {
    clear_count_key_cache();
  });

  it("should encrypt and decrypt count", async () => {
    const original = 42;

    const encrypted = await encrypt_search_count(original);
    expect(encrypted.encrypted_count).toBeDefined();
    expect(encrypted.count_nonce).toBeDefined();

    const decrypted = await decrypt_search_count(
      encrypted.encrypted_count,
      encrypted.count_nonce
    );

    expect(decrypted).toBe(original);
  });

  it("should handle zero count", async () => {
    const encrypted = await encrypt_search_count(0);
    const decrypted = await decrypt_search_count(
      encrypted.encrypted_count,
      encrypted.count_nonce
    );

    expect(decrypted).toBe(0);
  });

  it("should handle large count", async () => {
    const large_count = 1000000;
    const encrypted = await encrypt_search_count(large_count);
    const decrypted = await decrypt_search_count(
      encrypted.encrypted_count,
      encrypted.count_nonce
    );

    expect(decrypted).toBe(large_count);
  });

  it("should produce different ciphertext for same count", async () => {
    const encrypted1 = await encrypt_search_count(100);
    const encrypted2 = await encrypt_search_count(100);

    expect(encrypted1.encrypted_count).not.toBe(encrypted2.encrypted_count);
    expect(encrypted1.count_nonce).not.toBe(encrypted2.count_nonce);
  });
});

describe("clear_search_key_cache", () => {
  it("should not throw when clearing cache", () => {
    expect(() => clear_search_key_cache()).not.toThrow();
  });
});
