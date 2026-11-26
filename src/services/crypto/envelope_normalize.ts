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
import { name_angle_address } from "@/lib/address_scans";
export function normalize_envelope_from(
  from: unknown,
): { name: string; email: string } | null {
  if (!from) return null;
  if (typeof from === "object" && "email" in from) {
    return from as { name: string; email: string };
  }
  if (typeof from === "string") {
    const match = name_angle_address(from);

    if (match) {
      return {
        name: match.name.replace(/^["']|["']$/g, "").trim(),
        email: match.address,
      };
    }
    if (from.includes("@")) return { name: "", email: from };
  }

  return null;
}

export function normalize_envelope_recipients(
  recipients: unknown,
): { name: string; email: string }[] {
  if (!Array.isArray(recipients)) return [];

  const result: { name: string; email: string }[] = [];

  for (const entry of recipients) {
    const normalized = normalize_envelope_from(entry);

    if (normalized && normalized.email) result.push(normalized);
  }

  return result;
}
