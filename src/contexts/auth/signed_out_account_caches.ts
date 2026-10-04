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

import { clear_account_scoped_caches } from "./auth_helpers";

import { lock_all_folders } from "@/hooks/use_protected_folder";
import { clear_escrow_miss_cache } from "@/services/crypto/message_escrow";
import { clear_translation_cache } from "@/services/translation/translation_cache";
import { clear_detection_cache } from "@/services/translation/language_detect";
import { release_engines } from "@/services/translation/engine_registry";
import { clear_billing_cache } from "@/components/settings/billing/billing_cache";
import { clear_family_cache } from "@/components/settings/billing/family_section/family_cache";
import { ignore_error } from "@/lib/ignore_error";

function run_clearer(clear: () => void): void {
  try {
    clear();
  } catch (caught) {
    ignore_error("contexts/auth/signed_out_account_caches:clear", caught);
  }
}

export async function clear_signed_out_account_caches(
  account_id?: string | null,
): Promise<void> {
  run_clearer(() => lock_all_folders());
  run_clearer(() => clear_escrow_miss_cache());
  run_clearer(() => clear_billing_cache());
  run_clearer(() => clear_family_cache());
  run_clearer(() => clear_translation_cache());
  run_clearer(() => clear_detection_cache());
  run_clearer(() => release_engines());

  await clear_account_scoped_caches(
    account_id ? { account_id } : "current_account",
  );
}
