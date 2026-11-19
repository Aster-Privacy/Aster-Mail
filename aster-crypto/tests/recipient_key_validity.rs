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
use aster_crypto::{encrypt_message, import_public_key, PublicKey};
use chrono::{DateTime, Duration, SubsecRound, Utc};
use pgp::composed::{
    Deserializable, Esk, KeyType, Message, SecretKeyParamsBuilder, SignedPublicKey,
    SignedPublicSubKey, SignedSecretKey, SubkeyParamsBuilder,
};
use pgp::crypto::ecc_curve::ECCCurve;
use pgp::crypto::hash::HashAlgorithm;
use pgp::crypto::public_key::PublicKeyAlgorithm;
use pgp::packet::{PublicSubkey, Signature, SignatureConfig, SignatureType, Subpacket, SubpacketData};
use pgp::types::{KeyId, PublicKeyTrait, SecretKeyTrait};
use rand::rngs::OsRng;

const ENCRYPT_FLAGS: u8 = 0x0C;
const ELGAMAL_EXPORT: &str = include_str!("fixtures/exported/gnupg_dsa_elgamal.asc");
const BRAINPOOL_EXPORT: &str = include_str!("fixtures/brainpool_p256r1_public.asc");
const SIGN_FLAGS: u8 = 0x02;

fn at(offset: Duration) -> DateTime<Utc> {
    (Utc::now() + offset).trunc_subsecs(0)
}

fn secret_with(primary_created: DateTime<Utc>, subkeys_created: &[DateTime<Utc>]) -> SignedSecretKey {
    secret_with_type(
        primary_created,
        subkeys_created,
        KeyType::ECDH(ECCCurve::Curve25519),
    )
}

fn secret_with_type(
    primary_created: DateTime<Utc>,
    subkeys_created: &[DateTime<Utc>],
    subkey_type: KeyType,
) -> SignedSecretKey {
    let mut params = SecretKeyParamsBuilder::default();
    params
        .key_type(KeyType::EdDSALegacy)
        .can_certify(true)
        .can_sign(true)
        .created_at(primary_created)
        .primary_user_id("Recipient <recipient@astermail.org>".into());
    for created in subkeys_created {
        let mut sub = SubkeyParamsBuilder::default();
        sub.key_type(subkey_type.clone())
            .can_encrypt(true)
            .created_at(*created);
        params.subkey(sub.build().unwrap());
    }
    params
        .build()
        .unwrap()
        .generate(OsRng)
        .unwrap()
        .sign(OsRng, || "".to_string())
        .unwrap()
}

fn new_secret() -> SignedSecretKey {
    secret_with(at(Duration::days(-10)), &[at(Duration::days(-10))])
}

fn public_of(secret: &SignedSecretKey) -> SignedPublicKey {
    secret
        .public_key()
        .sign(OsRng, secret, || "".to_string())
        .unwrap()
}

fn binding_config(
    signer: &SignedSecretKey,
    typ: SignatureType,
    signed_at: DateTime<Utc>,
    extra: Vec<SubpacketData>,
) -> SignatureConfig {
    let mut config = SignatureConfig::v4(typ, signer.algorithm(), HashAlgorithm::SHA2_256);
    config.hashed_subpackets = vec![Subpacket::regular(SubpacketData::SignatureCreationTime(
        signed_at,
    ))];
    config
        .hashed_subpackets
        .extend(extra.into_iter().map(Subpacket::regular));
    config.hashed_subpackets.push(Subpacket::regular(SubpacketData::IssuerFingerprint(
        signer.fingerprint(),
    )));
    config.unhashed_subpackets = vec![Subpacket::regular(SubpacketData::Issuer(signer.key_id()))];
    config
}

fn sub_signature(
    signer: &SignedSecretKey,
    sub: &PublicSubkey,
    typ: SignatureType,
    signed_at: DateTime<Utc>,
    extra: Vec<SubpacketData>,
) -> Signature {
    binding_config(signer, typ, signed_at, extra)
        .sign_key_binding(signer, || "".to_string(), sub)
        .unwrap()
}

fn binding(
    signer: &SignedSecretKey,
    sub: &PublicSubkey,
    signed_at: DateTime<Utc>,
    extra: Vec<SubpacketData>,
) -> Signature {
    sub_signature(signer, sub, SignatureType::SubkeyBinding, signed_at, extra)
}

fn flags(value: u8) -> SubpacketData {
    SubpacketData::KeyFlags(vec![value].into())
}

fn imported(public: &SignedPublicKey) -> PublicKey {
    import_public_key(&public.to_armored_string(None.into()).unwrap()).unwrap()
}

