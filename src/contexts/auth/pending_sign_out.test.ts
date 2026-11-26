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

const calls = vi.hoisted(() => [] as string[]);

vi.mock("./purge_local_data", () => ({
  purge_all_local_data: vi.fn(async () => {
    calls.push("purge_all");

    return true;
  }),
}));
vi.mock("./signed_out_account_caches", () => ({
  clear_signed_out_account_caches: vi.fn(async (id: string) => {
    calls.push(`caches:${id}`);
  }),
}));
vi.mock("./session_passphrase", () => ({
  clear_stored_encrypted_vault: (id: string) => calls.push(`vault:${id}`),
  clear_session_passphrase: async (id: string) => {
    calls.push(`passphrase:${id}`);
  },
}));
vi.mock("@/services/api/client", () => ({
  api_client: {
    clear_dev_token: () => calls.push("dev_token"),
    clear_session_cookies: async () => {
      calls.push("cookies");

      return true;
    },
    clear_in_memory_token: () => calls.push("memory_token"),
  },
}));
vi.mock("@/services/crypto/memory_key_store", () => ({
  clear_vault_from_memory: () => calls.push("memory_vault"),
  on_vault_cleared: () => () => {},
  on_vault_stored: () => () => {},
}));
vi.mock("@/services/crypto/device_recovery_store", () => ({
  delete_user_device_snapshots: async (id: string) => {
    calls.push(`snapshots:${id}`);
  },
}));
vi.mock("@/services/category_index", () => ({
  delete_category_index_for_account: async (id: string) => {
    calls.push(`category_index:${id}`);
  },
}));
vi.mock("@/services/app_lock_store", () => ({
  clear_app_lock_config: (id: string) => calls.push(`app_lock:${id}`),
  clear_session_unlock: (id: string) => calls.push(`unlock:${id}`),
}));
vi.mock("@/services/session_timeout_service", () => ({
  stop_session_timeout: () => calls.push("stop_timeout"),
  clear_session_timeout_data: (id: string) => calls.push(`timeout:${id}`),
}));
vi.mock("@/services/account_manager", () => ({
  remove_account: async (id: string) => {
    calls.push(`remove:${id}`);

    return { removed: true, switched_to: null };
  },
  switch_account: async (id: string) => {
    calls.push(`switch:${id}`);

    return null;
  },
}));

import {
  PENDING_SIGN_OUT_KEY,
  clear_pending_sign_out,
  finish_pending_sign_out,
  mark_sign_out_pending,
  read_pending_sign_out,
  run_pending_sign_out,
} from "./pending_sign_out";
import { purge_all_local_data } from "./purge_local_data";

describe("pending sign-out", () => {
  beforeEach(() => {
    calls.length = 0;
    localStorage.clear();
    vi.mocked(purge_all_local_data).mockClear();
  });

  it("writes the marker synchronously", () => {
    mark_sign_out_pending({ kind: "all" });

    expect(localStorage.getItem(PENDING_SIGN_OUT_KEY)).not.toBeNull();
    expect(read_pending_sign_out()).toEqual({ kind: "all" });
  });

  it("round-trips a single account marker", () => {
    mark_sign_out_pending({
      kind: "account",
      account_id: "acct-a",
      survivor_id: "acct-b",
    });

    expect(read_pending_sign_out()).toEqual({
      kind: "account",
      account_id: "acct-a",
      survivor_id: "acct-b",
    });
  });

  it("treats an unreadable marker as a full wipe", () => {
    localStorage.setItem(PENDING_SIGN_OUT_KEY, "{not json");
    expect(read_pending_sign_out()).toEqual({ kind: "all" });

    localStorage.setItem(
      PENDING_SIGN_OUT_KEY,
      JSON.stringify({ kind: "account", account_id: "" }),
    );
    expect(read_pending_sign_out()).toEqual({ kind: "all" });
  });

  it("does nothing at startup without a marker", async () => {
    expect(await finish_pending_sign_out()).toBe(false);
    expect(purge_all_local_data).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it("finishes an interrupted full sign-out at startup", async () => {
    mark_sign_out_pending({ kind: "all" });

    expect(await finish_pending_sign_out()).toBe(true);
    expect(calls).toEqual(["purge_all"]);
    expect(localStorage.getItem(PENDING_SIGN_OUT_KEY)).toBeNull();
  });

  it("finishes an interrupted single account sign-out at startup", async () => {
    mark_sign_out_pending({
      kind: "account",
      account_id: "acct-a",
      survivor_id: "acct-b",
    });

    expect(await finish_pending_sign_out()).toBe(true);
    expect(purge_all_local_data).not.toHaveBeenCalled();
    expect(calls).toEqual(
      expect.arrayContaining([
        "caches:acct-a",
        "snapshots:acct-a",
        "category_index:acct-a",
        "vault:acct-a",
        "passphrase:acct-a",
        "timeout:acct-a",
        "app_lock:acct-a",
        "unlock:acct-a",
        "cookies",
        "remove:acct-a",
        "switch:acct-b",
      ]),
    );
    expect(calls.indexOf("remove:acct-a")).toBeLessThan(
      calls.indexOf("switch:acct-b"),
    );
    expect(localStorage.getItem(PENDING_SIGN_OUT_KEY)).toBeNull();
  });

  it("keeps the marker until the wipe has finished", async () => {
    let release: () => void = () => undefined;

    vi.mocked(purge_all_local_data).mockImplementationOnce(
      () =>
        new Promise<boolean>((resolve) => {
          release = () => resolve(true);
        }),
    );
    mark_sign_out_pending({ kind: "all" });

    const running = run_pending_sign_out({ kind: "all" });

    await Promise.resolve();
    expect(localStorage.getItem(PENDING_SIGN_OUT_KEY)).not.toBeNull();

    release();
    await running;
    expect(localStorage.getItem(PENDING_SIGN_OUT_KEY)).toBeNull();
  });

  it("clears the marker on request", () => {
    mark_sign_out_pending({ kind: "all" });
    clear_pending_sign_out();
    expect(read_pending_sign_out()).toBeNull();
  });
});
