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
import type { SenderTrustSource } from "@/lib/utils";
import type { EmailAuthResults } from "@/utils/email_authentication";

import { ASTER_DOMAIN_SUFFIXES } from "@/data/category_signals";
import { is_official_sender, is_system_email } from "@/lib/utils";
import { normalize_email_auth_status } from "@/utils/email_authentication";

export interface LearnGateSource extends SenderTrustSource, EmailAuthResults {}

const ASTER_DOMAINS = new Set(ASTER_DOMAIN_SUFFIXES);

function sender_domain(email: string): string {
  const at = email.lastIndexOf("@");

  if (at === -1) return "";

  return email
    .slice(at + 1)
    .trim()
    .toLowerCase()
    .replace(/[.>]+$/, "");
}

export function is_aster_domain_sender(email: string): boolean {
  let current = sender_domain(email);

  while (current) {
    if (ASTER_DOMAINS.has(current)) return true;

    const dot = current.indexOf(".");

    if (dot === -1) return false;
    current = current.slice(dot + 1);
  }

  return false;
}

export function is_primary_locked_sender(
  email: string,
  source?: SenderTrustSource | null,
): boolean {
  if (!email || !is_aster_domain_sender(email)) return false;

  const trust: SenderTrustSource = { ...(source ?? {}), sender_email: email };

  return is_official_sender(trust) || is_system_email(trust);
}

export function has_failed_authentication(source: EmailAuthResults): boolean {
  return [source.spf_result, source.dkim_result, source.dmarc_result].some(
    (result) => normalize_email_auth_status(result).status === "fail",
  );
}

export function is_learning_blocked(
  email: string,
  source: LearnGateSource,
): boolean {
  if (source.sender_verification === "invalid") return true;
  if (has_failed_authentication(source)) return true;

  return is_aster_domain_sender(email);
}
