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

let include_quoted_default = true;

let prefix_reply_subject = true;

export function set_reply_include_quoted(value: unknown): void {
  include_quoted_default = value !== false;
}

export function set_reply_prefix_subject(value: unknown): void {
  prefix_reply_subject = value !== false;
}

export function reply_includes_quoted_by_default(): boolean {
  return include_quoted_default;
}

export function reply_subject_prefixes(): boolean {
  return prefix_reply_subject;
}

export function resolve_reply_prefix(localized_prefix: string): string {
  return prefix_reply_subject ? localized_prefix : "";
}
