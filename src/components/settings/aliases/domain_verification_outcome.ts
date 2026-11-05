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

import type { VerificationResult } from "@/services/api/domains";

export type DomainVerificationOutcome = "verified" | "receiving" | "pending";

export function domain_receives_mail(status: string): boolean {
  return status === "active" || status === "dns_pending";
}

export function domain_verification_outcome(
  result: Pick<
    VerificationResult,
    "txt_verified" | "mx_verified" | "spf_verified" | "dkim_verified" | "status"
  >,
): DomainVerificationOutcome {
  if (
    result.txt_verified &&
    result.mx_verified &&
    result.spf_verified &&
    result.dkim_verified
  ) {
    return "verified";
  }

  if (result.txt_verified && result.mx_verified) return "receiving";

  return "pending";
}
