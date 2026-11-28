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
import type { EncryptedVault } from "../key_manager_core";

import { verify_ratchet_prekey_bundle_detailed } from "../key_manager_pgp";
import { record_peer_identity_event } from "../ratchet_verification_status";
import {
  bundle_advertises_account_binding,
  HANDSHAKE_DOWNGRADE_ERROR,
  X3DH_VERSION_ACCOUNT_BOUND,
  X3DH_VERSION_ONE_TIME_BOUND,
  type HandshakeBinding,
  type PrekeyBundle,
} from "../x3dh";

import {
  fingerprint_to_hex,
  own_owner_fingerprint,
  owner_fingerprint_bytes,
} from "./bundle_signing";

export function strip_account_binding(bundle: PrekeyBundle): void {
  if (!bundle_advertises_account_binding(bundle)) return;

  bundle.signing_public_key = null;
  bundle.x3dh_max_version = X3DH_VERSION_ONE_TIME_BOUND;
}

export async function account_binding_verdict(
  bundle: PrekeyBundle,
  owner_public_key: string | null,
): Promise<string | null> {
  if (!owner_public_key || !bundle.account_signature) return null;

  const verification = await verify_ratchet_prekey_bundle_detailed(
    bundle.account_signature,
    bundle.kem_identity_key,
    bundle.signed_prekey,
    owner_public_key,
    bundle.pq_kem_public_key ?? null,
    {
      signing_public_key: bundle.signing_public_key ?? "",
      x3dh_max_version: bundle.x3dh_max_version ?? 0,
    },
  );

  return verification.verdict;
}

export async function account_handshake_binding(
  bundle: PrekeyBundle,
  owner_public_key: string | null,
  vault: EncryptedVault,
): Promise<HandshakeBinding | null> {
  if (!owner_public_key || !bundle_advertises_account_binding(bundle)) {
    return null;
  }

  return {
    initiator_fingerprint: await own_owner_fingerprint(vault),
    responder_fingerprint: await owner_fingerprint_bytes(owner_public_key),
  };
}

export function bound_initiator_fields(
  session_binding: Uint8Array | null | undefined,
  binding: HandshakeBinding | null,
): { initiator_fingerprint?: string } {
  return session_binding && binding
    ? {
        initiator_fingerprint: fingerprint_to_hex(
          binding.initiator_fingerprint,
        ),
      }
    : {};
}

export function bound_recipient_fields(
  x3dh_version: number | undefined,
  initiator_fingerprint: string | undefined,
): { ifp?: string } {
  return (x3dh_version ?? 0) >= X3DH_VERSION_ACCOUNT_BOUND &&
    initiator_fingerprint
    ? { ifp: initiator_fingerprint }
    : {};
}

export function same_published_bundle(
  first: PrekeyBundle,
  fresh: PrekeyBundle,
): boolean {
  return (
    first.kem_identity_key === fresh.kem_identity_key &&
    first.signed_prekey === fresh.signed_prekey &&
    first.pq_kem_public_key === fresh.pq_kem_public_key &&
    (first.signing_public_key ?? null) === (fresh.signing_public_key ?? null) &&
    (first.account_signature ?? null) === (fresh.account_signature ?? null) &&
    first.x3dh_max_version === fresh.x3dh_max_version
  );
}

export function note_handshake_downgrade(err: unknown, peer: string): void {
  if (err instanceof Error && err.message === HANDSHAKE_DOWNGRADE_ERROR) {
    record_peer_identity_event(peer, "downgraded");
  }
}
