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
use std::cmp::Ordering;

use chrono::{DateTime, Duration, Utc};
use pgp::composed::{SignedPublicKey, SignedPublicSubKey};
use pgp::crypto::ecc_curve::ECCCurve;
use pgp::crypto::public_key::PublicKeyAlgorithm;
use pgp::packet::{Signature, SignatureType, SubpacketData};
use pgp::types::{EcdhPublicParams, PublicKeyTrait, PublicParams, Tag};

use crate::error::RecipientKeyProblem;

const CLOCK_SKEW_SECONDS: i64 = 300;

const CERTIFICATION_TYPES: [SignatureType; 4] = [
    SignatureType::CertGeneric,
    SignatureType::CertPersona,
    SignatureType::CertCasual,
    SignatureType::CertPositive,
];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum SubkeyState {
    Usable,
    Expired,
    NotYetValid,
    Unusable,
}

pub(crate) fn newest_signature<'a>(
    signatures: impl Iterator<Item = &'a Signature>,
) -> Option<&'a Signature> {
    signatures.max_by_key(|s| s.created().copied())
}

pub(crate) fn binding_expires_at(
    sub: &SignedPublicSubKey,
    binding: &Signature,
) -> Option<DateTime<Utc>> {
    binding
        .key_expiration_time()
        .filter(|duration| !duration.is_zero())
        .map(|duration| *PublicKeyTrait::created_at(&sub.key) + *duration)
}

pub(crate) fn primary_revoked(spk: &SignedPublicKey) -> bool {
    spk.details.revocation_signatures.iter().any(|s| {
        matches!(s.typ(), SignatureType::KeyRevocation) && s.verify_key(&spk.primary_key).is_ok()
    })
}

fn created_in_future(created: &DateTime<Utc>, now: DateTime<Utc>) -> bool {
    *created > now + Duration::seconds(CLOCK_SKEW_SECONDS)
}

fn earliest(a: Option<DateTime<Utc>>, b: Option<DateTime<Utc>>) -> Option<DateTime<Utc>> {
    match (a, b) {
        (Some(a), Some(b)) => Some(a.min(b)),
        (a, b) => a.or(b),
    }
}

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

fn is_encryption_only_algorithm(sub: &SignedPublicSubKey) -> bool {
    matches!(
        PublicKeyTrait::algorithm(&sub.key),
        PublicKeyAlgorithm::ECDH
            | PublicKeyAlgorithm::Elgamal
            | PublicKeyAlgorithm::X25519
            | PublicKeyAlgorithm::X448
    )
}

fn has_key_flags(binding: &Signature) -> bool {
    binding
        .config
        .hashed_subpackets()
        .any(|p| matches!(p.data, SubpacketData::KeyFlags(_)))
}

pub(crate) fn binding_allows_encryption(sub: &SignedPublicSubKey, binding: &Signature) -> bool {
    if !has_key_flags(binding) {
        return is_encryption_only_algorithm(sub);
    }
    let flags = binding.key_flags();
    flags.encrypt_comms() || flags.encrypt_storage()
}

fn encryption_binding<'a>(
    spk: &'a SignedPublicKey,
    sub: &'a SignedPublicSubKey,
) -> Option<&'a Signature> {
    if !PublicKeyTrait::is_encryption_key(&sub.key) || subkey_is_revoked(spk, sub) {
        return None;
    }
    let binding = newest_signature(certified_signatures(spk, sub, SignatureType::SubkeyBinding))?;
    binding_allows_encryption(sub, binding).then_some(binding)
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

fn binding_state(sub: &SignedPublicSubKey, binding: &Signature, now: DateTime<Utc>) -> SubkeyState {
    let Some(signed_at) = binding.created() else {
        return SubkeyState::Unusable;
    };
    if created_in_future(PublicKeyTrait::created_at(&sub.key), now)
        || created_in_future(signed_at, now)
    {
        return SubkeyState::NotYetValid;
    }
    let signature_expired = binding
        .signature_expiration_time()
        .filter(|duration| !duration.is_zero())
        .map(|duration| *signed_at + *duration <= now)
        .unwrap_or(false);
    let key_expired = binding_expires_at(sub, binding)
        .map(|expiry| expiry <= now)
        .unwrap_or(false);
    if signature_expired || key_expired {
        SubkeyState::Expired
    } else {
        SubkeyState::Usable
    }
}

