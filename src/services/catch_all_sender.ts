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
import type { SenderOption } from "@/hooks/use_sender_aliases";
import type { CustomDomain } from "@/services/api/domains";

import { normalize_address_ignoring_dots } from "@/utils/address_dots";
import { extract_delivered_to } from "@/utils/delivered_to";

export function is_catch_all_sending_enabled(): boolean {
  return import.meta.env.VITE_CATCH_ALL_SENDING === "true";
}

let context_domains: CustomDomain[] = [];
let context_known = new Set<string>();

export function set_catch_all_context(
  domains: CustomDomain[],
  known: (string | null | undefined)[],
): void {
  context_domains = domains;
  context_known = new Set(
    known
      .filter((a): a is string => !!a)
      .map((a) => normalize_address_ignoring_dots(a)),
  );
}

function to_concrete_address(
  candidate: string | null | undefined,
): string | undefined {
  const email = candidate?.trim().toLowerCase();

  if (
    !email ||
    email.length > 254 ||
    !/^[a-z0-9!#$%&'*+\/=?^_`{|}~.-]{1,64}@[a-z0-9.-]+$/.test(email)
  )
    return undefined;
  const local = email.slice(0, email.indexOf("@"));

  if (
    local === "*" ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..")
  )
    return undefined;

  return email;
}

function find_catch_all_domain(
  domains: CustomDomain[],
  email: string,
): CustomDomain | undefined {
  const name = email.slice(email.indexOf("@") + 1);

  return domains.find(
    (d) =>
      d.status === "active" &&
      d.catch_all_enabled &&
      !d.is_shared &&
      d.domain_name.toLowerCase() === name,
  );
}

export function catch_all_sender_options(
  domains: CustomDomain[],
  candidates: (string | null | undefined)[],
  existing: SenderOption[],
  disabled: string[],
): SenderOption[] {
  const known = new Set(
    [...existing.map((s) => s.email), ...disabled].map(
      normalize_address_ignoring_dots,
    ),
  );
  const options: SenderOption[] = [];

  for (const candidate of candidates) {
    const email = to_concrete_address(candidate);
    const domain = email ? find_catch_all_domain(domains, email) : undefined;

    if (!email || !domain || known.has(normalize_address_ignoring_dots(email)))
      continue;
    known.add(normalize_address_ignoring_dots(email));
    options.push({
      id: `catch-all-${domain.id}-${email}`,
      email,
      type: "domain",
      is_enabled: true,
      domain_name: domain.domain_name,
      is_catch_all: true,
    });
  }

  return options;
}

export function catch_all_reply_address(
  raw_headers: { name: string; value: string }[] | undefined,
  visible: (string | null | undefined)[],
): string | undefined {
  if (!is_catch_all_sending_enabled()) return undefined;
  const delivered = to_concrete_address(extract_delivered_to(raw_headers));

  if (!delivered || !find_catch_all_domain(context_domains, delivered))
    return undefined;
  const registered = [delivered, ...visible].some(
    (a) => !!a && context_known.has(normalize_address_ignoring_dots(a)),
  );

  return registered ? undefined : delivered;
}
