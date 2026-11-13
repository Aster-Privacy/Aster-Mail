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
use chrono::{DateTime, Utc};
use pgp::composed::{
    Deserializable, SignedKeyDetails, SignedPublicKey, SignedPublicSubKey, StandaloneSignature,
};
use pgp::crypto::ecc_curve::ECCCurve;
use pgp::crypto::hash::HashAlgorithm;
use pgp::crypto::public_key::PublicKeyAlgorithm;
use pgp::packet::SignatureType;
use pgp::ser::Serialize;
use pgp::types::{EcdhPublicParams, KeyVersion, PublicKeyTrait, PublicParams, Tag};

pub const MAX_EXTERNAL_KEY_ARMORED_BYTES: usize = 64 * 1024;
pub const EXTERNAL_CHALLENGE_CONTEXT: &str = "aster-external-pgp-challenge-v1";

const MIN_RSA_BITS: usize = 2048;
const MAX_RSA_BITS: usize = 4096;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ExternalKeyRejection {
    InvalidKey(&'static str),
    UnsupportedAlgorithm,
    KeyExpired,
    KeyRevoked,
    NoEncryptionSubkey,
}

impl ExternalKeyRejection {
    pub fn code(&self) -> &'static str {
        match self {
            ExternalKeyRejection::InvalidKey(_) => "INVALID_KEY",
            ExternalKeyRejection::UnsupportedAlgorithm => "UNSUPPORTED_ALGORITHM",
            ExternalKeyRejection::KeyExpired => "KEY_EXPIRED",
            ExternalKeyRejection::KeyRevoked => "KEY_REVOKED",
            ExternalKeyRejection::NoEncryptionSubkey => "NO_ENCRYPTION_SUBKEY",
        }
    }

    pub fn reason(&self) -> Option<&'static str> {
        match self {
            ExternalKeyRejection::InvalidKey(reason) => Some(reason),
            _ => None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct ExternalKeyProfile {
    pub fingerprint: String,
    pub key_id: String,
    pub algorithm: String,
    pub key_size: i32,
    pub created_at: DateTime<Utc>,
    pub expires_at: Option<DateTime<Utc>>,
    pub verified_emails: Vec<String>,
    pub public_key_binary: Vec<u8>,
    pub public_key_armored: String,
}

impl ExternalKeyProfile {
    pub fn carries_address(&self, email: &str) -> bool {
        let wanted = email.trim().to_lowercase();
        self.verified_emails
            .iter()
            .any(|address| address == &wanted)
    }
}

fn rsa_bits(params: &PublicParams) -> Option<usize> {
    match params {
        PublicParams::RSA { n, .. } => Some(n.as_bytes().len() * 8),
        _ => None,
    }
}

fn rsa_size_allowed(params: &PublicParams) -> bool {
    rsa_bits(params)
        .map(|bits| (MIN_RSA_BITS..=MAX_RSA_BITS).contains(&bits))
        .unwrap_or(false)
}

fn signing_algorithm_allowed(key: &impl PublicKeyTrait) -> bool {
    match (key.algorithm(), key.public_params()) {
        (PublicKeyAlgorithm::RSA, params) => rsa_size_allowed(params),
        (PublicKeyAlgorithm::EdDSALegacy, PublicParams::EdDSALegacy { curve, .. }) => {
            matches!(curve, ECCCurve::Ed25519)
        }
        _ => false,
    }
}

fn subkey_algorithm_allowed(key: &impl PublicKeyTrait) -> bool {
    if signing_algorithm_allowed(key) {
        return true;
    }
    matches!(
        (key.algorithm(), key.public_params()),
        (
            PublicKeyAlgorithm::ECDH,
            PublicParams::ECDH(EcdhPublicParams::Known {
                curve: ECCCurve::Curve25519,
                ..
            })
        )
    )
}

fn strong_hash(hash: HashAlgorithm) -> bool {
    matches!(
        hash,
        HashAlgorithm::SHA2_256
            | HashAlgorithm::SHA2_384
            | HashAlgorithm::SHA2_512
            | HashAlgorithm::SHA3_256
            | HashAlgorithm::SHA3_512
    )
}

fn binding_signatures(sub: &SignedPublicSubKey) -> impl Iterator<Item = &pgp::packet::Signature> {
    sub.signatures
        .iter()
        .filter(|s| matches!(s.typ(), SignatureType::SubkeyBinding) && strong_hash(s.hash_alg()))
}

fn subkey_bound(spk: &SignedPublicKey, sub: &SignedPublicSubKey) -> bool {
    binding_signatures(sub).any(|s| s.verify_key_binding(&spk.primary_key, &sub.key).is_ok())
}

fn subkey_weakly_bound(spk: &SignedPublicKey, sub: &SignedPublicSubKey) -> bool {
    sub.signatures.iter().any(|s| {
        matches!(s.typ(), SignatureType::SubkeyBinding)
            && !strong_hash(s.hash_alg())
            && s.verify_key_binding(&spk.primary_key, &sub.key).is_ok()
    })
}

fn verified_bindings<'a>(
    spk: &'a SignedPublicKey,
    sub: &'a SignedPublicSubKey,
) -> impl Iterator<Item = &'a pgp::packet::Signature> {
    binding_signatures(sub)
        .filter(move |s| s.verify_key_binding(&spk.primary_key, &sub.key).is_ok())
}