fn subkey_state(spk: &SignedPublicKey, sub: &SignedPublicSubKey, now: DateTime<Utc>) -> SubkeyState {
    if !subkey_algo_is_supported(sub) {
        return SubkeyState::Unusable;
    }
    match encryption_binding(spk, sub) {
        Some(binding) => binding_state(sub, binding, now),
        None => SubkeyState::Unusable,
    }
}

fn verified_self_certifications(spk: &SignedPublicKey) -> impl Iterator<Item = &Signature> {
    let primary = &spk.primary_key;
    spk.details.users.iter().flat_map(move |user| {
        user.signatures.iter().filter(move |s| {
            CERTIFICATION_TYPES.contains(&s.typ())
                && s.verify_certification(primary, Tag::UserId, &user.id)
                    .is_ok()
        })
    })
}

fn self_signature_expires_at(spk: &SignedPublicKey, signature: &Signature) -> Option<DateTime<Utc>> {
    signature
        .key_expiration_time()
        .filter(|duration| !duration.is_zero())
        .map(|duration| *PublicKeyTrait::created_at(&spk.primary_key) + *duration)
}

pub(crate) fn primary_expires_at(spk: &SignedPublicKey) -> Option<DateTime<Utc>> {
    let Some(certification) = newest_signature(verified_self_certifications(spk)) else {
        return spk.expires_at();
    };
    let direct = newest_signature(
        spk.details
            .direct_signatures
            .iter()
            .filter(|s| s.verify_key(&spk.primary_key).is_ok()),
    );
    earliest(
        self_signature_expires_at(spk, certification),
        direct.and_then(|s| self_signature_expires_at(spk, s)),
    )
}

fn primary_problem(spk: &SignedPublicKey, now: DateTime<Utc>) -> Option<RecipientKeyProblem> {
    if primary_revoked(spk) {
        return Some(RecipientKeyProblem::Revoked);
    }
    if created_in_future(PublicKeyTrait::created_at(&spk.primary_key), now) {
        return Some(RecipientKeyProblem::NotYetValid);
    }
    if primary_expires_at(spk)
        .map(|expiry| expiry <= now)
        .unwrap_or(false)
    {
        return Some(RecipientKeyProblem::Expired);
    }
    None
}

fn preferred<'a>(a: &'a SignedPublicSubKey, b: &'a SignedPublicSubKey) -> &'a SignedPublicSubKey {
    let by_age = PublicKeyTrait::created_at(&a.key).cmp(PublicKeyTrait::created_at(&b.key));
    let by_fingerprint = || {
        PublicKeyTrait::fingerprint(&b.key)
            .as_bytes()
            .cmp(PublicKeyTrait::fingerprint(&a.key).as_bytes())
    };
    match by_age.then_with(by_fingerprint) {
        Ordering::Less => b,
        _ => a,
    }
}

fn subkeys_in_state(
    spk: &SignedPublicKey,
    now: DateTime<Utc>,
    wanted: impl Fn(SubkeyState) -> bool,
) -> Vec<&SignedPublicSubKey> {
    spk.public_subkeys
        .iter()
        .filter(|s| wanted(subkey_state(spk, s, now)))
        .collect()
}

fn newest_subkey<'a>(subkeys: Vec<&'a SignedPublicSubKey>) -> Option<&'a SignedPublicSubKey> {
    subkeys.into_iter().reduce(preferred)
}

