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
export const FORMAT_CLASS_IDS = [
  "storage_password_v1",
  "mail_public_kek",
  "recovery_escrow_legacy",
  "escrow_unbound",
  "recovery_lane_unbound",
  "ratchet_unbound",
  "inbound_unbound_marker",
  "vault_unbound",
  "device_snapshot_unbound",
  "inbound_plaintext",
] as const;

export type FormatClassId = (typeof FORMAT_CLASS_IDS)[number];

export type RefusalMode = "accept" | "after_marker" | "always";

export const FORMAT_REFUSAL_DEFAULTS: Readonly<
  Record<FormatClassId, RefusalMode>
> = {
  storage_password_v1: "after_marker",
  mail_public_kek: "after_marker",
  recovery_escrow_legacy: "after_marker",
  escrow_unbound: "after_marker",
  recovery_lane_unbound: "after_marker",
  ratchet_unbound: "after_marker",
  inbound_unbound_marker: "after_marker",
  vault_unbound: "after_marker",
  device_snapshot_unbound: "after_marker",
  inbound_plaintext: "after_marker",
};

export const FORMAT_MIGRATION_ENABLED: boolean = true;

export const FORMAT_REMAINING_REPORT_ENABLED: boolean = false;

export const FORMAT_MIGRATION_SESSION_BUDGET = 2000;

const STORED_UNBOUND_CLASSES: ReadonlySet<FormatClassId> = new Set([
  "escrow_unbound",
  "recovery_lane_unbound",
  "recovery_escrow_legacy",
  "ratchet_unbound",
  "device_snapshot_unbound",
]);

function env_value(name: string): unknown {
  return (import.meta.env as Record<string, unknown>)[name];
}

function is_truthy(raw: unknown): boolean {
  return raw === "1" || raw === "true";
}

function is_refusal_mode(raw: unknown): raw is RefusalMode {
  return raw === "accept" || raw === "after_marker" || raw === "always";
}

export function refusal_env_name(id: FormatClassId): string {
  return `VITE_FORMAT_REFUSAL_${id.toUpperCase()}`;
}

export function refusal_mode(id: FormatClassId): RefusalMode {
  const raw = env_value(refusal_env_name(id));

  if (is_refusal_mode(raw)) return raw;
  if (
    STORED_UNBOUND_CLASSES.has(id) &&
    is_truthy(env_value("VITE_REFUSE_UNBOUND_STORED_DATA"))
  ) {
    return "always";
  }

  return FORMAT_REFUSAL_DEFAULTS[id];
}

export function format_migration_enabled(): boolean {
  const raw = env_value("VITE_FORMAT_MIGRATION_DISABLED");

  return FORMAT_MIGRATION_ENABLED && !is_truthy(raw);
}

export function remaining_report_enabled(): boolean {
  return (
    FORMAT_REMAINING_REPORT_ENABLED ||
    is_truthy(env_value("VITE_FORMAT_REMAINING_REPORT"))
  );
}