fn subkey_signs(spk: &SignedPublicKey, sub: &SignedPublicSubKey) -> bool {
    let newest = verified_bindings(spk, sub).max_by_key(|s| s.created().copied());
    newest
        .map(|s| s.key_flags().sign() && crate::sign::binding_has_backsig(spk, sub, s))
        .unwrap_or(false)
        && signing_algorithm_allowed(&sub.key)
}

fn subkey_revoked(spk: &SignedPublicKey, sub: &SignedPublicSubKey) -> bool {
    sub.signatures.iter().any(|s| {
        matches!(s.typ(), SignatureType::SubkeyRevocation)
            && s.verify_key_binding(&spk.primary_key, &sub.key).is_ok()
    })
}

fn subkey_expired(spk: &SignedPublicKey, sub: &SignedPublicSubKey, now: DateTime<Utc>) -> bool {
    let created = *PublicKeyTrait::created_at(&sub.key);
    verified_bindings(spk, sub)
        .max_by_key(|s| s.created().copied())
        .and_then(|s| s.key_expiration_time().copied())
        .filter(|duration| !duration.is_zero())
        .map(|duration| created + duration <= now)
        .unwrap_or(false)
}

fn subkey_expires_at(spk: &SignedPublicKey, sub: &SignedPublicSubKey) -> Option<DateTime<Utc>> {
    let created = *PublicKeyTrait::created_at(&sub.key);
    verified_bindings(spk, sub)
        .max_by_key(|s| s.created().copied())
        .and_then(|s| s.key_expiration_time().copied())
        .filter(|duration| !duration.is_zero())
        .map(|duration| created + duration)
}

fn effective_expiry(
    primary: Option<DateTime<Utc>>,
    encryption: Option<DateTime<Utc>>,
) -> Option<DateTime<Utc>> {
    match (primary, encryption) {
        (Some(p), Some(e)) => Some(p.min(e)),
        (p, e) => p.or(e),
    }
}

fn subkey_encrypts(spk: &SignedPublicKey, sub: &SignedPublicSubKey) -> bool {
    if !PublicKeyTrait::is_encryption_key(&sub.key) {
        return false;
    }

    let Some(newest) = verified_bindings(spk, sub).max_by_key(|s| s.created().copied()) else {
        return false;
    };
    let flags = newest.key_flags();
    if flags.encrypt_comms() || flags.encrypt_storage() {
        return true;
    }

    !(flags.certify() || flags.sign() || flags.authentication())
}

fn primary_revoked(spk: &SignedPublicKey) -> bool {
    spk.details.revocation_signatures.iter().any(|s| {
        matches!(s.typ(), SignatureType::KeyRevocation) && s.verify_key(&spk.primary_key).is_ok()
    })
}

fn email_from_user_id(user_id: &str) -> Option<String> {
    let candidate = match (user_id.rfind('<'), user_id.rfind('>')) {
        (Some(open), Some(close)) if open < close => &user_id[open + 1..close],
        _ => user_id,
    };
    let email = candidate.trim().to_lowercase();
    let (local, domain) = email.split_once('@')?;

    if local.is_empty()
        || domain.is_empty()
        || domain.contains('@')
        || email.chars().any(|c| c.is_whitespace() || c.is_control())
    {
        return None;
    }

    Some(email)
}

const CERTIFICATION_TYPES: [SignatureType; 4] = [
    SignatureType::CertGeneric,
    SignatureType::CertPersona,
    SignatureType::CertCasual,
    SignatureType::CertPositive,
];

fn self_signed_user(
    spk: &SignedPublicKey,
    user: &pgp::types::SignedUser,
    types: &[SignatureType],
    strong_only: bool,
) -> bool {
    user.signatures.iter().any(|signature| {
        types.contains(&signature.typ())
            && (!strong_only || strong_hash(signature.hash_alg()))
            && signature
                .verify_certification(&spk.primary_key, Tag::UserId, &user.id)
                .is_ok()
    })
}

fn user_certified(spk: &SignedPublicKey, user: &pgp::types::SignedUser) -> bool {
    self_signed_user(spk, user, &CERTIFICATION_TYPES, true)
        && !self_signed_user(spk, user, &[SignatureType::CertRevocation], false)
}

fn any_weak_user_certification(spk: &SignedPublicKey) -> bool {
    spk.details
        .users
        .iter()
        .any(|user| self_signed_user(spk, user, &CERTIFICATION_TYPES, false))
}

fn verified_user_id_emails(spk: &SignedPublicKey) -> (bool, Vec<String>) {
    let mut any_verified = false;
    let mut emails: Vec<String> = Vec::new();

    for user in &spk.details.users {
        let certified = user_certified(spk, user);

        if !certified {
            continue;
        }

        any_verified = true;
        let raw = String::from_utf8_lossy(user.id.id()).to_string();
        if let Some(email) = email_from_user_id(&raw) {
            if !emails.contains(&email) {
                emails.push(email);
            }
        }
    }

    (any_verified, emails)
}

