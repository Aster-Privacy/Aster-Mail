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
  type ExternalKeyInfo,
} from "./api/keys";
import { is_internal_recipient } from "./recipient_classification";
import {
  check_owner_key_pin,
  get_pinned_owner_key_fingerprint,
  owner_key_fingerprint,
  replace_owner_key_pin,
} from "./crypto/ratchet_identity_pin";

import { get_active_translations } from "@/lib/i18n/translations";

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

const KEY_TRUST_RETRY_MS = 600;

let prompt_handler: KeyTrustPromptHandler | null = null;

export class KeyTrustCheckError extends Error {
  constructor() {
    super(get_active_translations().errors.key_trust_check_failed);
    this.name = "KeyTrustCheckError";
  }
}

export function set_key_trust_prompt_handler(
  handler: KeyTrustPromptHandler | null,
): void {
  prompt_handler = handler;
}

interface KeyTrustReview {
  changes: KeyFingerprintChange[];
  server_changes: KeyFingerprintChange[];
  keys: ExternalKeyInfo[];
}

async function local_pin_change(
  key_info: ExternalKeyInfo,
): Promise<KeyFingerprintChange | null> {
  if (!key_info.found || !key_info.public_key) return null;

  try {
    const email = key_info.email.toLowerCase();
    const pinned = await get_pinned_owner_key_fingerprint(email, "external");

    if (!pinned) return null;

    const current = await owner_key_fingerprint(key_info.public_key);

    if (pinned === current) return null;

    return {
      email,
      prior_fingerprint: pinned.toUpperCase(),
      new_fingerprint: current.toUpperCase(),
      source: key_info.source ?? "",
      observed_at: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

async function pin_external_keys(
  keys: ExternalKeyInfo[],
  replace: boolean,
): Promise<void> {
  await Promise.all(
    keys.map(async (key_info) => {
      if (!key_info.found || !key_info.public_key) return;

      const email = key_info.email.toLowerCase();

      try {
        if (replace) {
          await replace_owner_key_pin(email, key_info.public_key, "external");
        } else {
          await check_owner_key_pin(email, key_info.public_key, "external");
        }
      } catch {
        return;
      }
    }),
  );
}

async function review_key_trust(recipients: string[]): Promise<KeyTrustReview> {
  const external = [
    ...new Set(
      recipients
        .map((recipient) => recipient.trim().toLowerCase())
        .filter(
          (recipient) =>
            recipient.includes("@") && !is_internal_recipient(recipient),
        ),
    ),
  ];

  if (external.length === 0) {
    return { changes: [], server_changes: [], keys: [] };
  }

  let response = await discover_external_keys_batch(external);

  if (response.error || !response.data) {
    await new Promise((resolve) => setTimeout(resolve, KEY_TRUST_RETRY_MS));
    response = await discover_external_keys_batch(external);
  }

  if (response.error || !response.data) throw new KeyTrustCheckError();

  const changes: KeyFingerprintChange[] = [];
  const server_changes: KeyFingerprintChange[] = [];

  for (const key_info of response.data) {
    const change = key_info.fingerprint_change;

    if (change) {
      const server_change = {
        email: key_info.email.toLowerCase(),
        prior_fingerprint: change.prior_fingerprint,
        new_fingerprint: change.new_fingerprint,
        source: change.source,
        observed_at: change.observed_at,
      };

      server_changes.push(server_change);
      changes.push(server_change);
      continue;
    }

    const local_change = await local_pin_change(key_info);

    if (local_change) changes.push(local_change);
  }

  return { changes, server_changes, keys: response.data };
}

export async function find_key_fingerprint_changes(
  recipients: string[],
): Promise<KeyFingerprintChange[]> {
  return (await review_key_trust(recipients)).changes;
}

export async function ensure_external_key_trust(
  recipients: string[],
): Promise<boolean> {
  let review: KeyTrustReview;

  try {
    review = await review_key_trust(recipients);
  } catch (error) {
    if (error instanceof KeyTrustCheckError) throw error;

    throw new KeyTrustCheckError();
  }

  if (review.changes.length === 0) {
    await pin_external_keys(review.keys, false);

    return true;
  }

  if (!prompt_handler) return false;

  const trusted = await prompt_handler(review.changes);

  if (!trusted) return false;

  await pin_external_keys(review.keys, true);

  await Promise.all(
    review.server_changes.map((change) =>
      acknowledge_external_key_fingerprint_change(
        change.email,
        change.prior_fingerprint,
        change.new_fingerprint,
      ).catch(() => undefined),
    ),
  );

  return true;
}
