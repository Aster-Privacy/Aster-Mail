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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const wipe = vi.hoisted(() => {
  const calls: string[] = [];
  const behavior = new Map<string, (...args: unknown[]) => unknown>();
  const step =
    (name: string) =>
    (...args: unknown[]): unknown => {
      calls.push(name);

      return behavior.get(name)?.(...args);
    };

  return { calls, behavior, step };
});

vi.mock("@/contexts/auth/session_passphrase", () => ({
  clear_all_session_passphrases: wipe.step("clear_all_session_passphrases"),
}));

vi.mock("@/contexts/auth/account_memory_stores", () => ({
  clear_account_memory_stores: wipe.step("clear_account_memory_stores"),
}));

vi.mock("@/contexts/auth/local_data_registry", () => ({
  erase_device_traces: wipe.step("erase_device_traces"),
  erase_local_storage_traces: wipe.step("erase_local_storage_traces"),
  erase_session_storage_traces: wipe.step("erase_session_storage_traces"),
}));

vi.mock("@/services/api/auth", () => ({
  logout_user: wipe.step("logout_user"),
}));

vi.mock("@/lib/favicon_cache_db", () => ({
  purge_favicon_cache: wipe.step("purge_favicon_cache"),
}));

vi.mock("@/lib/icon_cache", () => ({
  clear_icon_cache: wipe.step("clear_icon_cache"),
}));

vi.mock("@/services/crypto/secure_storage", () => ({
  wipe_all_storage: wipe.step("wipe_all_storage"),
}));

vi.mock("@/services/account_manager", () => ({
  logout_all: wipe.step("logout_all"),
  clear_cache: wipe.step("clear_cache"),
  clear_all_switch_tokens: wipe.step("clear_all_switch_tokens"),
  get_current_account: wipe.step("get_current_account"),
}));

vi.mock("@/services/secure_storage", () => ({
  clear_session: wipe.step("clear_session"),
  clear_all_session_data: wipe.step("clear_all_session_data"),
}));

vi.mock("@/services/session_timeout_service", () => ({
  stop_session_timeout: wipe.step("stop_session_timeout"),
}));

vi.mock("@/hooks/use_mail_stats", () => ({
  clear_mail_stats: wipe.step("clear_mail_stats"),
}));

vi.mock("@/hooks/use_email_list", () => ({
  clear_mail_cache: wipe.step("clear_mail_cache"),
}));

vi.mock("@/hooks/use_drafts_list", () => ({
  clear_drafts_cache: wipe.step("clear_drafts_cache"),
}));

vi.mock("@/hooks/use_scheduled_emails", () => ({
  clear_scheduled_cache: wipe.step("clear_scheduled_cache"),
}));

vi.mock("@/services/api/recovery_email", () => ({
  clear_recovery_email_cache: wipe.step("clear_recovery_email_cache"),
}));

vi.mock("@/hooks/use_search", () => ({
  clear_search_index: wipe.step("clear_search_index"),
}));

vi.mock("@/services/search/spelling", () => ({
  clear_never_correct_terms: wipe.step("clear_never_correct_terms"),
}));

vi.mock("@/hooks/use_protected_folder", () => ({
  lock_all_folders: wipe.step("lock_all_folders"),
}));

vi.mock("@/hooks/use_attachment_previews", () => ({
  clear_attachment_preview_cache: wipe.step("clear_attachment_preview_cache"),
}));

vi.mock("@/services/attachment_preview_cache", () => ({
  clear_attachment_preview_cache: wipe.step("clear_attachment_preview_cache"),
}));

vi.mock("@/services/app_lock_store", () => ({
  clear_all_app_lock_data: wipe.step("clear_all_app_lock_data"),
}));

vi.mock("@/services/category_index", () => ({
  clear_category_index: wipe.step("clear_category_index"),
}));

vi.mock("@/services/crypto/memory_key_store", () => ({
  clear_vault_from_memory: wipe.step("clear_vault_from_memory"),
}));