fn recipient_ids(ciphertext: &[u8]) -> Vec<KeyId> {
    let (message, _) = Message::from_string(std::str::from_utf8(ciphertext).unwrap()).unwrap();
    let Message::Encrypted { esk, .. } = message else {
        panic!("message is not encrypted");
    };
    esk.iter()
        .filter_map(|e| match e {
            Esk::PublicKeyEncryptedSessionKey(p) => p.id().ok().cloned(),
            _ => None,
        })
        .collect()
}

fn assert_refused(public: &SignedPublicKey, case: &str) {
    let key = imported(public);
    assert!(!key.has_valid_encryption_key(), "{case}: key reported as valid");
    assert!(
        encrypt_message(b"body", &[&key]).is_err(),
        "{case}: message was encrypted"
    );
}

fn assert_encrypts_to(public: &SignedPublicKey, expected: &KeyId, case: &str) {
    let key = imported(public);
    assert!(key.has_valid_encryption_key(), "{case}: key reported as invalid");
    let ciphertext = encrypt_message(b"body", &[&key]).unwrap();
    assert_eq!(recipient_ids(&ciphertext), vec![expected.clone()], "{case}");
}

#[test]
fn a_properly_bound_subkey_is_used() {
    let secret = new_secret();
    let public = public_of(&secret);
    let expected = public.public_subkeys[0].key.key_id();
    assert_encrypts_to(&public, &expected, "bound subkey");
}

#[test]
fn a_subkey_revoked_by_its_primary_key_is_never_used() {
    let secret = new_secret();
    let mut public = public_of(&secret);
    let revocation = sub_signature(
        &secret,
        &public.public_subkeys[0].key,
        SignatureType::SubkeyRevocation,
        at(Duration::days(-1)),
        vec![],
    );
    public.public_subkeys[0].signatures.push(revocation);
    assert_refused(&public, "primary-made revocation");
}

#[test]
fn a_revocation_made_by_another_key_is_ignored() {
    let secret = new_secret();
    let stranger = new_secret();
    let mut public = public_of(&secret);
    let forged = sub_signature(
        &stranger,
        &public.public_subkeys[0].key,
        SignatureType::SubkeyRevocation,
        at(Duration::days(-1)),
        vec![],
    );
    public.public_subkeys[0].signatures.push(forged);
    let expected = public.public_subkeys[0].key.key_id();
    assert_encrypts_to(&public, &expected, "foreign revocation");
}

#[test]
fn a_newer_binding_that_shortens_the_expiry_wins() {
    let secret = new_secret();
    let mut public = public_of(&secret);
    let sub = public.public_subkeys[0].key.clone();
    public.public_subkeys[0].signatures = vec![
        binding(
            &secret,
            &sub,
            at(Duration::days(-9)),
            vec![flags(ENCRYPT_FLAGS), SubpacketData::KeyExpirationTime(Duration::days(30))],
        ),
        binding(
            &secret,
            &sub,
            at(Duration::days(-1)),
            vec![flags(ENCRYPT_FLAGS), SubpacketData::KeyExpirationTime(Duration::days(2))],
        ),
    ];
    assert_refused(&public, "shortened expiry");
}

#[test]
fn a_newer_binding_that_removes_the_expiry_wins() {
    let secret = new_secret();
    let mut public = public_of(&secret);
    let sub = public.public_subkeys[0].key.clone();
    public.public_subkeys[0].signatures = vec![
        binding(
            &secret,
            &sub,
            at(Duration::days(-9)),
            vec![flags(ENCRYPT_FLAGS), SubpacketData::KeyExpirationTime(Duration::days(2))],
        ),
        binding(&secret, &sub, at(Duration::days(-1)), vec![flags(ENCRYPT_FLAGS)]),
    ];
    let expected = sub.key_id();
    assert_encrypts_to(&public, &expected, "extended expiry");
}

#[test]
fn a_newer_binding_without_encryption_flags_wins() {
    let secret = new_secret();
    let mut public = public_of(&secret);
    let sub = public.public_subkeys[0].key.clone();
    public.public_subkeys[0].signatures = vec![
        binding(&secret, &sub, at(Duration::days(-9)), vec![flags(ENCRYPT_FLAGS)]),
        binding(&secret, &sub, at(Duration::days(-1)), vec![flags(SIGN_FLAGS)]),
    ];
    assert_refused(&public, "flag downgrade");
}