fn algorithm_label(key: &impl PublicKeyTrait) -> (String, i32) {
    match key.public_params() {
        PublicParams::RSA { n, .. } => {
            let bits = (n.as_bytes().len() * 8) as i32;
            (format!("rsa{bits}"), bits)
        }
        _ => ("ed25519".to_string(), 256),
    }
}

fn parse_external_key(armored: &str) -> Result<SignedPublicKey, ExternalKeyRejection> {
    let trimmed = armored.trim();

    if trimmed.is_empty() {
        return Err(ExternalKeyRejection::InvalidKey("empty"));
    }

    if trimmed.len() > MAX_EXTERNAL_KEY_ARMORED_BYTES {
        return Err(ExternalKeyRejection::InvalidKey("too_large"));
    }

    if trimmed.contains("PRIVATE KEY BLOCK") {
        return Err(ExternalKeyRejection::InvalidKey("secret_key_material"));
    }

    if !trimmed.starts_with("-----BEGIN PGP PUBLIC KEY BLOCK-----") {
        return Err(ExternalKeyRejection::InvalidKey("not_armored"));
    }

    let (spk, _) = SignedPublicKey::from_string(trimmed)
        .map_err(|_| ExternalKeyRejection::InvalidKey("unparseable"))?;

    Ok(spk)
}

pub fn external_key_user_id_emails(armored: &str) -> Vec<String> {
    parse_external_key(armored)
        .map(|spk| verified_user_id_emails(&spk).1)
        .unwrap_or_default()
}

pub fn validate_external_key(armored: &str) -> Result<ExternalKeyProfile, ExternalKeyRejection> {
    validate_external_key_at(armored, Utc::now())
}

fn canonical_certificate(spk: &SignedPublicKey) -> SignedPublicKey {
    let primary = &spk.primary_key;

    let revocation_signatures = spk
        .details
        .revocation_signatures
        .iter()
        .filter(|s| {
            matches!(s.typ(), SignatureType::KeyRevocation) && s.verify_key(primary).is_ok()
        })
        .cloned()
        .collect();

    let direct_signatures = spk
        .details
        .direct_signatures
        .iter()
        .filter(|s| strong_hash(s.hash_alg()) && s.verify_key(primary).is_ok())
        .cloned()
        .collect();

    let users = spk
        .details
        .users
        .iter()
        .filter(|user| self_signed_user(spk, user, &CERTIFICATION_TYPES, true))
        .map(|user| {
            let signatures = user
                .signatures
                .iter()
                .filter(|s| {
                    let wanted = (CERTIFICATION_TYPES.contains(&s.typ())
                        && strong_hash(s.hash_alg()))
                        || matches!(s.typ(), SignatureType::CertRevocation);
                    wanted
                        && s.verify_certification(primary, Tag::UserId, &user.id)
                            .is_ok()
                })
                .cloned()
                .collect();
            pgp::types::SignedUser::new(user.id.clone(), signatures)
        })
        .collect();

    let subkeys = spk
        .public_subkeys
        .iter()
        .filter(|sub| subkey_bound(spk, sub))
        .map(|sub| {
            let signatures = sub
                .signatures
                .iter()
                .filter(|s| {
                    let wanted = (matches!(s.typ(), SignatureType::SubkeyBinding)
                        && strong_hash(s.hash_alg()))
                        || matches!(s.typ(), SignatureType::SubkeyRevocation);
                    wanted && s.verify_key_binding(primary, &sub.key).is_ok()
                })
                .cloned()
                .collect();
            SignedPublicSubKey::new(sub.key.clone(), signatures)
        })
        .collect();

    SignedPublicKey::new(
        primary.clone(),
        SignedKeyDetails::new(revocation_signatures, direct_signatures, users, Vec::new()),
        subkeys,
    )
}

