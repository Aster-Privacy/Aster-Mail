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

interface HeaderLike {
  name: string;
  value: string;
}

interface AddressLike {
  name?: string;
  email: string;
}

export function extract_delivered_to(
  raw_headers: HeaderLike[] | undefined,
): string | undefined {
  if (!raw_headers || raw_headers.length === 0) return undefined;
  const header = raw_headers.find(
    (h) => h.name.toLowerCase() === "delivered-to",
  );
  const value = header?.value?.trim();

  if (!value) return undefined;
  const token = value
    .split(/[\s,;]+/)
    .map((t) => t.replace(/^<+/, "").replace(/>+$/, ""))
    .find((t) => t.includes("@") && t.length > 2);

  return token ? token.toLowerCase() : undefined;
}

export function resolve_received_on_address(message: {
  raw_headers?: HeaderLike[];
  to_recipients?: AddressLike[];
  cc_recipients?: AddressLike[];
  sender_email?: string;
}): string | undefined {
  const delivered = extract_delivered_to(message.raw_headers);

  if (!delivered) return undefined;
  const visible = [
    ...(message.to_recipients ?? []).map((r) => r.email),
    ...(message.cc_recipients ?? []).map((r) => r.email),
    message.sender_email ?? "",
  ].map((e) => e.trim().toLowerCase());

  return visible.includes(delivered) ? undefined : delivered;
}
