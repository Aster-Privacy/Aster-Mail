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
  type ExternalKeyInfo,
} from "./api/keys";
import { is_internal_recipient } from "./recipient_classification";
import {
  accept_missing_recipient_key,
  check_owner_key_pin,
  find_saved_recipient_key,
  lookup_owner_key_pin,
  owner_key_fingerprint,
  replace_owner_key_pin,
  restore_missing_key_check,
} from "./crypto/ratchet_identity_pin";

import { get_active_translations } from "@/lib/i18n/translations";

export interface KeyFingerprintChange {
  email: string;
  prior_fingerprint: string;
  new_fingerprint: string;
  source: string;
  observed_at: string;
  unreadable?: boolean;
  missing?: boolean;
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

  const email = key_info.email.toLowerCase();
  const pinned = await lookup_owner_key_pin(email);

  if (pinned === null) return null;

  const current = await owner_key_fingerprint(key_info.public_key);
  const observed = {
    email,
    new_fingerprint: current.toUpperCase(),
    source: key_info.source ?? "",
    observed_at: new Date().toISOString(),
  };

  if (pinned === "unreadable") {
    return { ...observed, prior_fingerprint: "", unreadable: true };
  }

  if (!pinned.conflict && pinned.fingerprint === current) return null;

  return { ...observed, prior_fingerprint: pinned.fingerprint.toUpperCase() };
}

function has_usable_key(key_info: ExternalKeyInfo): boolean {
  return key_info.found && Boolean(key_info.public_key);
}

async function missing_key_change(
  key_info: ExternalKeyInfo,
): Promise<KeyFingerprintChange | null> {
  if (has_usable_key(key_info)) return null;

  const email = key_info.email.toLowerCase();
  const saved = await find_saved_recipient_key(email);

  if (!saved || saved.accepted_missing) return null;

  return {
    email,
    prior_fingerprint: saved.fingerprint.toUpperCase(),
    new_fingerprint: "",
    source: key_info.source ?? "",
    observed_at: new Date().toISOString(),
    missing: true,
  };
}

async function restore_missing_key_checks(emails: string[]): Promise<void> {
  await Promise.all(
    emails.map((email) => restore_missing_key_check(email).catch(() => {})),
  );
}

async function pin_external_keys(
  keys: ExternalKeyInfo[],
  replace: boolean,
): Promise<boolean> {
  const settled = await Promise.all(
    keys.map(async (key_info) => {
      if (!key_info.found || !key_info.public_key) return true;

      const email = key_info.email.toLowerCase();

      if (replace) {
        await replace_owner_key_pin(email, key_info.public_key);

        return true;
      }

      return (
        (await check_owner_key_pin(email, key_info.public_key)) !== "changed"
      );
    }),
  );

  return settled.every(Boolean);
}

async function review_key_trust(recipients: string[]): Promise<KeyTrustReview> {
  const addressed = [
    ...new Set(
      recipients
        .map((recipient) => recipient.trim().toLowerCase())
        .filter((recipient) => recipient.includes("@")),
    ),
  ];
  const external = addressed.filter(
    (recipient) => !is_internal_recipient(recipient),
  );

  await restore_missing_key_checks(
    addressed.filter(
      (recipient) =>
        is_internal_recipient(recipient) && !is_internal_email(recipient),
    ),
  );

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

    const missing_change = await missing_key_change(key_info);

    if (missing_change) changes.push(missing_change);
  }

  await restore_missing_key_checks(
    response.data
      .filter(has_usable_key)
      .map((key_info) => key_info.email.toLowerCase()),
  );

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
  try {
    const review = await review_key_trust(recipients);

    if (review.changes.length === 0) {
      return await pin_external_keys(review.keys, false);
    }

    if (!prompt_handler) return false;

    const trusted = await prompt_handler(review.changes);

    if (!trusted) return false;

    await pin_external_keys(review.keys, true);

    for (const change of review.changes) {
      if (change.missing) await accept_missing_recipient_key(change.email);
    }

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
  } catch (error) {
    if (error instanceof KeyTrustCheckError) throw error;

    throw new KeyTrustCheckError();
  }
}
