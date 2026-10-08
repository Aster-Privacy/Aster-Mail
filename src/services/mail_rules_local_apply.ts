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
import type { Rule } from "@/services/api/mail_rules";

import {
  APPLY_TO_ITEMS_MAX_IDS,
  apply_rule_to_items,
} from "@/services/api/mail_rules";
import {
  DECRYPT_YIELD_CHUNK,
  scan_received_items,
} from "@/services/bulk_mail_scan";
import { decrypt_mail_envelope } from "@/components/email/shared/decrypt_envelope";
import {
  evaluate_rule_locally,
  local_input_from_envelope,
  rule_supports_local_evaluation,
} from "@/lib/mail_rules/local_rule_evaluator";
import { yield_to_browser } from "@/lib/scheduling";

export interface LocalApplyResult {
  supported: boolean;
  sealed: number;
  checked: number;
  matched: number;
  applied: number;
  unreadable: number;
  reached_cap: boolean;
  failed: boolean;
}

export type LocalApplyProgress = (result: LocalApplyResult) => void;

export function empty_local_apply_result(supported: boolean): LocalApplyResult {
  return {
    supported,
    sealed: 0,
    checked: 0,
    matched: 0,
    applied: 0,
    unreadable: 0,
    reached_cap: false,
    failed: false,
  };
}

export async function apply_rule_to_sealed_items(
  rule: Rule,
  signal?: AbortSignal,
  on_progress?: LocalApplyProgress,
): Promise<LocalApplyResult> {
  if (!rule_supports_local_evaluation(rule)) {
    return empty_local_apply_result(false);
  }

  const result = empty_local_apply_result(true);
  const scan = await scan_received_items(signal);

  result.reached_cap = scan.reached_cap;
  result.failed = scan.failed;

  const sealed = scan.items.filter(
    (item) =>
      !!item.envelope_nonce &&
      !!item.encrypted_envelope &&
      !item.is_trashed &&
      !item.is_spam,
  );

  result.sealed = sealed.length;
  on_progress?.({ ...result });

  const matched_ids: string[] = [];

  for (const item of sealed) {
    if (signal?.aborted) return result;

    result.checked += 1;
    if (result.checked % DECRYPT_YIELD_CHUNK === 0) {
      on_progress?.({ ...result });
      await yield_to_browser();
    }

    let envelope: Record<string, unknown> | null = null;

    try {
      envelope = await decrypt_mail_envelope<Record<string, unknown>>(
        item.encrypted_envelope,
        item.envelope_nonce,
        item.id,
      );
    } catch {
      envelope = null;
    }

    if (!envelope) {
      result.unreadable += 1;
      continue;
    }

    if (
      evaluate_rule_locally(rule, local_input_from_envelope(envelope, item))
    ) {
      matched_ids.push(item.id);
      result.matched += 1;
    }
  }

  on_progress?.({ ...result });

  for (
    let offset = 0;
    offset < matched_ids.length;
    offset += APPLY_TO_ITEMS_MAX_IDS
  ) {
    if (signal?.aborted) return result;

    const response = await apply_rule_to_items(
      rule.id,
      matched_ids.slice(offset, offset + APPLY_TO_ITEMS_MAX_IDS),
    );

    if (!response.data) {
      result.failed = true;
      break;
    }

    result.applied += response.data.applied;
    on_progress?.({ ...result });
  }

  return result;
}
