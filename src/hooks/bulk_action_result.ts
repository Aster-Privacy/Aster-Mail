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
import type { ActionToastConfig } from "@/components/toast/action_toast";
import type { TranslationKey } from "@/lib/i18n/types";

import { show_action_toast } from "@/components/toast/action_toast";
import { show_toast } from "@/components/toast/simple_toast";

export interface BulkActionResult {
  attempted_ids: string[];
  failed_ids: string[];
}

export type BulkActionOutcome = "success" | "partial" | "failure";

export function bulk_action_result(
  attempted_ids: string[],
  failed_ids: Iterable<string> = [],
): BulkActionResult {
  const attempted = Array.from(new Set(attempted_ids));
  const attempted_set = new Set(attempted);
  const failed = Array.from(new Set(failed_ids)).filter((id) =>
    attempted_set.has(id),
  );

  return { attempted_ids: attempted, failed_ids: failed };
}

export function bulk_action_all_failed(
  attempted_ids: string[],
): BulkActionResult {
  return bulk_action_result(attempted_ids, attempted_ids);
}

export function bulk_succeeded_ids(result: BulkActionResult): string[] {
  const failed = new Set(result.failed_ids);

  return result.attempted_ids.filter((id) => !failed.has(id));
}

export function bulk_outcome(result: BulkActionResult): BulkActionOutcome {
  if (result.failed_ids.length === 0) return "success";
  if (result.failed_ids.length >= result.attempted_ids.length) return "failure";

  return "partial";
}

interface BulkResultToastOptions {
  result: BulkActionResult;
  t: (key: TranslationKey, params?: Record<string, string | number>) => string;
  success_message: string;
  error_message: string;
  action_type: ActionToastConfig["action_type"];
  email_ids?: string[];
  on_undo?: () => Promise<void>;
}

export function show_bulk_result_toast({
  result,
  t,
  success_message,
  error_message,
  action_type,
  email_ids,
  on_undo,
}: BulkResultToastOptions): BulkActionOutcome {
  const outcome = bulk_outcome(result);

  if (outcome === "failure") {
    show_toast(error_message, "error");

    return outcome;
  }
  if (outcome === "partial") {
    show_toast(
      t("common.bulk_action_partially_applied", {
        count: result.attempted_ids.length - result.failed_ids.length,
        total: result.attempted_ids.length,
      }),
      "warning",
    );

    return outcome;
  }
  show_action_toast({
    message: success_message,
    action_type,
    email_ids: email_ids ?? bulk_succeeded_ids(result),
    ...(on_undo ? { on_undo } : {}),
  });

  return outcome;
}
