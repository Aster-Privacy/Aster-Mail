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
export type PinScope = "hosted" | "external";

export interface PinIdentity {
  id: string;
  legacy: string[];
  shadow: string | null;
}

function normalize_pin_domain(domain: string): string {
  const lowered = domain.trim().toLowerCase();

  return lowered.endsWith(".") ? lowered.slice(0, -1) : lowered;
}

function split_pin_address(
  lowered: string,
): { local: string; domain: string } | null {
  const at = lowered.lastIndexOf("@");

  if (at === -1) return null;

  return {
    local: lowered.slice(0, at),
    domain: normalize_pin_domain(lowered.slice(at + 1)),
  };
}

function base_local_part(local: string): string {
  const plus = local.indexOf("+");

  return plus === -1 ? local : local.slice(0, plus);
}

export function canonical_pin_id(raw: string): string {
  const lowered = raw.trim().toLowerCase();
  const parts = split_pin_address(lowered);

  if (!parts) return lowered.replace(/\./g, "") || lowered;

  const dotless = base_local_part(parts.local).replace(/\./g, "");

  if (!dotless || !parts.domain) return lowered;

  return `${dotless}@${parts.domain}`;
}

function legacy_pin_ids(raw: string, canonical: string): string[] {
  const untrimmed = raw.toLowerCase();
  const lowered = untrimmed.trim();
  const parts = split_pin_address(lowered);
  const variants = [lowered, untrimmed];

  if (parts) {
    const base = base_local_part(parts.local);

    if (base && parts.domain) variants.push(`${base}@${parts.domain}`);
  }

  return [...new Set(variants)].filter(
    (variant) => variant !== "" && variant !== canonical,
  );
}

export function resolve_pin_identity(
  raw: string,
  scope: PinScope = "hosted",
): PinIdentity {
  const canonical = canonical_pin_id(raw);

  if (scope === "hosted") {
    return {
      id: canonical,
      legacy: legacy_pin_ids(raw, canonical),
      shadow: null,
    };
  }

  const untrimmed = raw.toLowerCase();
  const id = untrimmed.trim();

  return {
    id,
    legacy: untrimmed !== id ? [untrimmed] : [],
    shadow: canonical !== id ? canonical : null,
  };
}
