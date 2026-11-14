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
import { clear_all_session_passphrases } from "./session_passphrase";
import { clear_account_memory_stores } from "./account_memory_stores";
import {
  erase_device_traces,
  erase_local_storage_traces,
  erase_session_storage_traces,
  type DeviceTraceReport,
} from "./local_data_registry";

import { api_client } from "@/services/api/client";
import { logout_user } from "@/services/api/auth";
import { purge_favicon_cache } from "@/lib/favicon_cache_db";
import { clear_icon_cache } from "@/lib/icon_cache";
import { wipe_all_storage } from "@/services/crypto/secure_storage";
import {
  logout_all as storage_logout_all,
  clear_cache,
  clear_all_switch_tokens,
  get_current_account,
} from "@/services/account_manager";
import {
  clear_session,
  clear_all_session_data,
} from "@/services/secure_storage";
import { stop_session_timeout } from "@/services/session_timeout_service";
import { sync_client } from "@/services/sync_client";
import { clear_mail_stats } from "@/hooks/use_mail_stats";
import { clear_mail_cache } from "@/hooks/use_email_list";
import { clear_drafts_cache } from "@/hooks/use_drafts_list";
import { clear_scheduled_cache } from "@/hooks/use_scheduled_emails";
import { clear_recovery_email_cache } from "@/services/api/recovery_email";
import { clear_search_index } from "@/hooks/use_search";
import { clear_never_correct_terms } from "@/services/search/spelling";
import { lock_all_folders } from "@/hooks/use_protected_folder";
import { clear_attachment_preview_cache } from "@/hooks/use_attachment_previews";
import { clear_attachment_preview_cache as revoke_attachment_preview_blobs } from "@/services/attachment_preview_cache";
import { clear_all_app_lock_data } from "@/services/app_lock_store";
import { clear_category_index } from "@/services/category_index";
import { clear_vault_from_memory } from "@/services/crypto/memory_key_store";
import { clear_all_ratchet_states } from "@/services/crypto/ratchet_state_store";
import { delete_device_recovery_database } from "@/services/crypto/device_recovery_store";
import { clear_attachment_keys } from "@/services/crypto/inbound_attachment_keys";
import { clear_unreadable_attachment_rows } from "@/services/crypto/attachment_crypto";
import { clear_plaintext_cache } from "@/services/crypto/ratchet_plaintext_cache";
import { clear_escrow_miss_cache } from "@/services/crypto/message_escrow";
import { clear_translation_cache } from "@/services/translation/translation_cache";
import { clear_detection_cache } from "@/services/translation/language_detect";
import { release_engines } from "@/services/translation/engine_registry";
import { reset_special_offer_status } from "@/stores/special_offer_status";
import { forget_external_account_problems } from "@/stores/external_account_health_store";
import { ignore_error } from "@/lib/ignore_error";
import {
  announce_device_erase,
  type DeviceEraseSignal,
} from "@/lib/device_erase_latch";
import { safe_local_keys, safe_local_remove } from "@/lib/safe_storage";
import { INVITE_ANSWER_PREFIX } from "@/services/calendar/invite_answers";
import { clear_preload_cache } from "@/components/email/hooks/preload_cache_store";
import { clear_billing_cache } from "@/components/settings/billing/billing_cache";
import { clear_family_cache } from "@/components/settings/billing/family_section/family_cache";

export interface PurgeLocalDataOptions {
  erase_device_traces?: boolean;
  keep_device_recovery?: boolean;
}

export type PurgeOptions = PurgeLocalDataOptions;

export interface DeviceEraseOutcome {
  complete: boolean;
  failed_steps: string[];
  traces: DeviceTraceReport | null;
}

type WipeStep = readonly [name: string, run: () => unknown];

const DEVICE_ID_CAPTURE_TIMEOUT_MS = 300;
const DEVICE_RELEASE_TIMEOUT_MS = 1500;
const REMOTE_RELEASE_TIMEOUT_MS = 3000;
const ERASED_TAB_LEAVE_TIMEOUT_MS = 6000;
const LOCAL_CACHES_STEP = "local_caches";
const DEVICE_PAIRING_STEP = "device_pairing";
const DEVICE_TRACES_STEP = "device_traces";

const STORAGE_STEPS: readonly WipeStep[] = [
  ["account_storage", () => storage_logout_all()],
  ["secure_storage", () => wipe_all_storage()],
];

