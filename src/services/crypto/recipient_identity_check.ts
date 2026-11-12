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
  is_directory_trust_rejected,
  resolve_recipient_bundle,
  resolve_recipient_identity,
} from "./address_identity_directory";
import {
  is_recipient_bundle_accepted,
  owner_key_fingerprint,
  read_recipient_pins,
  trust_recipient_keys,
  type RecipientBundleBinding,
} from "./ratchet_identity_pin";
import { KeyPinUnavailableError } from "./ratchet_types";

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
    const pins = await read_recipient_pins(pin_id);
    const pinned_kem = pins.identity_fingerprint;
    const pinned_owner = pins.owner_fingerprint;
    const pins_unsettled = pins.health !== "settled";
    const known =
      pins_unsettled || pinned_kem !== null || pinned_owner !== null;
    const resolved = known
      ? await resolve_recipient_identity(username, pin_id)
      : null;
    const identity = resolved?.entry ?? null;
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
    const directory_rejected =
      resolved !== null &&
      published_bundle !== null &&
      is_directory_trust_rejected(resolved.trust) &&
      !(
        resolved.trust === "invalid" &&
        (await is_recipient_bundle_accepted(pin_id, published_bundle))
      );

    const kem_changed =
      pinned_kem !== null &&
      kem_identity_key !== null &&
      (await compute_hash(base64_to_array(kem_identity_key))) !== pinned_kem;
    const owner_changed =
      pinned_owner !== null &&
      owner_public_key !== null &&
      (await owner_key_fingerprint(owner_public_key)) !== pinned_owner;

    if (
      pins_unsettled ||
      owner_changed ||
      pins.flagged ||
      directory_rejected ||
      (!resolved?.scoped &&
        (await is_published_bundle_unverified(
          pin_id,
          published_bundle,
          owner_public_key,
        )))
    ) {
      return {
        status: "untrusted",
        kem_identity_key,
        owner_public_key,
        published_bundle,
      };
    }

    if (kem_changed || pins.change) {
      return { ...none, status: "rotated" };
    }

    return none;
  } catch (error) {
    if (is_crypto_module_load_error(error)) throw error;

    return { ...none, status: "untrusted" };
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

export interface RecipientIdentityChange {
  email: string;
  prior_fingerprint: string;
  new_fingerprint: string;
}

function base64_to_hex(value: string): string {
  return Array.from(base64_to_array(value))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

interface PublishedIdentity {
  binding: RecipientBundleBinding;
  scoped: boolean;
}

async function published_identity(
  username: string,
  pin_id: string,
): Promise<PublishedIdentity | null> {
  const resolved = await resolve_recipient_bundle(username, pin_id).catch(
    () => null,
  );

  if (resolved?.entry) {
    return { binding: resolved.entry, scoped: resolved.scoped };
  }

  const identity = await resolve_recipient_identity(username, pin_id).catch(
    () => null,
  );

  return identity
    ? {
        binding: {
          kem_identity_key: identity.entry.kem_identity_key,
          signed_prekey: identity.entry.signed_prekey,
          signed_prekey_signature: identity.entry.signed_prekey_signature,
          pq_kem_public_key: identity.entry.pq_kem_public_key ?? null,
        },
        scoped: identity.scoped,
      }
    : null;
}

async function published_owner_key(
  username: string,
  pin_id: string,
): Promise<string | null> {
  const owner = await get_recipient_public_key(username, pin_id).catch(
    () => null,
  );

  return owner?.data?.public_key ?? null;
}

export async function describe_recipient_identity_change(
  email: string,
): Promise<RecipientIdentityChange> {
  const { pin_id, username } = lookup_parts(email);
  const pins = await read_recipient_pins(pin_id);
  const owner_public_key = await published_owner_key(username, pin_id);
  const resolved_identity = await resolve_recipient_identity(
    username,
    pin_id,
  ).catch(() => null);
  const identity = resolved_identity?.entry ?? null;
  const current_owner = owner_public_key
    ? await owner_key_fingerprint(owner_public_key).catch(() => null)
    : null;
  const current_kem = identity
    ? await compute_hash(base64_to_array(identity.kem_identity_key))
    : null;

  if (
    pins.owner_fingerprint &&
    current_owner &&
    pins.owner_fingerprint !== current_owner
  ) {
    return {
      email: pin_id,
      prior_fingerprint: pins.owner_fingerprint,
      new_fingerprint: current_owner,
    };
  }

  if (
    pins.identity_fingerprint &&
    current_kem &&
    pins.identity_fingerprint !== current_kem
  ) {
    return {
      email: pin_id,
      prior_fingerprint: base64_to_hex(pins.identity_fingerprint),
      new_fingerprint: base64_to_hex(current_kem),
    };
  }

  return {
    email: pin_id,
    prior_fingerprint: "",
    new_fingerprint:
      current_owner ?? (current_kem ? base64_to_hex(current_kem) : ""),
  };
}

export async function trust_recipient_identity(email: string): Promise<void> {
  const { pin_id, username } = lookup_parts(email);

  if (!pin_id || !username) return;

  const published = await published_identity(username, pin_id);
  const owner_public_key = await published_owner_key(username, pin_id);

  if (!published && !owner_public_key) {
    throw new KeyPinUnavailableError(pin_id);
  }

  await trust_recipient_keys(
    pin_id,
    published?.binding.kem_identity_key ?? null,
    owner_public_key,
    published?.binding ?? null,
    published?.scoped ?? false,
  );
}
