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
export const CONTACT_TRASH_RETENTION_DAYS = 30;

const MS_PER_DAY = 86_400_000;

export function is_contact_trashed(contact: { deleted_at?: string }): boolean {
  return typeof contact.deleted_at === "string" && contact.deleted_at !== "";
}

export function contact_trash_days_left(deleted_at: string): number {
  const deleted_ms = new Date(deleted_at).getTime();

  if (Number.isNaN(deleted_ms)) return CONTACT_TRASH_RETENTION_DAYS;

  const elapsed_days = Math.floor((Date.now() - deleted_ms) / MS_PER_DAY);

  return Math.max(0, CONTACT_TRASH_RETENTION_DAYS - elapsed_days);
}

export function is_contact_trash_expired(deleted_at: string): boolean {
  return contact_trash_days_left(deleted_at) === 0;
}