pub fn validate_external_key_at(
    armored: &str,
    now: DateTime<Utc>,
) -> Result<ExternalKeyProfile, ExternalKeyRejection> {
    let parsed = parse_external_key(armored)?;

    if parsed.primary_key.version() != KeyVersion::V4
        || !signing_algorithm_allowed(&parsed.primary_key)
    {
        return Err(ExternalKeyRejection::UnsupportedAlgorithm);
    }

    if primary_revoked(&parsed) {
        return Err(ExternalKeyRejection::KeyRevoked);
    }

    let spk = canonical_certificate(&parsed);
    let primary = &spk.primary_key;

    let (any_verified, verified_emails) = verified_user_id_emails(&spk);
    if !any_verified {
        if any_weak_user_certification(&parsed) {
            return Err(ExternalKeyRejection::InvalidKey("weak_self_signature"));
        }
        return Err(ExternalKeyRejection::InvalidKey("no_valid_user_id"));
    }

    let expires_at = spk.expires_at();
    if expires_at.map(|e| e <= now).unwrap_or(false) {
        return Err(ExternalKeyRejection::KeyExpired);
    }

    let bound: Vec<&SignedPublicSubKey> = spk
        .public_subkeys
        .iter()
        .filter(|sub| subkey_bound(&spk, sub) && !subkey_revoked(&spk, sub))
        .collect();

    let live: Vec<&SignedPublicSubKey> = bound
        .iter()
        .copied()
        .filter(|sub| !subkey_expired(&spk, sub, now))
        .collect();

    if live
        .iter()
        .any(|sub| sub.key.version() != KeyVersion::V4 || !subkey_algorithm_allowed(&sub.key))
    {
        return Err(ExternalKeyRejection::UnsupportedAlgorithm);
    }

    if !live.iter().any(|sub| subkey_encrypts(&spk, sub)) {
        if bound.iter().any(|sub| subkey_encrypts(&spk, sub)) {
            return Err(ExternalKeyRejection::KeyExpired);
        }
        if parsed
            .public_subkeys
            .iter()
            .any(|sub| !subkey_bound(&parsed, sub) && subkey_weakly_bound(&parsed, sub))
        {
            return Err(ExternalKeyRejection::InvalidKey("weak_self_signature"));
        }
        return Err(ExternalKeyRejection::NoEncryptionSubkey);
    }

    let encryption_expires_at = live
        .iter()
        .filter(|sub| subkey_encrypts(&spk, sub))
        .map(|sub| subkey_expires_at(&spk, sub))
        .try_fold(None, |latest: Option<DateTime<Utc>>, expiry| {
            expiry.map(|e| Some(latest.map_or(e, |l| l.max(e))))
        })
        .flatten();
    let expires_at = effective_expiry(expires_at, encryption_expires_at);

    let public_key_binary = spk
        .to_bytes()
        .map_err(|_| ExternalKeyRejection::InvalidKey("unserializable"))?;
    let public_key_armored = spk
        .to_armored_string(Default::default())
        .map_err(|_| ExternalKeyRejection::InvalidKey("unserializable"))?;
    let (algorithm, key_size) = algorithm_label(primary);

    Ok(ExternalKeyProfile {
        fingerprint: hex::encode(PublicKeyTrait::fingerprint(primary).as_bytes()),
        key_id: hex::encode(PublicKeyTrait::key_id(primary).as_ref()),
        algorithm,
        key_size,
        created_at: *PublicKeyTrait::created_at(primary),
        expires_at,
        verified_emails,
        public_key_binary,
        public_key_armored,
    })
}

#[derive(Debug, Clone)]
pub struct RevokedExternalKey {
    pub fingerprint: String,
    pub public_key_binary: Vec<u8>,
    pub public_key_armored: String,
}

pub fn revoked_external_key(armored: &str) -> Option<RevokedExternalKey> {
    let parsed = parse_external_key(armored).ok()?;
    if parsed.primary_key.version() != KeyVersion::V4 || !primary_revoked(&parsed) {
        return None;
    }
    let spk = canonical_certificate(&parsed);
    Some(RevokedExternalKey {
        fingerprint: hex::encode(PublicKeyTrait::fingerprint(&spk.primary_key).as_bytes()),
        public_key_binary: spk.to_bytes().ok()?,
        public_key_armored: spk.to_armored_string(Default::default()).ok()?,
    })
}

pub fn external_challenge_message(user_id: &str, challenge_b64: &str) -> Vec<u8> {
    format!(
        "{}:{}:{}",
        EXTERNAL_CHALLENGE_CONTEXT,
        user_id.trim().to_lowercase(),
        challenge_b64
    )
    .into_bytes()
}

fn parse_detached_signature(signature: &str) -> Option<StandaloneSignature> {
    let trimmed = signature.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_EXTERNAL_KEY_ARMORED_BYTES {
        return None;
    }
    StandaloneSignature::from_string(trimmed)
        .ok()
        .map(|(sig, _)| sig)
}

fn primary_signs(spk: &SignedPublicKey) -> bool {
    let flags: Vec<_> = spk
        .details
        .users
        .iter()
        .flat_map(|user| user.signatures.iter())
        .filter(|s| CERTIFICATION_TYPES.contains(&s.typ()))
        .chain(spk.details.direct_signatures.iter())
        .map(|s| s.key_flags())
        .collect();

    let any_flags = flags.iter().any(|f| {
        f.sign() || f.certify() || f.encrypt_comms() || f.encrypt_storage() || f.authentication()
    });

    !any_flags || flags.iter().any(|f| f.sign())
}

pub fn verify_external_challenge(
    armored_key: &str,
    user_id: &str,
    challenge_b64: &str,
    signature_armored: &str,
) -> bool {
    verify_external_challenge_at(
        armored_key,
        user_id,
        challenge_b64,
        signature_armored,
        Utc::now(),
    )
}