const STORE_STEPS: readonly WipeStep[] = [
  ["category_index", () => clear_category_index()],
  ["ratchet_states", () => clear_all_ratchet_states()],
  ["plaintext_cache", () => clear_plaintext_cache()],
  ["session_data", () => clear_all_session_data()],
];

const DEVICE_RECOVERY_STEPS: readonly WipeStep[] = [
  ["device_recovery", () => delete_device_recovery_database()],
];

const SESSION_COOKIE_STEPS: readonly WipeStep[] = [
  ["session_cookies", () => api_client.clear_session_cookies()],
];

const FINAL_STEPS: readonly WipeStep[] = [
  ["session_passphrases", () => clear_all_session_passphrases()],
  ["icon_cache", () => clear_icon_cache()],
  ["favicon_cache", () => purge_favicon_cache()],
];

function settle_within<T>(task: Promise<T>, ms: number): Promise<T | null> {
  return new Promise<T | null>((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);

    task
      .then(
        (value) => value,
        () => null,
      )
      .then((value) => {
        clearTimeout(timer);
        resolve(value);
      });
  });
}

function note_failure(step: string, caught: unknown): void {
  if (import.meta.env.DEV) {
    console.error("purge_all_local_data:", step, caught);
  }
}

async function run_steps(
  steps: readonly WipeStep[],
  failed: string[],
  only?: ReadonlySet<string>,
): Promise<void> {
  for (const [name, run] of steps) {
    if (only && !only.has(name)) continue;
    try {
      await run();
    } catch (caught) {
      failed.push(name);
      note_failure(name, caught);
    }
  }
}

export function drop_memory_secrets(): void {
  stop_session_timeout();
  lock_all_folders();

  sync_client.disconnect();
  clear_vault_from_memory();
  clear_preload_cache();
  clear_account_memory_stores();
  forget_external_account_problems();
  clear_escrow_miss_cache();
  reset_special_offer_status();
  api_client.set_expected_user_id(null);
}

async function clear_local_caches(): Promise<void> {
  clear_all_app_lock_data();
  for (const key of safe_local_keys()) {
    if (
      key.startsWith("aster:lockdown:") ||
      key === "pq_prekey_missing" ||
      key.startsWith("astermail_pq_self_heal_at_") ||
      key.startsWith("astermail_pq_self_heal_keys_") ||
      key.startsWith("astermail_pq_reconciler_at_") ||
      key.startsWith(INVITE_ANSWER_PREFIX)
    ) {
      safe_local_remove(key);
    }
  }
  clear_cache();
  clear_mail_stats();
  await clear_mail_cache();
  await import("@/services/calendar/sync_engine")
    .then((module) => module.clear_calendar_sync_state())
    .catch(() => undefined);
  await import("@/services/calendar/sync_store")
    .then((module) => module.clear_calendar_sync_cache())
    .catch(() => undefined);
  clear_drafts_cache();
  clear_scheduled_cache();
  clear_recovery_email_cache();
  clear_billing_cache();
  clear_family_cache();
  clear_search_index();
  clear_never_correct_terms();
  clear_session();
  clear_all_switch_tokens();
  clear_attachment_keys();
  clear_unreadable_attachment_rows();
  clear_attachment_preview_cache();
  revoke_attachment_preview_blobs();
  clear_translation_cache();
  clear_detection_cache();
  release_engines();
}

async function sign_out_locally(
  keep_device_recovery: boolean,
): Promise<boolean> {
  const failed: string[] = [];

  drop_memory_secrets();

  api_client.begin_intentional_logout();
  try {
    await logout_user();
  } catch (caught) {
    ignore_error("contexts/auth/purge_local_data:purge_all_local_data", caught);
  }

  await run_steps(STORAGE_STEPS, failed);
  await clear_local_caches();
  await run_steps(STORE_STEPS, failed);
  if (!keep_device_recovery) {
    await run_steps(DEVICE_RECOVERY_STEPS, failed);
  }

  api_client.clear_auth_data();
  await run_steps(SESSION_COOKIE_STEPS, failed);
  await run_steps(FINAL_STEPS, failed);

  return failed.length === 0;
}

