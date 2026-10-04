//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
export function verified_domain_for_shown_sender(
  verified_domain: string | undefined,
  shown_email: string | undefined,
): string | undefined {
  if (!verified_domain || !shown_email) return undefined;

  const at = shown_email.lastIndexOf("@");

  if (at < 0) return undefined;

  const shown_domain = shown_email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/\.$/, "");
  const verified = verified_domain.trim().toLowerCase().replace(/\.$/, "");

  if (!shown_domain || !verified) return undefined;

  return shown_domain === verified || shown_domain.endsWith(`.${verified}`)
    ? verified_domain
    : undefined;
}
