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
import {
  acknowledge_external_key_fingerprint_change,
  discover_external_keys_batch,
  is_internal_email,
} from "./api/keys";

export interface KeyFingerprintChange {
  email: string;
  prior_fingerprint: string;
  new_fingerprint: string;
  source: string;
  observed_at: string;
}

export type KeyTrustPromptHandler = (
  changes: KeyFingerprintChange[],
) => Promise<boolean>;

let prompt_handler: KeyTrustPromptHandler | null = null;

export function set_key_trust_prompt_handler(
  handler: KeyTrustPromptHandler | null,
): void {
  prompt_handler = handler;
}

export async function find_key_fingerprint_changes(
  recipients: string[],
): Promise<KeyFingerprintChange[]> {
  const external = [
    ...new Set(
      recipients
        .map((recipient) => recipient.trim().toLowerCase())
        .filter(
          (recipient) =>
            recipient.includes("@") && !is_internal_email(recipient),
        ),
    ),
  ];

  if (external.length === 0) return [];

  const response = await discover_external_keys_batch(external);

  if (!response.data) return [];

  const changes: KeyFingerprintChange[] = [];

  for (const key_info of response.data) {
    const change = key_info.fingerprint_change;

    if (!change) continue;

    changes.push({
      email: key_info.email.toLowerCase(),
      prior_fingerprint: change.prior_fingerprint,
      new_fingerprint: change.new_fingerprint,
      source: change.source,
      observed_at: change.observed_at,
    });
  }

  return changes;
}

export async function ensure_external_key_trust(
  recipients: string[],
): Promise<boolean> {
  let changes: KeyFingerprintChange[] = [];

  try {
    changes = await find_key_fingerprint_changes(recipients);
  } catch {
    return true;
  }

  if (changes.length === 0) return true;

  if (!prompt_handler) return false;

  const trusted = await prompt_handler(changes);

  if (!trusted) return false;

  await Promise.all(
    changes.map((change) =>
      acknowledge_external_key_fingerprint_change(
        change.email,
        change.prior_fingerprint,
        change.new_fingerprint,
      ).catch(() => undefined),
    ),
  );

  return true;
}
