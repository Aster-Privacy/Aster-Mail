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
import type { CustomDomain } from "@/services/api/domains";

export const ALIAS_DELETE_WAIT_MS = 30 * 24 * 60 * 60 * 1000;

const VERIFIED_DOMAIN_STATUSES = new Set(["active", "dns_pending"]);

export function custom_domain_skips_delete_wait(
  domain_name: string | undefined,
  domains: Pick<CustomDomain, "domain_name" | "status">[],
  plan_code: string | undefined,
): boolean {
  if (!domain_name || !plan_code || plan_code === "free") return false;
  const wanted = domain_name.toLowerCase();

  return domains.some(
    (domain) =>
      domain.domain_name.toLowerCase() === wanted &&
      VERIFIED_DOMAIN_STATUSES.has(domain.status),
  );
}

export function delete_eligible_at(created_at: string): Date {
  return new Date(new Date(created_at).getTime() + ALIAS_DELETE_WAIT_MS);
}
