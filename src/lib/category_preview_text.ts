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
export interface CategoryPreview {
  sender: string;
  subject: string;
}

export const MAX_PREVIEW_SENDER_CHARS = 80;
export const MAX_PREVIEW_SUBJECT_CHARS = 160;

export function titlecase_localpart(localpart: string): string {
  const words = localpart.split(/[._+-]+/).filter(Boolean);

  if (!words.length) return localpart;

  return words
    .map((word) =>
      /[a-z]/.test(word) && !/[A-Z]/.test(word)
        ? word[0].toUpperCase() + word.slice(1)
        : word,
    )
    .join(" ");
}

export function preview_sender_label(
  name: string | undefined,
  email: string | undefined,
): string {
  const trimmed_name = name?.trim();

  if (trimmed_name) return trimmed_name.slice(0, MAX_PREVIEW_SENDER_CHARS);

  const address = email?.trim() ?? "";
  const at = address.indexOf("@");
  const localpart = at > 0 ? address.slice(0, at) : address;

  return titlecase_localpart(localpart).slice(0, MAX_PREVIEW_SENDER_CHARS);
}

export function build_category_preview(
  name: string | undefined,
  email: string | undefined,
  subject: string | undefined,
): CategoryPreview {
  return {
    sender: preview_sender_label(name, email),
    subject: (subject ?? "").trim().slice(0, MAX_PREVIEW_SUBJECT_CHARS),
  };
}
