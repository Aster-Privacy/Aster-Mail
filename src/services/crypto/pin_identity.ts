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
export type PeerKind = "builtin" | "hosted" | "external";

export interface PinContact {
  id: string;
  kind: PeerKind;
  spellings: string[];
}

function split_pin_address(
  lowered: string,
): { local: string; domain: string } | null {
  const at = lowered.lastIndexOf("@");

  if (at === -1) return null;

  return { local: lowered.slice(0, at), domain: lowered.slice(at + 1) };
}

function base_local_part(local: string): string {
  const plus = local.indexOf("+");

  return plus === -1 ? local : local.slice(0, plus);
}

export function canonical_pin_id(raw: string, kind: PeerKind): string {
  const lowered = raw.trim().toLowerCase();
  const parts = split_pin_address(lowered);

  if (!parts || kind === "external") return lowered;

  const base = base_local_part(parts.local);
  const local = kind === "builtin" ? base.replace(/\./g, "") : base;

  if (!local || !parts.domain) return lowered;

  return `${local}@${parts.domain}`;
}

function stored_spellings(raw: string, canonical: string): string[] {
  const untrimmed = raw.toLowerCase();
  const lowered = untrimmed.trim();
  const parts = split_pin_address(lowered);
  const variants = [canonical, lowered, untrimmed];

  if (parts) {
    const base = base_local_part(parts.local);

    if (base && parts.domain) {
      const tag = parts.local.slice(base.length);
      const dotless = base.replace(/\./g, "");

      if (tag && dotless) variants.push(`${dotless}${tag}@${parts.domain}`);

      variants.push(`${base}@${parts.domain}`);
    }
  }

  return [...new Set(variants)].filter((variant) => variant !== "");
}

export function describe_pin_contact(raw: string, kind: PeerKind): PinContact {
  const id = canonical_pin_id(raw, kind);

  return {
    id,
    kind,
    spellings:
      kind === "external"
        ? [...new Set([id, raw.toLowerCase()])].filter(Boolean)
        : stored_spellings(raw, id),
  };
}

export function dotted_spellings(canonical: string, limit: number): string[] {
  const parts = split_pin_address(canonical);

  if (!parts || parts.local.length < 2 || limit <= 0) return [];

  const letters = [...parts.local];
  const gaps = letters.length - 1;
  const spellings: string[] = [];

  const spell = (dots: number[]): string => {
    const marked = new Set(dots);

    return (
      letters
        .map((letter, index) => (marked.has(index) ? `${letter}.` : letter))
        .join("") + `@${parts.domain}`
    );
  };

  const place = (remaining: number, start: number, dots: number[]): void => {
    if (spellings.length >= limit) return;

    if (remaining === 0) {
      spellings.push(spell(dots));

      return;
    }

    for (let gap = start; gap <= gaps - remaining; gap += 1) {
      place(remaining - 1, gap + 1, [...dots, gap]);

      if (spellings.length >= limit) return;
    }
  };

  for (let count = 1; count <= gaps && spellings.length < limit; count += 1) {
    place(count, 0, []);
  }

  return spellings;
}

export async function resolve_peer_kind(raw: string): Promise<PeerKind | null> {
  const lowered = raw.trim().toLowerCase();

  if (!lowered) return null;
  if (!lowered.includes("@")) return "external";

  try {
    const { is_internal_email } = await import("@/services/api/keys");

    if (is_internal_email(lowered)) return "builtin";

    const { classify_recipients, get_cached_recipient_classification } =
      await import("@/services/recipient_classification");
    const known =
      get_cached_recipient_classification(lowered) ??
      (await classify_recipients([lowered], { require_resolved: true }))
        .values()
        .next().value;

    if (known === "internal") return "hosted";

    return known === "external" ? "external" : null;
  } catch {
    return null;
  }
}

export async function resolve_pin_contact(
  raw: string,
): Promise<PinContact | null> {
  const kind = await resolve_peer_kind(raw);

  return kind ? describe_pin_contact(raw, kind) : null;
}