pub fn verify_external_challenge_at(
    armored_key: &str,
    user_id: &str,
    challenge_b64: &str,
    signature_armored: &str,
    now: DateTime<Utc>,
) -> bool {
    let Some(standalone) = parse_detached_signature(signature_armored) else {
        return false;
    };

    let signature = &standalone.signature;

    if signature.typ() != SignatureType::Binary || !strong_hash(signature.hash_alg()) {
        return false;
    }

    let Ok(parsed) = parse_external_key(armored_key) else {
        return false;
    };

    if primary_revoked(&parsed) {
        return false;
    }

    let spk = canonical_certificate(&parsed);

    if spk.expires_at().map(|e| e <= now).unwrap_or(false) {
        return false;
    }

    let message = external_challenge_message(user_id, challenge_b64);

    if primary_signs(&spk) && signature.verify(&spk.primary_key, &message[..]).is_ok() {
        return true;
    }

    spk.public_subkeys
        .iter()
        .filter(|sub| {
            !subkey_revoked(&spk, sub) && !subkey_expired(&spk, sub, now) && subkey_signs(&spk, sub)
        })
        .any(|sub| signature.verify(&sub.key, &message[..]).is_ok())
}

#[cfg(test)]
pub(crate) mod test_support {
    use super::*;
    use chrono::SubsecRound;
    use pgp::composed::{
        KeyType, Message, SecretKeyParamsBuilder, SignedSecretKey, SubkeyParamsBuilder,
    };
    use pgp::packet::{PacketTrait, SignatureConfig, Subpacket, SubpacketData};
    use pgp::types::SecretKeyTrait;
    use rand::rngs::OsRng;

    pub fn build(
        primary: KeyType,
        subkey: Option<KeyType>,
        expiration: Option<std::time::Duration>,
        created_at: Option<DateTime<Utc>>,
    ) -> SignedSecretKey {
        let mut builder = SecretKeyParamsBuilder::default();
        builder
            .key_type(primary)
            .can_certify(true)
            .can_sign(true)
            .primary_user_id("Outside Owner <owner@astermail.org>".into())
            .expiration(expiration);
        if let Some(created) = created_at {
            builder.created_at(created);
        }
        if let Some(sub) = subkey {
            let mut sub_builder = SubkeyParamsBuilder::default();
            sub_builder.key_type(sub).can_encrypt(true);
            if let Some(created) = created_at {
                sub_builder.created_at(created);
            }
            builder.subkey(sub_builder.build().unwrap());
        }
        builder
            .build()
            .unwrap()
            .generate(OsRng)
            .unwrap()
            .sign(OsRng, || "".to_string())
            .unwrap()
    }

    pub fn armored_public(secret: &SignedSecretKey) -> String {
        let public = secret
            .public_key()
            .sign(OsRng, secret, || "".to_string())
            .unwrap();
        public.to_armored_string(Default::default()).unwrap()
    }

    pub fn armored_public_expiring(secret: &SignedSecretKey, lifetime: chrono::Duration) -> String {
        let mut public = secret
            .public_key()
            .sign(OsRng, secret, || "".to_string())
            .unwrap();
        let user = public.details.users.first_mut().unwrap();
        let mut config = SignatureConfig::v4(
            SignatureType::CertGeneric,
            secret.algorithm(),
            secret.hash_alg(),
        );
        config.hashed_subpackets = vec![
            Subpacket::regular(SubpacketData::SignatureCreationTime(
                Utc::now().trunc_subsecs(0),
            )),
            Subpacket::regular(SubpacketData::KeyExpirationTime(lifetime)),
            Subpacket::regular(SubpacketData::IssuerFingerprint(secret.fingerprint())),
        ];
        config.unhashed_subpackets =
            vec![Subpacket::regular(SubpacketData::Issuer(secret.key_id()))];
        let signature = config
            .sign_certification(secret, || "".to_string(), user.id.tag(), &user.id)
            .unwrap();
        user.signatures.push(signature);
        public.to_armored_string(Default::default()).unwrap()
    }

    pub fn armored_public_revoked(secret: &SignedSecretKey) -> String {
        let mut public = secret
            .public_key()
            .sign(OsRng, secret, || "".to_string())
            .unwrap();
        let mut config = SignatureConfig::v4(
            SignatureType::KeyRevocation,
            secret.algorithm(),
            secret.hash_alg(),
        );
        config.hashed_subpackets = vec![
            Subpacket::regular(SubpacketData::SignatureCreationTime(
                Utc::now().trunc_subsecs(0),
            )),
            Subpacket::regular(SubpacketData::IssuerFingerprint(secret.fingerprint())),
        ];
        config.unhashed_subpackets =
            vec![Subpacket::regular(SubpacketData::Issuer(secret.key_id()))];
        let signature = config
            .sign_key(secret, || "".to_string(), &public.primary_key)
            .unwrap();
        public.details.revocation_signatures.push(signature);
        public.to_armored_string(Default::default()).unwrap()
    }

    pub fn sign_challenge(secret: &impl SecretKeyTrait, user_id: &str, challenge: &str) -> String {
        Message::new_literal_bytes("", &external_challenge_message(user_id, challenge))
            .sign(OsRng, secret, || "".to_string(), HashAlgorithm::SHA2_256)
            .unwrap()
            .into_signature()
            .to_armored_string(Default::default())
            .unwrap()
    }

