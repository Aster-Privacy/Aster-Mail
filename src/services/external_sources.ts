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
import type {
  DecryptedExternalAccount,
  ExternalSource,
  SourceNotifyChoice,
  SourceNotifySetting,
} from "@/services/api/external_accounts";

export const SOURCE_ASTER_VALUE = "aster";

export interface SourceLabels {
  aster: string;
  device: string;
  forwarding: string;
  removed: string;
}

export interface SourceOption {
  value: string;
  label: string;
}

type SourceAccount = Pick<
  DecryptedExternalAccount,
  "account_token" | "email" | "display_name"
>;

export function describe_source(
  source: ExternalSource,
  accounts: SourceAccount[],
  labels: SourceLabels,
): string {
  if (source.kind === "device") return labels.device;
  if (source.kind === "forwarding") return labels.forwarding;

  const account = source.account_token
    ? accounts.find((item) => item.account_token === source.account_token)
    : undefined;

  if (!account) return labels.removed;

  return account.email.trim() || account.display_name.trim() || labels.removed;
}

export function build_source_options(
  sources: ExternalSource[],
  accounts: SourceAccount[],
  labels: SourceLabels,
): SourceOption[] {
  const options: SourceOption[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    if (!source.source_id || seen.has(source.source_id)) continue;
    if (source.source_id === SOURCE_ASTER_VALUE) continue;
    seen.add(source.source_id);
    options.push({
      value: source.source_id,
      label: describe_source(source, accounts, labels),
    });
  }

  return options;
}

export function label_for_source_value(
  value: string,
  options: SourceOption[],
  labels: SourceLabels,
): string {
  if (value === SOURCE_ASTER_VALUE) return labels.aster;

  return (
    options.find((option) => option.value === value)?.label ?? labels.removed
  );
}

export function toggle_source_value(
  values: string[],
  value: string,
  max_values: number,
): string[] {
  if (values.includes(value)) return values.filter((item) => item !== value);
  if (values.length >= max_values) return values;

  return [...values, value];
}

export function notify_choice_for(
  source_id: string,
  settings: SourceNotifySetting[],
): SourceNotifyChoice {
  const found = settings.find((item) => item.source_id === source_id);

  return found?.notify === "none" ? "none" : "all";
}

export function apply_notify_choice(
  settings: SourceNotifySetting[],
  source_id: string,
  notify: SourceNotifyChoice,
  known_source_ids: string[],
): SourceNotifySetting[] {
  const next = settings.filter(
    (item) =>
      item.source_id !== source_id &&
      item.notify === "none" &&
      known_source_ids.includes(item.source_id),
  );

  if (notify === "none") next.push({ source_id, notify });

  return next;
}