fn with_single_binding(subkey_type: KeyType, extra: Vec<SubpacketData>) -> SignedPublicKey {
    let created = at(Duration::days(-10));
    let secret = secret_with_type(created, &[created], subkey_type);
    let mut public = public_of(&secret);
    let sub = public.public_subkeys[0].key.clone();
    public.public_subkeys[0].signatures = vec![binding(&secret, &sub, at(Duration::days(-1)), extra)];
    public
}

#[test]
fn a_binding_without_key_flags_allows_encryption_on_an_ecdh_subkey() {
    let public = with_single_binding(KeyType::ECDH(ECCCurve::Curve25519), vec![]);
    let expected = public.public_subkeys[0].key.key_id();
    assert_encrypts_to(&public, &expected, "ecdh without key flags");
}

#[test]
fn a_binding_without_key_flags_allows_encryption_on_an_x25519_subkey() {
    let public = with_single_binding(KeyType::X25519, vec![]);
    let expected = public.public_subkeys[0].key.key_id();
    assert_encrypts_to(&public, &expected, "x25519 without key flags");
}

#[test]
fn a_binding_without_key_flags_does_not_allow_encryption_on_an_rsa_subkey() {
    let public = with_single_binding(KeyType::Rsa(2048), vec![]);
    assert_refused(&public, "rsa without key flags");
}

#[test]
fn a_binding_with_empty_key_flags_does_not_allow_encryption_on_an_ecdh_subkey() {
    let public = with_single_binding(KeyType::ECDH(ECCCurve::Curve25519), vec![flags(0)]);
    assert_refused(&public, "ecdh with empty key flags");
}

#[test]
fn a_binding_without_key_flags_allows_encryption_on_an_x448_subkey() {
    let public = with_single_binding(KeyType::X448, vec![]);
    let expected = public.public_subkeys[0].key.key_id();
    assert_encrypts_to(&public, &expected, "x448 without key flags");
}

#[test]
fn a_binding_without_key_flags_does_not_make_a_gnupg_elgamal_subkey_usable() {
    let (exported, _) = SignedPublicKey::from_string(ELGAMAL_EXPORT).unwrap();
    let elgamal = exported
        .public_subkeys
        .iter()
        .find(|s| s.key.algorithm() == PublicKeyAlgorithm::ElgamalSign)
        .expect("fixture carries a gnupg elgamal subkey")
        .key
        .clone();
    let secret = secret_with(at(Duration::days(-10)), &[]);
    let mut public = public_of(&secret);
    let flagless = binding(&secret, &elgamal, at(Duration::days(-1)), vec![]);
    public.public_subkeys = vec![SignedPublicSubKey::new(elgamal, vec![flagless])];
    let key = imported(&public);
    assert!(
        !key.has_valid_encryption_key(),
        "gnupg elgamal without key flags"
    );
    assert!(!key.has_unsupported_encryption_algorithm());
}

#[test]
fn a_binding_without_key_flags_does_not_allow_encryption_on_signing_subkeys() {
    for (subkey_type, case) in [
        (KeyType::EdDSALegacy, "eddsa legacy"),
        (KeyType::Ed25519, "ed25519"),
        (KeyType::ECDSA(ECCCurve::P256), "ecdsa p-256"),
    ] {
        let public = with_single_binding(subkey_type, vec![]);
        assert_refused(&public, case);
    }
}

#[test]
fn a_flagless_ecdh_subkey_that_was_revoked_is_never_used() {
    let created = at(Duration::days(-10));
    let secret = secret_with(created, &[created]);
    let mut public = public_of(&secret);
    let sub = public.public_subkeys[0].key.clone();
    public.public_subkeys[0].signatures = vec![
        binding(&secret, &sub, at(Duration::days(-2)), vec![]),
        sub_signature(
            &secret,
            &sub,
            SignatureType::SubkeyRevocation,
            at(Duration::days(-1)),
            vec![],
        ),
    ];
    assert_refused(&public, "revoked flagless ecdh");
}

#[test]
fn a_flagless_ecdh_subkey_that_expired_is_never_used() {
    let created = at(Duration::days(-10));
    let secret = secret_with(created, &[created]);
    let mut public = public_of(&secret);
    let sub = public.public_subkeys[0].key.clone();
    public.public_subkeys[0].signatures = vec![binding(
        &secret,
        &sub,
        at(Duration::days(-9)),
        vec![SubpacketData::KeyExpirationTime(Duration::days(1))],
    )];
    assert_refused(&public, "expired flagless ecdh");
}

fn brainpool_rebound_by_a_stranger(extra: Vec<SubpacketData>) -> SignedPublicKey {
    let (mut public, _) = SignedPublicKey::from_string(BRAINPOOL_EXPORT).unwrap();
    let stranger = new_secret();
    for sub in public.public_subkeys.iter_mut() {
        let key = sub.key.clone();
        sub.signatures = vec![binding(
            &stranger,
            &key,
            at(Duration::days(-1)),
            extra.clone(),
        )];
    }
    public
}