    pub fn with_signing_subkey() -> SignedSecretKey {
        let mut encrypt = SubkeyParamsBuilder::default();
        encrypt
            .key_type(KeyType::ECDH(ECCCurve::Curve25519))
            .can_encrypt(true);
        let mut sign = SubkeyParamsBuilder::default();
        sign.key_type(KeyType::EdDSALegacy).can_sign(true);
        SecretKeyParamsBuilder::default()
            .key_type(KeyType::EdDSALegacy)
            .can_certify(true)
            .can_sign(false)
            .primary_user_id("Outside Owner <owner@astermail.org>".into())
            .subkey(encrypt.build().unwrap())
            .subkey(sign.build().unwrap())
            .build()
            .unwrap()
            .generate(OsRng)
            .unwrap()
            .sign(OsRng, || "".to_string())
            .unwrap()
    }

    pub fn signed_public(secret: &SignedSecretKey) -> SignedPublicKey {
        secret
            .public_key()
            .sign(OsRng, secret, || "".to_string())
            .unwrap()
    }

    pub fn sha1_certified_rsa() -> String {
        let secret = build(
            KeyType::Rsa(2048),
            Some(KeyType::ECDH(ECCCurve::Curve25519)),
            None,
            None,
        );
        let mut public = signed_public(&secret);
        let user = public.details.users.first_mut().unwrap();
        let mut config = SignatureConfig::v4(
            SignatureType::CertPositive,
            secret.algorithm(),
            HashAlgorithm::SHA1,
        );
        config.hashed_subpackets = vec![
            Subpacket::regular(SubpacketData::SignatureCreationTime(
                Utc::now().trunc_subsecs(0),
            )),
            Subpacket::regular(SubpacketData::IssuerFingerprint(secret.fingerprint())),
        ];
        config.unhashed_subpackets =
            vec![Subpacket::regular(SubpacketData::Issuer(secret.key_id()))];
        let signature = config
            .sign_certification(&secret, || "".to_string(), user.id.tag(), &user.id)
            .unwrap();
        user.signatures = vec![signature];
        public.to_armored_string(Default::default()).unwrap()
    }

    pub fn sha1_bound_subkey_rsa() -> String {
        let secret = build(
            KeyType::Rsa(2048),
            Some(KeyType::ECDH(ECCCurve::Curve25519)),
            None,
            None,
        );
        let mut public = signed_public(&secret);
        let sub = public.public_subkeys.first_mut().unwrap();
        let mut config = SignatureConfig::v4(
            SignatureType::SubkeyBinding,
            secret.algorithm(),
            HashAlgorithm::SHA1,
        );
        config.hashed_subpackets = vec![
            Subpacket::regular(SubpacketData::SignatureCreationTime(
                Utc::now().trunc_subsecs(0),
            )),
            Subpacket::regular(SubpacketData::IssuerFingerprint(secret.fingerprint())),
        ];
        config.unhashed_subpackets =
            vec![Subpacket::regular(SubpacketData::Issuer(secret.key_id()))];
        let signature = config
            .sign_key_binding(&secret, || "".to_string(), &sub.key)
            .unwrap();
        sub.signatures = vec![signature];
        public.to_armored_string(Default::default()).unwrap()
    }

