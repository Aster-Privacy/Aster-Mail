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
  lookup_saved_key,
  owner_key_fingerprint,
  replace_owner_key_pin,
  restore_missing_key_check,
} from "./crypto/ratchet_identity_pin";
import {
  base64_to_hex,
  describe_recipient_identity_change,
  trust_recipient_identity,
  type RecipientKeyFingerprint,
  type RecipientKeySnapshot,
} from "./crypto/recipient_identity_check";

import { get_active_translations } from "@/lib/i18n/translations";
import { same_address_ignoring_dots } from "@/utils/address_dots";

export interface KeyFingerprintChange {
  email: string;
  prior_fingerprint: string;
  new_fingerprint: string;
  source: string;
  observed_at: string;
  unreadable?: boolean;
  missing?: boolean;
  own?: boolean;
  fingerprints?: RecipientKeyFingerprint[];
  keys?: RecipientKeySnapshot;
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
  const pinned = await lookup_saved_key(email);

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

  if (pinned.owner && !pinned.conflict && pinned.fingerprint === current) {
    return null;
  }

  return {
    ...observed,
    prior_fingerprint: (pinned.owner
      ? pinned.fingerprint
      : base64_to_hex(pinned.fingerprint)
    ).toUpperCase(),
  };
}

function has_usable_key(key_info: ExternalKeyInfo): boolean {
  return key_info.found && Boolean(key_info.public_key);
}

async function delivered_fingerprint(
  key_info: ExternalKeyInfo,
  reported: string,
): Promise<string> {
  if (!key_info.found || !key_info.public_key) return reported;

  try {
    const delivered = await owner_key_fingerprint(key_info.public_key);

    return delivered === reported.toLowerCase()
      ? reported
      : delivered.toUpperCase();
  } catch {
    return reported;
  }
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
    ...(saved.unreadable ? { unreadable: true } : {}),
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
      changes.push({
        ...server_change,
        new_fingerprint: await delivered_fingerprint(
          key_info,
          change.new_fingerprint,
        ),
      });
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

export type InternalKeyTrustResult = "trusted" | "declined" | "unavailable";

async function internal_key_change(
  email: string,
  unreadable: boolean,
  own: boolean,
): Promise<KeyFingerprintChange> {
  const observed_at = new Date().toISOString();
  const described = await describe_recipient_identity_change(email).catch(
    () => null,
  );
  const prior_fingerprint = described?.prior_fingerprint ?? "";

  return {
    email: email.trim().toLowerCase(),
    prior_fingerprint,
    new_fingerprint: described?.new_fingerprint ?? "",
    source: "",
    observed_at,
    ...(unreadable ? { unreadable: true } : {}),
    ...(own ? { own: true } : {}),
    ...(described && described.fingerprints.length > 1
      ? { fingerprints: described.fingerprints }
      : {}),
    ...(described ? { keys: described.keys } : {}),
  };
}

export async function confirm_internal_key_trust(
  untrusted: string[],
  unreadable: string[] = [],
  own_address?: string,
): Promise<InternalKeyTrustResult> {
  const unreadable_set = new Set(
    unreadable.map((email) => email.trim().toLowerCase()),
  );
  const addresses = [
    ...new Set(
      [...untrusted, ...unreadable].map((email) => email.trim().toLowerCase()),
    ),
  ].filter(Boolean);

  if (addresses.length === 0) return "trusted";
  if (!prompt_handler) return "unavailable";

  const changes = await Promise.all(
    addresses.map((email) =>
      internal_key_change(
        email,
        unreadable_set.has(email),
        Boolean(own_address) &&
          same_address_ignoring_dots(email, own_address ?? ""),
      ),
    ),
  );

  if (!(await prompt_handler(changes))) return "declined";

  if (changes.some((change) => !change.keys)) throw new KeyTrustCheckError();

  try {
    for (const change of changes) {
      await trust_recipient_identity(change.email, change.keys);
    }
  } catch {
    throw new KeyTrustCheckError();
  }

  return "trusted";
}
