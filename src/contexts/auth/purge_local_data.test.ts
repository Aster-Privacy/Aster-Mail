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

const { stub_module, delete_device_recovery_database } = vi.hoisted(() => {
  const skip = (key: string | symbol) =>
    typeof key === "symbol" || key === "then";
  const callable = (): unknown =>
    new Proxy(() => undefined, {
      get: (_target, key) => (skip(key) ? undefined : callable()),
      apply: () => Promise.resolve(undefined),
    });
  const stub_module = () =>
    new Proxy(
      {},
      {
        get: (_target, key) => (skip(key) ? undefined : callable()),
        has: () => true,
      },
    );

  return {
    stub_module,
    delete_device_recovery_database: vi.fn(async () => undefined),
  };
});

vi.mock("./session_passphrase", () => stub_module());
vi.mock("./account_memory_stores", () => stub_module());
vi.mock("@/services/api/client", () => stub_module());
vi.mock("@/services/api/auth", () => stub_module());
vi.mock("@/lib/favicon_cache_db", () => stub_module());
vi.mock("@/lib/icon_cache", () => stub_module());
vi.mock("@/services/crypto/secure_storage", () => stub_module());
vi.mock("@/services/account_manager", () => stub_module());
vi.mock("@/services/secure_storage", () => stub_module());
vi.mock("@/services/session_timeout_service", () => stub_module());
vi.mock("@/services/sync_client", () => stub_module());
vi.mock("@/hooks/use_mail_stats", () => stub_module());
vi.mock("@/hooks/use_email_list", () => stub_module());
vi.mock("@/hooks/use_drafts_list", () => stub_module());
vi.mock("@/hooks/use_scheduled_emails", () => stub_module());
vi.mock("@/services/api/recovery_email", () => stub_module());
vi.mock("@/hooks/use_search", () => stub_module());
vi.mock("@/services/search/spelling", () => stub_module());
vi.mock("@/hooks/use_protected_folder", () => stub_module());
vi.mock("@/hooks/use_attachment_previews", () => stub_module());
vi.mock("@/services/attachment_preview_cache", () => stub_module());
vi.mock("@/services/app_lock_store", () => stub_module());
vi.mock("@/services/category_index", () => stub_module());
vi.mock("@/services/crypto/memory_key_store", () => stub_module());
vi.mock("@/services/crypto/ratchet_state_store", () => stub_module());
vi.mock("@/services/crypto/device_recovery_store", () => ({
  delete_device_recovery_database,
}));
vi.mock("@/services/crypto/inbound_attachment_keys", () => stub_module());
vi.mock("@/services/crypto/attachment_crypto", () => stub_module());
vi.mock("@/services/crypto/ratchet_plaintext_cache", () => stub_module());
vi.mock("@/services/crypto/message_escrow", () => stub_module());
vi.mock("@/services/translation/translation_cache", () => stub_module());
vi.mock("@/services/translation/language_detect", () => stub_module());
vi.mock("@/services/translation/engine_registry", () => stub_module());
vi.mock("@/stores/special_offer_status", () => stub_module());
vi.mock("@/stores/external_account_health_store", () => stub_module());
vi.mock("@/lib/ignore_error", () => stub_module());
vi.mock("@/lib/safe_storage", () => ({
  safe_local_keys: () => [],
  safe_local_remove: () => undefined,
}));
vi.mock("@/services/calendar/invite_answers", () => stub_module());
vi.mock("@/components/email/hooks/preload_cache_store", () => stub_module());
vi.mock("@/components/settings/billing/billing_cache", () => stub_module());
vi.mock(
  "@/components/settings/billing/family_section/family_cache",
  () => stub_module(),
);
vi.mock("@/services/calendar/sync_engine", () => stub_module());
vi.mock("@/services/calendar/sync_store", () => stub_module());

import { purge_all_local_data } from "./purge_local_data";

describe("purge_all_local_data device recovery", () => {
  beforeEach(() => {
    delete_device_recovery_database.mockReset();
    delete_device_recovery_database.mockResolvedValue(undefined);
  });

  it("deletes the device recovery database by default", async () => {
    await expect(purge_all_local_data()).resolves.toBe(true);
    expect(delete_device_recovery_database).toHaveBeenCalledTimes(1);
  });

  it("keeps device recovery when the caller asks for it", async () => {
    await expect(
      purge_all_local_data({ keep_device_recovery: true }),
    ).resolves.toBe(true);
    expect(delete_device_recovery_database).not.toHaveBeenCalled();
  });

  it("reports failure when the database cannot be deleted", async () => {
    delete_device_recovery_database.mockRejectedValueOnce(new Error("locked"));

    await expect(purge_all_local_data()).resolves.toBe(false);
  });
});
