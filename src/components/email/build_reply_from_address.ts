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
export interface ReplyFromSource {
  sender_email: string;
  to_emails?: string[];
  cc_emails?: string[];
}

export function build_reply_from_address(
  source: ReplyFromSource,
  is_own_message: boolean,
): string | undefined {
  if (is_own_message) {
    const trimmed = source.sender_email?.trim();

    return trimmed ? trimmed : undefined;
  }

  return undefined;
}

export function collect_recipient_emails(
  to_emails?: string[],
  cc_emails?: string[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const list of [to_emails, cc_emails]) {
    if (!list) continue;
    for (const raw of list) {
      const email = raw?.trim();

      if (!email) continue;
      const key = email.toLowerCase();

      if (seen.has(key)) continue;
      seen.add(key);
      out.push(email);
    }
  }

  return out;
}