vi.mock("@/services/crypto/ratchet_state_store", () => ({
  clear_all_ratchet_states: wipe.step("clear_all_ratchet_states"),
}));

vi.mock("@/services/crypto/inbound_attachment_keys", () => ({
  clear_attachment_keys: wipe.step("clear_attachment_keys"),
}));

vi.mock("@/services/crypto/attachment_crypto", () => ({
  clear_unreadable_attachment_rows: wipe.step("clear_unreadable_attachment_rows"),
}));

vi.mock("@/services/crypto/ratchet_plaintext_cache", () => ({
  clear_plaintext_cache: wipe.step("clear_plaintext_cache"),
}));

vi.mock("@/services/crypto/message_escrow", () => ({
  clear_escrow_miss_cache: wipe.step("clear_escrow_miss_cache"),
}));

vi.mock("@/services/translation/translation_cache", () => ({
  clear_translation_cache: wipe.step("clear_translation_cache"),
}));

vi.mock("@/services/translation/language_detect", () => ({
  clear_detection_cache: wipe.step("clear_detection_cache"),
}));

vi.mock("@/services/translation/engine_registry", () => ({
  release_engines: wipe.step("release_engines"),
}));

vi.mock("@/stores/special_offer_status", () => ({
  reset_special_offer_status: wipe.step("reset_special_offer_status"),
}));

vi.mock("@/stores/external_account_health_store", () => ({
  forget_external_account_problems: wipe.step("forget_external_account_problems"),
}));

vi.mock("@/components/email/hooks/preload_cache_store", () => ({
  clear_preload_cache: wipe.step("clear_preload_cache"),
}));

vi.mock("@/components/settings/billing/billing_cache", () => ({
  clear_billing_cache: wipe.step("clear_billing_cache"),
}));

vi.mock("@/components/settings/billing/family_section/family_cache", () => ({
  clear_family_cache: wipe.step("clear_family_cache"),
}));

vi.mock("@/native/desktop_device_auth", () => ({
  revoke_paired_device: wipe.step("revoke_paired_device"),
  erase_device_pairing: wipe.step("erase_device_pairing"),
}));

vi.mock("@/services/push_subscription", () => ({
  unsubscribe_from_push: wipe.step("unsubscribe_from_push"),
}));

vi.mock("@/services/calendar/sync_engine", () => ({
  clear_calendar_sync_state: wipe.step("clear_calendar_sync_state"),
}));

vi.mock("@/services/calendar/sync_store", () => ({
  clear_calendar_sync_cache: wipe.step("clear_calendar_sync_cache"),
}));

vi.mock("@/services/api/client", () => ({
  api_client: {
    set_expected_user_id: wipe.step("set_expected_user_id"),
    begin_intentional_logout: wipe.step("begin_intentional_logout"),
    clear_auth_data: wipe.step("clear_auth_data"),
    clear_session_cookies: wipe.step("clear_session_cookies"),
  },
}));

vi.mock("@/services/sync_client", () => ({
  sync_client: { disconnect: wipe.step("sync_disconnect") },
}));

vi.mock("@/services/calendar/invite_answers", () => ({
  INVITE_ANSWER_PREFIX: "aster:invite_answer:",
}));

vi.mock("@/lib/device_erase_latch", () => ({
  announce_device_erase: (signal: string) => {
    wipe.calls.push(`announce:${signal}`);
  },
}));

type Purge = typeof import("./purge_local_data");

const CLEAN_TRACES = {
  complete: true,
  failed_databases: [],
  blocked_databases: [],
  failed_caches: [],
  failed_session: [],
  failed_local: [],
};

async function load(): Promise<Purge> {
  vi.resetModules();

  return import("./purge_local_data");
}

function count(name: string): number {
  return wipe.calls.filter((call) => call === name).length;
}

function position(name: string): number {
  return wipe.calls.indexOf(name);
}

