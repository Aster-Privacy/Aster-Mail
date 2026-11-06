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
import type { EncryptedVault } from "../key_manager";
import type { ResealKeyOptions } from "./reseal_keys";
import type {
  ProgressStore,
  ResealApi,
  ResealProgress,
  ResealStep,
  ResealStepContext,
  StepCounts,
} from "./reseal_io";
import type { StorageRekeyFinish } from "./vault_step";

import { build_reseal_keys } from "./reseal_keys";
import { ResealInterrupted, default_sleep, empty_counts } from "./reseal_io";
import {
  allowed_senders_step,
  blocked_senders_step,
  contact_groups_step,
  contacts_step,
  external_accounts_step,
  recent_recipients_step,
} from "./steps_lists";
import {
  aliases_step,
  deleted_aliases_step,
  domain_addresses_step,
  ghost_aliases_step,
} from "./steps_addresses";
import {
  alias_directories_step,
  alias_items_step,
  contact_extras_step,
  contact_field_definitions_step,
  profile_notes_step,
  ratchet_states_step,
  signatures_step,
  sync_sources_step,
  templates_step,
  deleted_alias_directories_step,
} from "./steps_categories";
import { escrow_step } from "./steps_escrow";
import { mail_metadata_step } from "./steps_mail_metadata";

export const DEFAULT_RESEAL_STEPS: ResealStep[] = [
  ratchet_states_step,
  aliases_step,
  domain_addresses_step,
  deleted_aliases_step,
  ghost_aliases_step,
  alias_directories_step,
  deleted_alias_directories_step,
  alias_items_step,
  contacts_step,
  contact_groups_step,
  contact_field_definitions_step,
  contact_extras_step,
  blocked_senders_step,
  allowed_senders_step,
  recent_recipients_step,
  profile_notes_step,
  external_accounts_step,
  signatures_step,
  templates_step,
  sync_sources_step,
  mail_metadata_step,
  escrow_step,
];

export type ResealRunStatus =
  | "not_needed"
  | "done"
  | "interrupted"
  | "superseded"
  | "failed";

export interface ResealRunResult {
  status: ResealRunStatus;
  counts: StepCounts;
  reason?: string;
  incomplete?: string[];
}

export interface ResealRunOptions {
  vault: Pick<
    EncryptedVault,
    "data_kek" | "legacy_keks" | "storage_rekey" | "data_kek_random"
  >;
  api: ResealApi;
  store: ProgressStore;
  finish(expected_data_kek: string): Promise<StorageRekeyFinish>;
  still_current?: () => Promise<boolean>;
  sleep?: (ms: number) => Promise<void>;
  is_cancelled?: () => boolean;
  steps?: ResealStep[];
  key_options?: ResealKeyOptions;
}

function fresh_progress(key_id: string): ResealProgress {
  return { key_id, steps: {}, hash_moves: [] };
}

export function needs_storage_reseal(
  vault: Pick<EncryptedVault, "data_kek_random" | "storage_rekey"> | null,
): boolean {
  return vault?.data_kek_random === true && vault.storage_rekey?.state === "pending";
}

export async function run_storage_reseal(
  options: ResealRunOptions,
): Promise<ResealRunResult> {
  const counts = empty_counts();

  if (!needs_storage_reseal(options.vault) || !options.vault.data_kek) {
    return { status: "not_needed", counts };
  }

  const keys = await build_reseal_keys(options.vault, options.key_options);

  if (!keys) return { status: "failed", counts, reason: "keys_unavailable" };

  try {
    const stored = options.store.load();
    const progress =
      stored && stored.key_id === keys.key_id
        ? stored
        : fresh_progress(keys.key_id);
    const ctx: ResealStepContext = {
      keys,
      api: options.api,
      progress,
      persist: () => options.store.save(progress),
      sleep: options.sleep ?? default_sleep,
      is_cancelled: options.is_cancelled ?? (() => false),
      still_current: options.still_current,
      counts,
      incomplete: [],
    };
    const incomplete_steps: string[] = [];

    ctx.persist();

    for (const step of options.steps ?? DEFAULT_RESEAL_STEPS) {
      if (ctx.is_cancelled()) {
        return { status: "interrupted", counts, reason: "cancelled" };
      }

      const result = await step.run(ctx);

      if (result === "incomplete") {
        incomplete_steps.push(step.name);
        continue;
      }
      if (result !== "done") {
        return { status: "interrupted", counts, reason: step.name };
      }
    }

    if (progress.hash_moves.length > 0) {
      return { status: "interrupted", counts, reason: "hash_moves" };
    }
    if (incomplete_steps.length > 0) {
      return {
        status: "interrupted",
        counts,
        reason: "incomplete",
        incomplete: incomplete_steps,
      };
    }

    const finish = await options.finish(options.vault.data_kek);

    if (finish === "failed") {
      return { status: "failed", counts, reason: "finish" };
    }
    options.store.clear();

    return { status: finish, counts };
  } catch (caught) {
    if (caught instanceof ResealInterrupted) {
      return { status: "interrupted", counts, reason: caught.message };
    }

    return {
      status: "failed",
      counts,
      reason: caught instanceof Error ? caught.name : "error",
    };
  } finally {
    keys.dispose();
  }
}
