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
import { get_recipient_public_key } from "../api/keys";

import { base64_to_array, compute_hash } from "./key_manager_core";
import { verify_ratchet_prekey_bundle_detailed } from "./key_manager_pgp";
import {
  fetch_prekey_bundle,
  fetch_ratchet_identity,
} from "./ratchet_prekey_bundle";
import {
  get_identity_change,
  get_pinned_identity_fingerprint,
  get_pinned_owner_key_fingerprint,
  is_recipient_bundle_accepted,
  is_recipient_flagged_untrusted,
  owner_key_fingerprint,
  trust_recipient_keys,
  type RecipientBundleBinding,
} from "./ratchet_identity_pin";

import { is_crypto_module_load_error } from "@/services/crypto/openpgp_loader";

export type RecipientIdentityStatus = "unchanged" | "rotated" | "untrusted";

interface RecipientIdentitySnapshot {
  status: RecipientIdentityStatus;
  kem_identity_key: string | null;
  owner_public_key: string | null;
  published_bundle: RecipientBundleBinding | null;
}

function lookup_parts(email: string): { pin_id: string; username: string } {
  const pin_id = email.trim().toLowerCase();

  return { pin_id, username: pin_id.split("@")[0] ?? "" };
}

async function is_published_bundle_unverified(
  pin_id: string,
  bundle: RecipientBundleBinding | null,
  owner_public_key: string | null,
): Promise<boolean> {
  if (!bundle) return false;

  const verification = await verify_ratchet_prekey_bundle_detailed(
    bundle.signed_prekey_signature,
    bundle.kem_identity_key,
    bundle.signed_prekey,
    owner_public_key,
    bundle.pq_kem_public_key ?? null,
  );

  if (verification.verdict !== "tampered") return false;

  return !(await is_recipient_bundle_accepted(pin_id, bundle));
}

async function snapshot_recipient_identity(
  email: string,
): Promise<RecipientIdentitySnapshot> {
  const { pin_id, username } = lookup_parts(email);
  const none: RecipientIdentitySnapshot = {
    status: "unchanged",
    kem_identity_key: null,
    owner_public_key: null,
    published_bundle: null,
  };

  if (!pin_id || !username) return none;

  try {
    const pinned_kem = await get_pinned_identity_fingerprint(pin_id);
    const pinned_owner = await get_pinned_owner_key_fingerprint(pin_id);
    const known = pinned_kem !== null || pinned_owner !== null;
    const identity = known
      ? await fetch_ratchet_identity(username, pin_id)
      : null;
    const owner = known
      ? await get_recipient_public_key(username, pin_id)
      : null;
    const kem_identity_key = identity?.kem_identity_key ?? null;
    const owner_public_key = owner?.data?.public_key ?? null;
    const published_bundle: RecipientBundleBinding | null = identity
      ? {
          kem_identity_key: identity.kem_identity_key,
          signed_prekey: identity.signed_prekey,
          signed_prekey_signature: identity.signed_prekey_signature,
          pq_kem_public_key: identity.pq_kem_public_key ?? null,
        }
      : null;

    const kem_changed =
      pinned_kem !== null &&
      kem_identity_key !== null &&
      (await compute_hash(base64_to_array(kem_identity_key))) !== pinned_kem;
    const owner_changed =
      pinned_owner !== null &&
      owner_public_key !== null &&
      (await owner_key_fingerprint(owner_public_key)) !== pinned_owner;

    if (
      owner_changed ||
      (await is_recipient_flagged_untrusted(pin_id)) ||
      (await is_published_bundle_unverified(
        pin_id,
        published_bundle,
        owner_public_key,
      ))
    ) {
      return {
        status: "untrusted",
        kem_identity_key,
        owner_public_key,
        published_bundle,
      };
    }

    if (kem_changed || (await get_identity_change(pin_id))) {
      return { ...none, status: "rotated" };
    }

    return none;
  } catch (error) {
    if (is_crypto_module_load_error(error)) throw error;

    return none;
  }
}

export async function get_recipient_identity_status(
  email: string,
): Promise<RecipientIdentityStatus> {
  return (await snapshot_recipient_identity(email)).status;
}

export async function has_recipient_identity_changed(
  email: string,
): Promise<boolean> {
  return (await get_recipient_identity_status(email)) !== "unchanged";
}

export async function trust_recipient_identity(email: string): Promise<void> {
  const snapshot = await snapshot_recipient_identity(email);

  if (snapshot.status !== "untrusted") return;

  const { pin_id, username } = lookup_parts(email);
  const bundle = await fetch_prekey_bundle(username, pin_id).catch(() => null);

  await trust_recipient_keys(
    pin_id,
    snapshot.kem_identity_key ?? bundle?.kem_identity_key ?? null,
    snapshot.owner_public_key,
    bundle ?? snapshot.published_bundle,
  );
}
