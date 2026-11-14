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
use pgp::packet::{Signature, SignatureType};
use pgp::types::{EcdhPublicParams, PublicKeyTrait, PublicParams};

fn certified_signatures<'a>(
    spk: &'a SignedPublicKey,
    sub: &'a SignedPublicSubKey,
    typ: SignatureType,
) -> impl Iterator<Item = &'a Signature> {
    sub.signatures
        .iter()
        .filter(move |s| s.typ() == typ)
        .filter(move |s| s.verify_key_binding(&spk.primary_key, &sub.key).is_ok())
}

fn subkey_is_revoked(spk: &SignedPublicKey, sub: &SignedPublicSubKey) -> bool {
    certified_signatures(spk, sub, SignatureType::SubkeyRevocation)
        .next()
        .is_some()
}

fn subkey_allows_encryption(spk: &SignedPublicKey, sub: &SignedPublicSubKey) -> bool {
    PublicKeyTrait::is_encryption_key(&sub.key)
        && bindings_allow_encryption(certified_signatures(spk, sub, SignatureType::SubkeyBinding))
}

fn subkey_claims_encryption(sub: &SignedPublicSubKey) -> bool {
    PublicKeyTrait::is_encryption_key(&sub.key)
        && bindings_allow_encryption(
            sub.signatures
                .iter()
                .filter(|s| s.typ() == SignatureType::SubkeyBinding),
        )
}

fn bindings_allow_encryption<'a>(bindings: impl Iterator<Item = &'a Signature>) -> bool {
    let mut bound = false;
    let mut saw_non_encrypt_flags = false;
    for sig in bindings {
        bound = true;
        let flags = sig.key_flags();
        if flags.encrypt_comms() || flags.encrypt_storage() {
            return true;
        }
        if flags.certify() || flags.sign() || flags.authentication() {
            saw_non_encrypt_flags = true;
        }
    }

    bound && !saw_non_encrypt_flags
}

fn subkey_expires_at(spk: &SignedPublicKey, sub: &SignedPublicSubKey) -> Option<DateTime<Utc>> {
    let created = *PublicKeyTrait::created_at(&sub.key);
    let duration = certified_signatures(spk, sub, SignatureType::SubkeyBinding)
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
        .filter(|s| !subkey_is_revoked(spk, s))
        .filter(|s| subkey_allows_encryption(spk, s))
        .filter(|s| subkey_algo_is_supported(s))
        .collect()
}

pub(crate) fn has_unsupported_encryption_subkey(spk: &SignedPublicKey) -> bool {
    spk.public_subkeys
        .iter()
        .filter(|s| !subkey_is_revoked(spk, s))
        .filter(|s| subkey_claims_encryption(s))
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
            .filter(|s| subkey_expires_at(spk, s).map(|e| e > now).unwrap_or(true))
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
        .any(|s| subkey_expires_at(spk, s).map(|e| e > now).unwrap_or(true))
}

pub(crate) fn encryption_expires_at(spk: &SignedPublicKey) -> Option<DateTime<Utc>> {
    let sub = select_encryption_subkey(spk)?;
    match (spk.expires_at(), subkey_expires_at(spk, sub)) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (Some(a), None) => Some(a),
        (None, b) => b,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::keys::generate_keypair;

    fn public(name: &str) -> SignedPublicKey {
        generate_keypair(name, &format!("{name}@example.com"))
            .unwrap()
            .secret_key()
            .clone()
            .into()
    }

    #[test]
    fn a_subkey_the_primary_key_certified_is_selected() {
        let owner = public("owner");
        assert!(select_encryption_subkey(&owner).is_some());
        assert!(has_valid_encryption_subkey(&owner));
    }

    #[test]
    fn a_subkey_certified_by_another_key_is_never_selected() {
        let mut owner = public("owner");
        owner.public_subkeys = public("other").public_subkeys;
        assert!(select_encryption_subkey(&owner).is_none());
        assert!(!has_encryption_capable_subkey(&owner));
        assert!(!has_valid_encryption_subkey(&owner));
    }

    #[test]
    fn a_revocation_the_primary_key_did_not_make_is_ignored() {
        let mut owner = public("owner");
        let foreign = public("other");
        let mut foreign_binding = foreign.public_subkeys[0].signatures[0].clone();
        foreign_binding.config.typ = SignatureType::SubkeyRevocation;
        owner.public_subkeys[0].signatures.push(foreign_binding);
        assert!(select_encryption_subkey(&owner).is_some());
    }
}