function runs_in_desktop_shell(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function capture_paired_device_id(): Promise<string | null> {
  if (!runs_in_desktop_shell()) return null;

  const current = await settle_within(
    get_current_account(),
    DEVICE_ID_CAPTURE_TIMEOUT_MS,
  );

  return current?.device_id ?? null;
}

async function release_remote_session(
  device_id: string | null,
): Promise<void> {
  await settle_within(
    Promise.all([
      import("@/native/desktop_device_auth").then((module) =>
        module.revoke_paired_device([device_id]),
      ),
      import("@/services/push_subscription").then((module) =>
        module.unsubscribe_from_push(),
      ),
    ]),
    DEVICE_RELEASE_TIMEOUT_MS,
  );

  try {
    await logout_user();
  } catch (caught) {
    ignore_error("contexts/auth/purge_local_data:release_remote_session", caught);
  }

  await api_client.clear_session_cookies();
}

function sweep_storage(traces: DeviceTraceReport): DeviceTraceReport {
  const failed_session = erase_session_storage_traces();
  const failed_local = erase_local_storage_traces();

  return {
    ...traces,
    failed_session,
    failed_local,
    complete:
      traces.failed_databases.length === 0 &&
      traces.blocked_databases.length === 0 &&
      traces.failed_caches.length === 0 &&
      failed_session.length === 0 &&
      failed_local.length === 0,
  };
}

export async function erase_device_data(
  previous?: DeviceEraseOutcome,
): Promise<DeviceEraseOutcome> {
  const failed: string[] = [];
  const only = previous ? new Set(previous.failed_steps) : undefined;
  let remote: Promise<unknown> | null = null;

  if (!previous) {
    announce_device_erase("begin");
    drop_memory_secrets();
    api_client.begin_intentional_logout();
    const captured = capture_paired_device_id();

    remote = settle_within(
      captured.then(release_remote_session),
      REMOTE_RELEASE_TIMEOUT_MS,
    );
    await captured;
  }

  await run_steps(STORAGE_STEPS, failed, only);
  await run_steps([[LOCAL_CACHES_STEP, clear_local_caches]], failed, only);
  await run_steps(STORE_STEPS, failed, only);
  await run_steps(FINAL_STEPS, failed, only);

  let traces: DeviceTraceReport | null = previous?.traces ?? null;

  if (!traces || !traces.complete) {
    try {
      traces = await erase_device_traces(traces ?? undefined);
    } catch (caught) {
      note_failure(DEVICE_TRACES_STEP, caught);
    }
  }

  if (remote) await remote;
  api_client.clear_auth_data();

  await run_steps(
    [
      [
        DEVICE_PAIRING_STEP,
        async () => {
          const { erase_device_pairing } =
            await import("@/native/desktop_device_auth");

          await erase_device_pairing();
        },
      ],
    ],
    failed,
    only,
  );

  if (traces) traces = sweep_storage(traces);
  announce_device_erase("end");

  return {
    complete: failed.length === 0 && traces !== null && traces.complete,
    failed_steps: failed,
    traces,
  };
}

export async function erase_device_with_retry(): Promise<boolean> {
  const first = await erase_device_data();

  if (first.complete) return true;

  return (await erase_device_data(first)).complete;
}

let erased_tab_leave_timer: ReturnType<typeof setTimeout> | null = null;
let erased_tab_left = false;

export function follow_device_erase(
  signal: DeviceEraseSignal,
  leave: () => void = () => window.location.replace("/"),
): void {
  const leave_once = (): void => {
    if (erased_tab_left) return;
    erased_tab_left = true;
    if (erased_tab_leave_timer) clearTimeout(erased_tab_leave_timer);
    leave();
  };

  if (signal === "end") {
    leave_once();

    return;
  }
  if (erased_tab_leave_timer || erased_tab_left) return;
  erased_tab_leave_timer = setTimeout(leave_once, ERASED_TAB_LEAVE_TIMEOUT_MS);
  try {
    drop_memory_secrets();
    api_client.begin_intentional_logout();
    api_client.clear_auth_data();
  } catch (caught) {
    ignore_error("contexts/auth/purge_local_data:follow_device_erase", caught);
  }
}

export async function purge_all_local_data(
  options: PurgeLocalDataOptions = {},
): Promise<boolean> {
  if (options.erase_device_traces) return (await erase_device_data()).complete;

  return sign_out_locally(options.keep_device_recovery === true);
}