    pub fn modern() -> SignedSecretKey {
        build(
            KeyType::EdDSALegacy,
            Some(KeyType::ECDH(ECCCurve::Curve25519)),
            None,
            None,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::test_support::*;
    use super::*;
    use pgp::composed::{KeyType, Message};
    use pgp::types::SecretKeyTrait;
    use rand::rngs::OsRng;

    const USER_ID: &str = "7F3C2B9A-1111-4222-8333-944455556666";
    const CHALLENGE: &str = "q83vEjRWeJASNFZ4kBI0VniQEjRWeJASNFZ4kBI0Vng=";

    #[test]
    fn effective_expiry_takes_the_earlier_date() {
        let early = Utc::now() + chrono::Duration::days(10);
        let late = Utc::now() + chrono::Duration::days(400);
        assert_eq!(effective_expiry(Some(late), Some(early)), Some(early));
        assert_eq!(effective_expiry(None, Some(early)), Some(early));
        assert_eq!(effective_expiry(Some(late), None), Some(late));
        assert_eq!(effective_expiry(None, None), None);
    }

    #[test]
    fn accepts_a_legacy_curve25519_key() {
        let secret = modern();
        let profile = validate_external_key(&armored_public(&secret)).unwrap();

        assert_eq!(profile.fingerprint.len(), 40);
        assert_eq!(profile.key_id.len(), 16);
        assert_eq!(profile.algorithm, "ed25519");
        assert!(profile.carries_address("Owner@AsterMail.org"));
        assert!(!profile.carries_address("someone@astermail.org"));
    }

    #[test]
    fn accepts_an_rsa_3072_key() {
        let secret = build(KeyType::Rsa(3072), Some(KeyType::Rsa(3072)), None, None);
        let profile = validate_external_key(&armored_public(&secret)).unwrap();

        assert_eq!(profile.algorithm, "rsa3072");
        assert_eq!(profile.key_size, 3072);
    }

    #[test]
    fn rejects_nist_curves() {
        let secret = build(
            KeyType::ECDSA(ECCCurve::P256),
            Some(KeyType::ECDH(ECCCurve::P256)),
            None,
            None,
        );
        assert_eq!(
            validate_external_key(&armored_public(&secret)).unwrap_err(),
            ExternalKeyRejection::UnsupportedAlgorithm
        );
    }

    #[test]
    fn rejects_a_nist_encryption_subkey() {
        let secret = build(
            KeyType::EdDSALegacy,
            Some(KeyType::ECDH(ECCCurve::P256)),
            None,
            None,
        );
        assert_eq!(
            validate_external_key(&armored_public(&secret)).unwrap_err(),
            ExternalKeyRejection::UnsupportedAlgorithm
        );
    }

    #[test]
    fn rejects_modern_algorithm_ids_on_v4() {
        let secret = build(KeyType::EdDSALegacy, Some(KeyType::X25519), None, None);
        assert_eq!(
            validate_external_key(&armored_public(&secret)).unwrap_err(),
            ExternalKeyRejection::UnsupportedAlgorithm
        );
    }

    #[test]
    fn rejects_a_key_with_no_encryption_subkey() {
        let secret = build(KeyType::EdDSALegacy, None, None, None);
        assert_eq!(
            validate_external_key(&armored_public(&secret)).unwrap_err(),
            ExternalKeyRejection::NoEncryptionSubkey
        );
    }

    #[test]
    fn rejects_an_expired_key() {
        let created = Utc::now() - chrono::Duration::days(10);
        let secret = build(
            KeyType::EdDSALegacy,
            Some(KeyType::ECDH(ECCCurve::Curve25519)),
            None,
            Some(created),
        );
        assert_eq!(
            validate_external_key(&armored_public_expiring(&secret, chrono::Duration::days(1)))
                .unwrap_err(),
            ExternalKeyRejection::KeyExpired
        );
    }

    #[test]
    fn rejects_secret_material_and_garbage() {
        let secret = modern();
        let armored_secret = secret.to_armored_string(Default::default()).unwrap();
        assert_eq!(
            validate_external_key(&armored_secret).unwrap_err(),
            ExternalKeyRejection::InvalidKey("secret_key_material")
        );
        assert_eq!(
            validate_external_key("not a key").unwrap_err(),
            ExternalKeyRejection::InvalidKey("not_armored")
        );
        let oversized = format!(
            "-----BEGIN PGP PUBLIC KEY BLOCK-----\n{}",
            "A".repeat(MAX_EXTERNAL_KEY_ARMORED_BYTES)
        );
        assert_eq!(
            validate_external_key(&oversized).unwrap_err(),
            ExternalKeyRejection::InvalidKey("too_large")
        );
    }

    #[test]
    fn verifies_the_challenge_signature() {
        let secret = modern();
        let armored = armored_public(&secret);
        let signature = sign_challenge(&secret, USER_ID, CHALLENGE);

        assert!(verify_external_challenge(
            &armored, USER_ID, CHALLENGE, &signature
        ));
        assert!(verify_external_challenge(
            &armored,
            &USER_ID.to_lowercase(),
            CHALLENGE,
            &signature
        ));
    }

    #[test]
    fn rejects_a_challenge_signature_over_other_data() {
        let secret = modern();
        let armored = armored_public(&secret);
        let other_user = sign_challenge(&secret, "00000000-0000-0000-0000-000000000000", CHALLENGE);
        let other_challenge = sign_challenge(&secret, USER_ID, "AAAA");

        assert!(!verify_external_challenge(
            &armored,
            USER_ID,
            CHALLENGE,
            &other_user
        ));
        assert!(!verify_external_challenge(
            &armored,
            USER_ID,
            CHALLENGE,
            &other_challenge
        ));
        assert!(!verify_external_challenge(
            &armored, USER_ID, CHALLENGE, "garbage"
        ));
    }

    #[test]
    fn rejects_a_challenge_signed_by_another_key() {
        let secret = modern();
        let stranger = modern();
        let signature = sign_challenge(&stranger, USER_ID, CHALLENGE);

        assert!(!verify_external_challenge(
            &armored_public(&secret),
            USER_ID,
            CHALLENGE,
            &signature
        ));
    }

    #[test]
    fn rejects_a_challenge_signed_by_an_appended_foreign_subkey() {
        let victim = modern();
        let attacker = with_signing_subkey();
        let mut forged = signed_public(&victim);
        let foreign = signed_public(&attacker).public_subkeys[1].clone();
        forged.public_subkeys.push(foreign);
        let forged_armored = forged.to_armored_string(Default::default()).unwrap();

        let signature = sign_challenge(&attacker.secret_subkeys[1], USER_ID, CHALLENGE);

        assert!(!verify_external_challenge(
            &forged_armored,
            USER_ID,
            CHALLENGE,
            &signature
        ));
    }

    #[test]
    fn accepts_a_challenge_signed_by_a_bound_signing_subkey() {
        let secret = with_signing_subkey();
        let armored = crate::sign::subkey_fixtures::public_with_signing_subkey(&secret, true)
            .to_armored_string(Default::default())
            .unwrap();
        let by_subkey = sign_challenge(&secret.secret_subkeys[1], USER_ID, CHALLENGE);
        let by_certify_only_primary = sign_challenge(&secret, USER_ID, CHALLENGE);

        assert!(validate_external_key(&armored).is_ok());
        assert!(verify_external_challenge(
            &armored, USER_ID, CHALLENGE, &by_subkey
        ));
        assert!(!verify_external_challenge(
            &armored,
            USER_ID,
            CHALLENGE,
            &by_certify_only_primary
        ));
    }

    #[test]
    fn rejects_a_challenge_signed_by_a_subkey_without_backsig() {
        let secret = with_signing_subkey();
        let armored = crate::sign::subkey_fixtures::public_with_signing_subkey(&secret, false)
            .to_armored_string(Default::default())
            .unwrap();
        let by_subkey = sign_challenge(&secret.secret_subkeys[1], USER_ID, CHALLENGE);

        assert!(!verify_external_challenge(
            &armored, USER_ID, CHALLENGE, &by_subkey
        ));
    }

    #[test]
    fn stores_a_canonical_certificate_without_foreign_packets() {
        let victim = modern();
        let attacker = with_signing_subkey();
        let mut forged = signed_public(&victim);
        forged
            .public_subkeys
            .push(signed_public(&attacker).public_subkeys[1].clone());
        let trailing = armored_public(&attacker);
        let input = format!(
            "{}
{}",
            forged.to_armored_string(Default::default()).unwrap(),
            trailing
        );

        let profile = validate_external_key(&input).unwrap();
        let (stored, _) = SignedPublicKey::from_string(&profile.public_key_armored).unwrap();

        assert_eq!(stored.public_subkeys.len(), 1);
        assert_eq!(
            hex::encode(PublicKeyTrait::fingerprint(&stored.primary_key).as_bytes()),
            profile.fingerprint
        );
        assert!(!profile.public_key_armored.contains(trailing.trim()));
        assert_eq!(stored.to_bytes().unwrap(), profile.public_key_binary);
    }

    #[test]
    fn rejects_a_weak_user_id_self_signature() {
        assert_eq!(
            validate_external_key(&sha1_certified_rsa()).unwrap_err(),
            ExternalKeyRejection::InvalidKey("weak_self_signature")
        );
    }

    #[test]
    fn rejects_a_weak_subkey_binding() {
        assert_eq!(
            validate_external_key(&sha1_bound_subkey_rsa()).unwrap_err(),
            ExternalKeyRejection::InvalidKey("weak_self_signature")
        );
    }

    #[test]
    fn rejects_a_sha224_challenge_signature() {
        let secret = modern();
        let signature =
            Message::new_literal_bytes("", &external_challenge_message(USER_ID, CHALLENGE))
                .sign(OsRng, &secret, || "".to_string(), HashAlgorithm::SHA2_224)
                .unwrap()
                .into_signature()
                .to_armored_string(Default::default())
                .unwrap();

        assert!(!verify_external_challenge(
            &armored_public(&secret),
            USER_ID,
            CHALLENGE,
            &signature
        ));
    }

    #[test]
    fn challenge_message_matches_the_contract() {
        assert_eq!(
            external_challenge_message("ABC-def", "Zm9v"),
            b"aster-external-pgp-challenge-v1:abc-def:Zm9v".to_vec()
        );
    }
    #[test]
    fn rejects_a_revoked_key_but_reports_its_fingerprint() {
        let secret = modern();
        let revoked = armored_public_revoked(&secret);
        let live = validate_external_key(&armored_public(&secret)).unwrap();

        assert_eq!(
            validate_external_key(&revoked).unwrap_err(),
            ExternalKeyRejection::KeyRevoked
        );
        let parsed = revoked_external_key(&revoked).unwrap();
        assert_eq!(parsed.fingerprint, live.fingerprint);
        assert!(revoked_external_key(&parsed.public_key_armored).is_some());
        assert!(revoked_external_key(&armored_public(&secret)).is_none());
    }

    #[test]
    fn ignores_a_revocation_made_by_another_key() {
        let secret = modern();
        let other = modern();
        let mut public = secret
            .public_key()
            .sign(OsRng, &secret, || "".to_string())
            .unwrap();
        let (forged, _) = SignedPublicKey::from_string(&armored_public_revoked(&other)).unwrap();
        public
            .details
            .revocation_signatures
            .extend(forged.details.revocation_signatures);
        let armored = public.to_armored_string(Default::default()).unwrap();

        assert!(revoked_external_key(&armored).is_none());
        assert!(validate_external_key(&armored).is_ok());
    }
}