#[test]
fn an_unverifiable_flagless_binding_on_an_unsupported_curve_is_reported() {
    let key = imported(&brainpool_rebound_by_a_stranger(vec![]));
    assert!(!key.has_valid_encryption_key());
    assert!(key.has_unsupported_encryption_algorithm());
}

#[test]
fn an_unverifiable_binding_with_empty_key_flags_on_an_unsupported_curve_is_not_reported() {
    let key = imported(&brainpool_rebound_by_a_stranger(vec![flags(0)]));
    assert!(!key.has_valid_encryption_key());
    assert!(!key.has_unsupported_encryption_algorithm());
}

#[test]
fn a_binding_with_encryption_flags_allows_encryption_on_an_rsa_subkey() {
    let public = with_single_binding(KeyType::Rsa(2048), vec![flags(ENCRYPT_FLAGS)]);
    let expected = public.public_subkeys[0].key.key_id();
    assert_encrypts_to(&public, &expected, "rsa with encryption flags");
}

#[test]
fn an_expired_subkey_is_never_used_as_a_fallback() {
    let secret = new_secret();
    let mut public = public_of(&secret);
    let sub = public.public_subkeys[0].key.clone();
    public.public_subkeys[0].signatures = vec![binding(
        &secret,
        &sub,
        at(Duration::days(-9)),
        vec![flags(ENCRYPT_FLAGS), SubpacketData::KeyExpirationTime(Duration::days(1))],
    )];
    assert_refused(&public, "expired subkey only");
}

#[test]
fn an_expired_binding_signature_is_not_trusted() {
    let secret = new_secret();
    let mut public = public_of(&secret);
    let sub = public.public_subkeys[0].key.clone();
    public.public_subkeys[0].signatures = vec![binding(
        &secret,
        &sub,
        at(Duration::days(-9)),
        vec![flags(ENCRYPT_FLAGS), SubpacketData::SignatureExpirationTime(Duration::days(1))],
    )];
    assert_refused(&public, "expired binding signature");
}

#[test]
fn a_binding_signed_in_the_future_is_not_trusted() {
    let secret = new_secret();
    let mut public = public_of(&secret);
    let sub = public.public_subkeys[0].key.clone();
    public.public_subkeys[0].signatures =
        vec![binding(&secret, &sub, at(Duration::days(1)), vec![flags(ENCRYPT_FLAGS)])];
    assert_refused(&public, "future binding");
}

#[test]
fn a_key_revoked_by_its_primary_key_is_never_used() {
    let secret = new_secret();
    let mut public = public_of(&secret);
    let revocation = binding_config(
        &secret,
        SignatureType::KeyRevocation,
        at(Duration::days(-1)),
        vec![],
    )
    .sign_key(&secret, || "".to_string(), &public.primary_key)
    .unwrap();
    public.details.revocation_signatures.push(revocation);
    assert_refused(&public, "revoked primary");
}

#[test]
fn a_primary_key_created_in_the_future_is_not_used() {
    let secret = secret_with(at(Duration::days(1)), &[at(Duration::days(1))]);
    assert_refused(&public_of(&secret), "future primary");
}

#[test]
fn a_subkey_created_in_the_future_is_not_used() {
    let secret = secret_with(at(Duration::days(-10)), &[at(Duration::days(1))]);
    assert_refused(&public_of(&secret), "future subkey");
}

#[test]
fn the_newest_usable_subkey_is_used() {
    let secret = secret_with(
        at(Duration::days(-10)),
        &[at(Duration::days(-2)), at(Duration::days(-8))],
    );
    let public = public_of(&secret);
    let expected = public.public_subkeys[0].key.key_id();
    assert_encrypts_to(&public, &expected, "newest subkey");
}

#[test]
fn subkeys_created_together_are_picked_by_fingerprint_regardless_of_order() {
    let created = at(Duration::days(-5));
    let secret = secret_with(at(Duration::days(-10)), &[created, created]);
    let mut public = public_of(&secret);
    let lowest = public
        .public_subkeys
        .iter()
        .min_by(|a, b| a.key.fingerprint().as_bytes().cmp(b.key.fingerprint().as_bytes()))
        .unwrap()
        .key
        .key_id();
    assert_encrypts_to(&public, &lowest, "first order");
    public.public_subkeys.reverse();
    assert_encrypts_to(&public, &lowest, "reversed order");
}