pub(crate) fn select_encryption_subkey_at(
    spk: &SignedPublicKey,
    now: DateTime<Utc>,
) -> Result<&SignedPublicSubKey, RecipientKeyProblem> {
    if let Some(problem) = primary_problem(spk, now) {
        return Err(problem);
    }
    let states: Vec<SubkeyState> = spk
        .public_subkeys
        .iter()
        .map(|s| subkey_state(spk, s, now))
        .collect();
    if let Some(sub) = newest_subkey(subkeys_in_state(spk, now, |s| s == SubkeyState::Usable)) {
        return Ok(sub);
    }
    if states.contains(&SubkeyState::Expired) {
        Err(RecipientKeyProblem::Expired)
    } else if states.contains(&SubkeyState::NotYetValid) {
        Err(RecipientKeyProblem::NotYetValid)
    } else {
        Err(RecipientKeyProblem::NoEncryptionSubkey)
    }
}

pub(crate) fn select_encryption_subkey(
    spk: &SignedPublicKey,
) -> Result<&SignedPublicSubKey, RecipientKeyProblem> {
    select_encryption_subkey_at(spk, Utc::now())
}

fn claims_encryption_without_verification(sub: &SignedPublicSubKey) -> bool {
    if !PublicKeyTrait::is_encryption_key(&sub.key) {
        return false;
    }
    let bindings = sub
        .signatures
        .iter()
        .filter(|s| s.typ() == SignatureType::SubkeyBinding);
    newest_signature(bindings).is_some_and(|binding| binding_allows_encryption(sub, binding))
}

pub(crate) fn has_unsupported_encryption_subkey(spk: &SignedPublicKey) -> bool {
    spk.public_subkeys
        .iter()
        .filter(|s| !subkey_algo_is_supported(s))
        .any(|s| {
            let verifiable = certified_signatures(spk, s, SignatureType::SubkeyBinding)
                .next()
                .is_some();
            if verifiable {
                encryption_binding(spk, s).is_some()
            } else {
                !subkey_is_revoked(spk, s) && claims_encryption_without_verification(s)
            }
        })
}

pub(crate) fn has_encryption_capable_subkey(spk: &SignedPublicKey) -> bool {
    !subkeys_in_state(spk, Utc::now(), |s| s != SubkeyState::Unusable).is_empty()
}

pub(crate) fn has_valid_encryption_subkey(spk: &SignedPublicKey) -> bool {
    select_encryption_subkey(spk).is_ok()
}

pub(crate) fn encryption_expires_at(spk: &SignedPublicKey) -> Option<DateTime<Utc>> {
    let now = Utc::now();
    let sub = select_encryption_subkey_at(spk, now).ok().or_else(|| {
        newest_subkey(subkeys_in_state(spk, now, |s| s != SubkeyState::Unusable))
    })?;
    let subkey_expiry = encryption_binding(spk, sub).and_then(|b| binding_expires_at(sub, b));
    earliest(primary_expires_at(spk), subkey_expiry)
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
        assert!(select_encryption_subkey(&owner).is_ok());
        assert!(has_valid_encryption_subkey(&owner));
    }

    #[test]
    fn a_subkey_certified_by_another_key_is_never_selected() {
        let mut owner = public("owner");
        owner.public_subkeys = public("other").public_subkeys;
        assert_eq!(
            select_encryption_subkey(&owner).err(),
            Some(RecipientKeyProblem::NoEncryptionSubkey)
        );
        assert!(!has_encryption_capable_subkey(&owner));
        assert!(!has_valid_encryption_subkey(&owner));
    }

    #[test]
    fn a_key_created_in_the_future_is_reported_as_not_yet_valid() {
        let owner = public("owner");
        let created = *PublicKeyTrait::created_at(&owner.primary_key);
        assert_eq!(
            select_encryption_subkey_at(&owner, created - Duration::hours(1)).err(),
            Some(RecipientKeyProblem::NotYetValid)
        );
        assert!(select_encryption_subkey_at(&owner, created - Duration::seconds(60)).is_ok());
    }

    #[test]
    fn the_preferred_subkey_does_not_depend_on_packet_order() {
        let first = public("first");
        let second = public("second");
        let a = &first.public_subkeys[0];
        let b = &second.public_subkeys[0];
        assert!(std::ptr::eq(preferred(a, b), preferred(b, a)));
    }
}
