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
import type { PreloadedEmail } from "./preload_cache";

import { describe, it, expect, beforeEach } from "vitest";

import { get_preload_cache, get_preloaded_email } from "./preload_cache";
import {
  await_preloaded_email,
  clear_preload_cache,
  get_preload_account_epoch,
  get_preload_email_font_stack,
  get_preload_email_zoom,
  get_preload_generation,
  get_preload_in_flight,
  mark_preload_stale,
  peek_preloaded_email,
  pop_preloaded_cid,
  pop_preloaded_thread_cid,
  set_preload_email_font_px,
  set_preload_email_font_stack,
} from "./preload_cache_store";

import { LOCKDOWN_CHANGED_EVENT } from "@/services/lockdown_store";
import {
  clear_vault_from_memory,
  get_vault_account_epoch,
} from "@/services/crypto/memory_key_store";
import {
  get_cached_iframe_height,
  set_cached_iframe_height,
} from "@/components/email/sandboxed_email_renderer";

function seed_entry(overrides: Record<string, unknown> = {}): void {
  get_preload_cache().set("email_1", {
    mail_item: { id: "email_1", thread_token: "thread_1" },
    thread_cid_resolved: new Map(),
    time: Date.now(),
    is_stale: false,
    conversation_grouping: true,
    vault_account_epoch: get_preload_account_epoch(),
    ...overrides,
  } as unknown as PreloadedEmail);
}

describe("preload cache store", () => {
  beforeEach(() => {
    clear_preload_cache();
  });

  it("clears entries the preloader cached", () => {
    seed_entry();

    clear_preload_cache();

    expect(get_preloaded_email("email_1")).toBeNull();
  });

  it("marks entries the preloader cached as stale", () => {
    seed_entry();

    mark_preload_stale("email_1");

    expect(get_preloaded_email("email_1")?.is_stale).toBe(true);
  });

  it("clears the cache when lockdown changes", () => {
    seed_entry();

    window.dispatchEvent(new CustomEvent(LOCKDOWN_CHANGED_EVENT));

    expect(get_preload_cache().size).toBe(0);
  });

  it("drops measured heights only when the email font changes", () => {
    set_preload_email_font_px(14);
    set_cached_iframe_height("email_1", 120);

    set_preload_email_font_px(14);
    expect(get_cached_iframe_height("email_1")).toBe(120);

    set_preload_email_font_px(16);
    expect(get_preload_email_zoom()).toBe("1.143");
    expect(get_cached_iframe_height("email_1")).toBeUndefined();

    set_cached_iframe_height("email_1", 120);
    set_preload_email_font_stack("serif");
    expect(get_preload_email_font_stack()).toBe("serif");
    expect(get_cached_iframe_height("email_1")).toBeUndefined();
  });
});

describe("preload cache account scope", () => {
  beforeEach(() => {
    clear_preload_cache();
  });

  it("drops every entry when the vault is cleared", () => {
    seed_entry({ current_user_email: "first@example.test" });

    clear_vault_from_memory();

    expect(get_preload_cache().size).toBe(0);
    expect(get_preloaded_email("email_1")).toBeNull();
  });

  it("keeps entries when the same account stores its vault again", () => {
    seed_entry({ current_user_email: "first@example.test" });

    clear_vault_from_memory({ keep_account_keys: true });

    expect(get_preloaded_email("email_1")).not.toBeNull();
  });

  it("moves to a new account epoch only when the account can change", () => {
    const before = get_vault_account_epoch();

    clear_vault_from_memory({ keep_account_keys: true });
    expect(get_vault_account_epoch()).toBe(before);

    clear_vault_from_memory();
    expect(get_vault_account_epoch()).toBe(before + 1);
  });

  it("invalidates preloads that are still running when it clears", () => {
    const before = get_preload_generation();

    get_preload_in_flight().set("email_1", Promise.resolve());

    clear_preload_cache();

    expect(get_preload_generation()).toBe(before + 1);
    expect(get_preload_in_flight().size).toBe(0);
  });

  it("invalidates running preloads when the vault is cleared", () => {
    const before = get_preload_generation();

    clear_vault_from_memory();

    expect(get_preload_generation()).toBeGreaterThan(before);
  });

  it("ignores and removes an entry cached for another account", () => {
    seed_entry({ current_user_email: "first@example.test" });

    expect(get_preloaded_email("email_1", "second@example.test")).toBeNull();
    expect(get_preload_cache().has("email_1")).toBe(false);
  });

  it("serves an entry to the account it was cached for", () => {
    seed_entry({ current_user_email: "First@Example.test" });

    expect(
      get_preloaded_email("email_1", " first@example.test "),
    ).not.toBeNull();
  });

  it("ignores an entry stamped with an earlier account epoch", () => {
    seed_entry({
      current_user_email: "first@example.test",
      vault_account_epoch: get_vault_account_epoch() - 1,
    });

    expect(peek_preloaded_email("email_1", "first@example.test")).toBeNull();
    expect(get_preload_cache().has("email_1")).toBe(false);
  });

  it("serves an entry stamped with the current account epoch", () => {
    seed_entry({
      current_user_email: "first@example.test",
      vault_account_epoch: get_vault_account_epoch(),
    });

    expect(
      peek_preloaded_email("email_1", "first@example.test"),
    ).not.toBeNull();
  });

  it("does not hand a waiting viewer another account's entry", async () => {
    seed_entry({ current_user_email: "first@example.test" });

    const result = await await_preloaded_email("email_1", undefined, {
      user_email: "second@example.test",
    });

    expect(result).toBeNull();
  });

  it("does not resolve inline images from an earlier account epoch", () => {
    seed_entry({
      vault_account_epoch: get_vault_account_epoch() - 1,
      cid_resolved: { html: "<p>body</p>", blob_urls: [] },
      thread_cid_resolved: new Map([
        ["message_1", { html: "<p>thread</p>", blob_urls: [] }],
      ]),
    });

    expect(pop_preloaded_thread_cid("message_1")).toBeNull();
    expect(pop_preloaded_cid("email_1")).toBeNull();
  });

  it("revokes inline image urls when the vault is cleared", () => {
    const revoked: string[] = [];
    const original = URL.revokeObjectURL;

    URL.revokeObjectURL = (url: string) => {
      revoked.push(url);
    };

    try {
      seed_entry({
        cid_resolved: { html: "", blob_urls: ["blob:body"] },
        thread_cid_resolved: new Map([
          ["message_1", { html: "", blob_urls: ["blob:thread"] }],
        ]),
      });

      clear_vault_from_memory();
    } finally {
      URL.revokeObjectURL = original;
    }

    expect(revoked).toEqual(
      expect.arrayContaining(["blob:body", "blob:thread"]),
    );
  });
});
