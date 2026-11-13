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
import type { TranslationKey } from "@/lib/i18n";

import { format_fingerprint } from "@/services/api/keys";
import type { KeyFingerprintChange } from "@/services/key_trust_consent";

type Translate = (
  key: TranslationKey,
  params?: Record<string, string | number>,
) => string;

function change_detail(change: KeyFingerprintChange, t: Translate): string {
  if (change.missing) {
    return change.prior_fingerprint
      ? t("common.key_trust_missing_detail", {
          email: change.email,
          prior: format_fingerprint(change.prior_fingerprint),
        })
      : t("common.key_trust_missing_unreadable_detail", {
          email: change.email,
        });
  }

  if (change.unreadable || !change.prior_fingerprint) {
    return t("common.key_trust_unreadable_detail", {
      email: change.email,
      current: format_fingerprint(change.new_fingerprint),
    });
  }

  if (change.fingerprints && change.fingerprints.length > 1) {
    return change.fingerprints
      .map((fingerprint) =>
        t(
          fingerprint.kind === "account"
            ? "common.key_trust_account_key_detail"
            : "common.key_trust_identity_key_detail",
          {
            email: change.email,
            prior: format_fingerprint(fingerprint.prior_fingerprint),
            current: format_fingerprint(fingerprint.new_fingerprint),
          },
        ),
      )
      .join(" ");
  }

  return t("common.key_trust_change_detail", {
    email: change.email,
    prior: format_fingerprint(change.prior_fingerprint),
    current: format_fingerprint(change.new_fingerprint),
  });
}

export function key_trust_change_details(
  changes: KeyFingerprintChange[],
  t: Translate,
): string {
  return changes
    .filter(
      (change) =>
        change.missing ||
        Boolean(change.new_fingerprint) ||
        Boolean(change.prior_fingerprint),
    )
    .map((change) => change_detail(change, t))
    .join(" ");
}
