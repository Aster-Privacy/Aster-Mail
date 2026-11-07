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
import type { Level2Admission } from "@/services/crypto/vault_level2";
import type {
  VaultClearedEvent,
  VaultStoredEvent,
} from "@/services/crypto/memory_key_store";

export interface Level2StorageDeps {
  request_admission: () => Promise<Level2Admission>;
  reset_admission_state: () => void;
  is_admitted: () => boolean;
  start_rekey: (user_id: string) => void;
  stop_rekey: () => void;
  run_work_factor: (user_id: string) => Promise<unknown>;
  reset_locked_folder_rekey: () => void;
  reset_attachment_meta_cache: () => void;
  vault_epoch: () => number;
  has_vault_for: (user_id: string) => boolean;
  data_kek_tag: () => Promise<string | null>;
  on_error: (scope: string, caught: unknown) => void;
}

export interface Level2StorageController {
  ensure: (user_id: string | null | undefined) => void;
  handle_cleared: (event: VaultClearedEvent) => void;
  handle_stored: (event: VaultStoredEvent) => Promise<void>;
  active_owner: () => string | null;
}

export function create_level2_storage(
  deps: Level2StorageDeps,
): Level2StorageController {
  let owner: string | null = null;
  let epoch = -1;
  let run = 0;
  let kek_tag: string | null = null;

  const is_current = (user_id: string, run_id: number): boolean =>
    owner === user_id && run === run_id && epoch === deps.vault_epoch();

  const remember_kek_tag = (user_id: string, run_id: number): void => {
    deps
      .data_kek_tag()
      .then((tag) => {
        if (is_current(user_id, run_id) && kek_tag === null) kek_tag = tag;
      })
      .catch((caught) => deps.on_error("kek_tag", caught));
  };

  const ensure = (user_id: string | null | undefined): void => {
    if (!user_id || !deps.has_vault_for(user_id)) return;

    const current_epoch = deps.vault_epoch();

    if (owner === user_id && epoch === current_epoch) return;

    deps.stop_rekey();
    owner = user_id;
    epoch = current_epoch;
    run += 1;
    kek_tag = null;

    const run_id = run;

    remember_kek_tag(user_id, run_id);

    deps
      .request_admission()
      .then((admission) => {
        if (!is_current(user_id, run_id)) return;
        if (admission === "unknown") {
          owner = null;

          return;
        }
        if (admission !== "admitted") return;

        deps.start_rekey(user_id);
        deps
          .run_work_factor(user_id)
          .catch((caught) => deps.on_error("work_factor", caught));
      })
      .catch((caught) => {
        if (is_current(user_id, run_id)) owner = null;
        deps.on_error("level2", caught);
      });
  };

  const handle_cleared = (event: VaultClearedEvent): void => {
    if (event.same_owner) return;

    owner = null;
    kek_tag = null;
    run += 1;
    deps.reset_locked_folder_rekey();
    deps.reset_attachment_meta_cache();
    deps.stop_rekey();
    deps.reset_admission_state();
  };

  const handle_stored = async (event: VaultStoredEvent): Promise<void> => {
    const user_id = event.owner_id;

    if (!event.same_owner || !user_id) return;
    if (owner !== user_id) {
      ensure(user_id);

      return;
    }

    const run_id = run;
    const tag = await deps.data_kek_tag();

    if (!is_current(user_id, run_id)) return;
    if (tag === kek_tag) return;

    const previous = kek_tag;

    kek_tag = tag;
    if (previous === null) return;

    deps.reset_attachment_meta_cache();
    if (deps.is_admitted()) deps.start_rekey(user_id);
  };

  return {
    ensure,
    handle_cleared,
    handle_stored,
    active_owner: () => owner,
  };
}
