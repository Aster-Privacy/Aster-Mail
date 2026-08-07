//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
use chrono::{DateTime, Utc};
use pgp::composed::{SignedPublicKey, SignedPublicSubKey};
use pgp::crypto::ecc_curve::ECCCurve;
use pgp::packet::SignatureType;
use pgp::types::{EcdhPublicParams, PublicKeyTrait, PublicParams};

fn subkey_is_revoked(sub: &SignedPublicSubKey) -> bool {
    sub.signatures
        .iter()
        .any(|s| matches!(s.typ(), SignatureType::SubkeyRevocation))
}

fn subkey_allows_encryption(sub: &SignedPublicSubKey) -> bool {
    if !PublicKeyTrait::is_encryption_key(&sub.key) {
        return false;
    }

    let mut saw_non_encrypt_flags = false;
    for sig in sub
        .signatures
        .iter()
        .filter(|s| matches!(s.typ(), SignatureType::SubkeyBinding))
    {
        let flags = sig.key_flags();
        if flags.encrypt_comms() || flags.encrypt_storage() {
            return true;
        }
        if flags.certify() || flags.sign() || flags.authentication() {
            saw_non_encrypt_flags = true;
        }
    }

    !saw_non_encrypt_flags
}

fn subkey_expires_at(sub: &SignedPublicSubKey) -> Option<DateTime<Utc>> {
    let created = *PublicKeyTrait::created_at(&sub.key);
    let duration = sub
        .signatures
        .iter()
        .filter(|s| matches!(s.typ(), SignatureType::SubkeyBinding))
        .filter_map(|s| s.key_expiration_time().copied())
        .max()?;
    Some(created + duration)
}

fn subkey_algo_is_supported(sub: &SignedPublicSubKey) -> bool {
    match sub.key.public_params() {
        PublicParams::ECDH(EcdhPublicParams::Known { curve, .. }) => matches!(
            curve,
            ECCCurve::Curve25519 | ECCCurve::P256 | ECCCurve::P384 | ECCCurve::P521
        ),
        PublicParams::ECDH(EcdhPublicParams::Unsupported { .. }) => false,
        _ => true,
    }
}

fn capable_subkeys(spk: &SignedPublicKey) -> Vec<&SignedPublicSubKey> {
    spk.public_subkeys
        .iter()
        .filter(|s| !subkey_is_revoked(s))
        .filter(|s| subkey_allows_encryption(s))
        .filter(|s| subkey_algo_is_supported(s))
        .collect()
}

pub(crate) fn has_unsupported_encryption_subkey(spk: &SignedPublicKey) -> bool {
    spk.public_subkeys
        .iter()
        .filter(|s| !subkey_is_revoked(s))
        .filter(|s| subkey_allows_encryption(s))
        .any(|s| !subkey_algo_is_supported(s))
}

fn primary_expired(spk: &SignedPublicKey, now: DateTime<Utc>) -> bool {
    spk.expires_at().map(|e| e <= now).unwrap_or(false)
}

pub(crate) fn select_encryption_subkey(spk: &SignedPublicKey) -> Option<&SignedPublicSubKey> {
    let now = Utc::now();
    let candidates = capable_subkeys(spk);
    if candidates.is_empty() {
        return None;
    }

    let created = |s: &SignedPublicSubKey| *PublicKeyTrait::created_at(&s.key);

    if !primary_expired(spk, now) {
        if let Some(valid) = candidates
            .iter()
            .filter(|s| subkey_expires_at(s).map(|e| e > now).unwrap_or(true))
            .max_by_key(|s| created(s))
            .copied()
        {
            return Some(valid);
        }
    }

    candidates.iter().max_by_key(|s| created(s)).copied()
}

pub(crate) fn has_encryption_capable_subkey(spk: &SignedPublicKey) -> bool {
    !capable_subkeys(spk).is_empty()
}

pub(crate) fn has_valid_encryption_subkey(spk: &SignedPublicKey) -> bool {
    let now = Utc::now();
    if primary_expired(spk, now) {
        return false;
    }
    capable_subkeys(spk)
        .iter()
        .any(|s| subkey_expires_at(s).map(|e| e > now).unwrap_or(true))
}

pub(crate) fn encryption_expires_at(spk: &SignedPublicKey) -> Option<DateTime<Utc>> {
    let sub = select_encryption_subkey(spk)?;
    match (spk.expires_at(), subkey_expires_at(sub)) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, b) => b,
    }
}