describe("erasing this device", () => {
  beforeEach(() => {
    wipe.calls.length = 0;
    wipe.behavior.clear();
    wipe.behavior.set("erase_device_traces", async () => CLEAN_TRACES);
    wipe.behavior.set("erase_session_storage_traces", () => []);
    wipe.behavior.set("erase_local_storage_traces", () => []);
    wipe.behavior.set("get_current_account", async () => null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("tells other tabs and drops secrets before anything is awaited", async () => {
    const purge = await load();
    const outcome = purge.erase_device_data();

    expect(wipe.calls[0]).toBe("announce:begin");
    expect(wipe.calls).toContain("clear_vault_from_memory");
    expect(wipe.calls).toContain("begin_intentional_logout");
    expect(wipe.calls).not.toContain("logout_all");

    expect((await outcome).complete).toBe(true);
    expect(position("erase_device_traces")).toBeGreaterThan(-1);
    expect(position("clear_auth_data")).toBeGreaterThan(
      position("erase_device_traces"),
    );
    expect(wipe.calls[wipe.calls.length - 1]).toBe("announce:end");
  });

  it("finishes the local wipe while the sign-out request never answers", async () => {
    wipe.behavior.set("logout_user", () => new Promise(() => undefined));

    const purge = await load();
    const started = Date.now();
    let settled = false;
    const outcome = purge.erase_device_data();

    void outcome.then(() => {
      settled = true;
    });

    await vi.waitFor(
      () => {
        expect(wipe.calls).toContain("logout_user");
        expect(wipe.calls).toContain("erase_device_traces");
      },
      { timeout: 1500, interval: 10 },
    );

    expect(Date.now() - started).toBeLessThan(1500);
    expect(wipe.calls).toContain("logout_all");
    expect(wipe.calls).toContain("wipe_all_storage");
    expect(wipe.calls).toContain("clear_category_index");
    expect(settled).toBe(false);
    expect(wipe.calls).not.toContain("clear_auth_data");

    expect((await outcome).complete).toBe(true);
    expect(Date.now() - started).toBeLessThan(4500);
    expect(wipe.calls).toContain("clear_auth_data");
    expect(count("logout_user")).toBe(1);
  }, 10000);

  it("does not let a failing device revoke stop the wipe", async () => {
    wipe.behavior.set("revoke_paired_device", async () => {
      throw new Error("offline");
    });

    const purge = await load();
    const outcome = await purge.erase_device_data();

    expect(outcome.complete).toBe(true);
    expect(wipe.calls).toContain("erase_device_traces");
  });

  it("repeats only what failed and sends nothing again on a retry", async () => {
    const stuck = { ...CLEAN_TRACES, complete: false, failed_databases: ["x"] };
    let attempts = 0;

    wipe.behavior.set("wipe_all_storage", async () => {
      attempts += 1;
      if (attempts === 1) throw new Error("busy");
    });
    wipe.behavior.set("erase_device_traces", async (previous) =>
      previous ? CLEAN_TRACES : stuck,
    );

    const purge = await load();
    const first = await purge.erase_device_data();

    expect(first.complete).toBe(false);
    expect(first.failed_steps).toEqual(["secure_storage"]);
    expect(first.traces?.failed_databases).toEqual(["x"]);

    wipe.calls.length = 0;

    const retried = await purge.erase_device_data(first);

    expect(retried.complete).toBe(true);
    expect(retried.failed_steps).toEqual([]);
    expect(count("wipe_all_storage")).toBe(1);
    expect(count("erase_device_traces")).toBe(1);
    expect(wipe.calls).not.toContain("logout_all");
    expect(wipe.calls).not.toContain("clear_category_index");
    expect(wipe.calls).not.toContain("clear_search_index");
    expect(wipe.calls).not.toContain("erase_device_pairing");
    expect(wipe.calls).not.toContain("logout_user");
    expect(wipe.calls).not.toContain("revoke_paired_device");
    expect(wipe.calls).not.toContain("unsubscribe_from_push");
    expect(wipe.calls).not.toContain("announce:begin");
  });

  it("skips the trace erase on a retry once it was complete", async () => {
    wipe.behavior.set("clear_category_index", async () => {
      throw new Error("busy");
    });

    const purge = await load();
    const first = await purge.erase_device_data();

    expect(first.failed_steps).toEqual(["category_index"]);
    wipe.calls.length = 0;
    wipe.behavior.delete("clear_category_index");

    expect((await purge.erase_device_data(first)).complete).toBe(true);
    expect(count("clear_category_index")).toBe(1);
    expect(wipe.calls).not.toContain("erase_device_traces");
  });

  it("retries once and reports what is left", async () => {
    wipe.behavior.set("wipe_all_storage", async () => {
      throw new Error("busy");
    });

    const purge = await load();

    expect(await purge.erase_device_with_retry()).toBe(false);
    expect(count("wipe_all_storage")).toBe(2);
    expect(count("logout_user")).toBe(1);
  });
});

describe("a tab told that another tab erased this device", () => {
  beforeEach(() => {
    wipe.calls.length = 0;
    wipe.behavior.clear();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("drops its secrets at once and leaves when the wipe ends", async () => {
    const purge = await load();
    const leave = vi.fn();

    purge.follow_device_erase("begin", leave);

    expect(wipe.calls).toContain("clear_vault_from_memory");
    expect(wipe.calls).toContain("clear_auth_data");
    expect(leave).not.toHaveBeenCalled();

    purge.follow_device_erase("end", leave);
    purge.follow_device_erase("end", leave);
    vi.advanceTimersByTime(10000);

    expect(leave).toHaveBeenCalledTimes(1);
  });

  it("writes nothing and calls nothing remote", async () => {
    const purge = await load();

    purge.follow_device_erase("begin", vi.fn());
    purge.follow_device_erase("end", vi.fn());

    for (const name of [
      "logout_user",
      "logout_all",
      "wipe_all_storage",
      "erase_device_traces",
      "clear_session_cookies",
      "revoke_paired_device",
      "announce:begin",
      "announce:end",
    ]) {
      expect(wipe.calls).not.toContain(name);
    }
  });

  it("leaves by itself when the end never arrives", async () => {
    const purge = await load();
    const leave = vi.fn();

    purge.follow_device_erase("begin", leave);
    purge.follow_device_erase("begin", leave);
    vi.advanceTimersByTime(5900);

    expect(leave).not.toHaveBeenCalled();

    vi.advanceTimersByTime(200);

    expect(leave).toHaveBeenCalledTimes(1);
    expect(count("clear_vault_from_memory")).toBe(1);
  });

  it("still leaves when dropping secrets throws", async () => {
    wipe.behavior.set("clear_vault_from_memory", () => {
      throw new Error("broken");
    });

    const purge = await load();
    const leave = vi.fn();

    purge.follow_device_erase("begin", leave);
    purge.follow_device_erase("end", leave);

    expect(leave).toHaveBeenCalledTimes(1);
  });
});

describe("an ordinary sign-out", () => {
  beforeEach(() => {
    wipe.calls.length = 0;
    wipe.behavior.clear();
  });

  it("signs out on the server first and never announces an erase", async () => {
    const purge = await load();

    expect(await purge.purge_all_local_data()).toBe(true);

    expect(position("logout_user")).toBeGreaterThan(-1);
    expect(position("logout_user")).toBeLessThan(position("logout_all"));
    expect(position("clear_auth_data")).toBeGreaterThan(
      position("clear_category_index"),
    );
    expect(position("clear_session_cookies")).toBeGreaterThan(
      position("clear_auth_data"),
    );
    expect(wipe.calls).not.toContain("announce:begin");
    expect(wipe.calls).not.toContain("announce:end");
    expect(wipe.calls).not.toContain("erase_device_traces");
    expect(wipe.calls).not.toContain("revoke_paired_device");
    expect(wipe.calls).not.toContain("erase_device_pairing");
  });
});
