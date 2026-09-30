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
import type { ContactFormData, ContactRevision } from "@/types/contacts";

export const CONTACT_REVISION_LIMIT = 5;

export function strip_contact_revisions(
  data: ContactFormData,
): ContactFormData {
  const { revisions: _revisions, ...rest } = data;

  void _revisions;

  return rest;
}

export function contact_revision_snapshot(
  data: ContactFormData,
): ContactFormData {
  const {
    revisions: _revisions,
    avatar_url: _avatar_url,
    extra_fields: _extra_fields,
    ...rest
  } = data;

  void _revisions;
  void _avatar_url;
  void _extra_fields;

  return rest;
}

export function contact_fields_changed(
  previous: ContactFormData,
  next: ContactFormData,
): boolean {
  return (
    JSON.stringify(contact_revision_snapshot(previous)) !==
    JSON.stringify(contact_revision_snapshot(next))
  );
}

export function with_contact_revision(
  next: ContactFormData,
  previous: ContactFormData,
): ContactFormData {
  const extra_fields = next.extra_fields ?? previous.extra_fields;
  const merged: ContactFormData = extra_fields
    ? { ...next, extra_fields }
    : next;

  if (!contact_fields_changed(previous, merged)) return merged;

  const entry: ContactRevision = {
    changed_at: new Date().toISOString(),
    data: contact_revision_snapshot(previous),
  };

  return {
    ...merged,
    revisions: [entry, ...(previous.revisions ?? [])].slice(
      0,
      CONTACT_REVISION_LIMIT,
    ),
  };
}
