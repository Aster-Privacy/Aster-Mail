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
import { describe, it, expect } from "vitest";

import {
  generate_recovery_phrase,
  normalize_recovery_phrase,
  is_valid_recovery_phrase,
  compute_phrase_verifier,
  wrap_vault_with_phrase,
  unwrap_vault_with_phrase,
  get_phrase_wordlist,
  RECOVERY_PHRASE_WORD_COUNT,
} from "./recovery_phrase";

describe("recovery_phrase", () => {
  it("generates a valid 12 word phrase", () => {
    const phrase = generate_recovery_phrase();
    const words = phrase.split(" ");

    expect(words).toHaveLength(RECOVERY_PHRASE_WORD_COUNT);
    expect(is_valid_recovery_phrase(phrase)).toBe(true);

    const wordlist = get_phrase_wordlist();

    for (const word of words) {
      expect(wordlist).toContain(word);
    }
  });

  it("generates distinct phrases", () => {
    const seen = new Set<string>();

    for (let i = 0; i < 20; i++) {
      seen.add(generate_recovery_phrase());
    }

    expect(seen.size).toBe(20);
  });

  it("normalizes case and whitespace", () => {
    const phrase = generate_recovery_phrase();
    const messy = "  " + phrase.toUpperCase().split(" ").join("   ") + "  ";

    expect(normalize_recovery_phrase(messy)).toBe(phrase);
    expect(is_valid_recovery_phrase(messy)).toBe(true);
  });

  it("rejects invalid phrases", () => {
    expect(is_valid_recovery_phrase("")).toBe(false);
    expect(is_valid_recovery_phrase("hello world")).toBe(false);
    expect(
      is_valid_recovery_phrase(
        "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon",
      ),
    ).toBe(false);

    const phrase = generate_recovery_phrase();
    const words = phrase.split(" ");

    expect(is_valid_recovery_phrase(words.slice(0, 11).join(" "))).toBe(false);

    const not_a_word = [...words];

    not_a_word[0] = "notabipword";

    expect(is_valid_recovery_phrase(not_a_word.join(" "))).toBe(false);
  });

  it("computes a deterministic verifier independent of formatting", async () => {
    const phrase = generate_recovery_phrase();

    const v1 = await compute_phrase_verifier(phrase);
    const v2 = await compute_phrase_verifier(
      "  " + phrase.toUpperCase() + "  ",
    );
    const v3 = await compute_phrase_verifier(generate_recovery_phrase());

    expect(v1).toBe(v2);
    expect(v1).not.toBe(v3);
    expect(atob(v1)).toHaveLength(32);
  });

  it("round trips a master key through wrap and unwrap", async () => {
    const phrase = generate_recovery_phrase();
    const vault_json = JSON.stringify({
      identity_key: "old-identity",
      data_kek: btoa("master-key-material-32-bytes-xx!"),
      legacy_keks: [{ k: "abc", added_at: "2026-01-01" }],
    });

    const wrap = await wrap_vault_with_phrase(vault_json, phrase);

    expect(atob(wrap.verifier_hash)).toHaveLength(32);
    expect(atob(wrap.wrap_nonce)).toHaveLength(12);
    expect(atob(wrap.wrap_salt)).toHaveLength(32);

    const unwrapped = await unwrap_vault_with_phrase(
      phrase,
      wrap.wrapped_vault,
      wrap.wrap_nonce,
      wrap.wrap_salt,
    );

    expect(unwrapped).toBe(vault_json);
  });

  it("unwrap tolerates formatting differences in the phrase", async () => {
    const phrase = generate_recovery_phrase();
    const vault_json = JSON.stringify({ identity_key: "id", data_kek: "k" });

    const wrap = await wrap_vault_with_phrase(vault_json, phrase);

    const unwrapped = await unwrap_vault_with_phrase(
      phrase.toUpperCase() + " ",
      wrap.wrapped_vault,
      wrap.wrap_nonce,
      wrap.wrap_salt,
    );

    expect(unwrapped).toBe(vault_json);
  });

  it("fails to unwrap with the wrong phrase", async () => {
    const phrase = generate_recovery_phrase();
    const wrong = generate_recovery_phrase();
    const vault_json = JSON.stringify({ identity_key: "id" });

    const wrap = await wrap_vault_with_phrase(vault_json, phrase);

    const unwrapped = await unwrap_vault_with_phrase(
      wrong,
      wrap.wrapped_vault,
      wrap.wrap_nonce,
      wrap.wrap_salt,
    );

    expect(unwrapped).toBeNull();
  });

  it("produces unique salts and nonces per wrap", async () => {
    const phrase = generate_recovery_phrase();
    const vault_json = JSON.stringify({ identity_key: "id", data_kek: "k" });

    const w1 = await wrap_vault_with_phrase(vault_json, phrase);
    const w2 = await wrap_vault_with_phrase(vault_json, phrase);

    expect(w1.wrap_salt).not.toBe(w2.wrap_salt);
    expect(w1.wrap_nonce).not.toBe(w2.wrap_nonce);
    expect(w1.wrapped_vault).not.toBe(w2.wrapped_vault);
    expect(w1.verifier_hash).toBe(w2.verifier_hash);
  });
});
