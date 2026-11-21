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
use aster_crypto::{ensure_publishable_key, import_public_key};

macro_rules! fixture {
    ($name:literal) => {
        ($name, include_str!(concat!("fixtures/exported/", $name, ".asc")))
    };
}

const ENCRYPTABLE: [(&str, &str); 11] = [
    fixture!("gnupg_rsa2048"),
    fixture!("gnupg_rsa3072"),
    fixture!("gnupg_rsa4096"),
    fixture!("gnupg_ed25519_cv25519"),
    fixture!("gnupg_nistp256"),
    fixture!("gnupg_nistp384"),
    fixture!("gnupg_nistp521"),
    fixture!("openpgpjs_v4_curve25519_legacy"),
    fixture!("openpgpjs_v4_nistp256"),
    fixture!("openpgpjs_v4_rsa3072"),
    fixture!("openpgpjs_v6_ed25519"),
];

const PUBLISHABLE_WITHOUT_ENCRYPTION: [(&str, &str); 3] = [
    fixture!("gnupg_brainpoolp384"),
    fixture!("gnupg_secp256k1"),
    fixture!("gnupg_dsa_elgamal"),
];

const UNSUPPORTED_CURVE: [&str; 2] = ["gnupg_brainpoolp384", "gnupg_secp256k1"];

const UNREADABLE: [(&str, &str); 1] = [fixture!("gnupg_ed448_cv448")];

fn every_fixture() -> impl Iterator<Item = (&'static str, &'static str)> {
    ENCRYPTABLE
        .into_iter()
        .chain(PUBLISHABLE_WITHOUT_ENCRYPTION)
        .chain(UNREADABLE)
}

#[test]
fn publishing_accepts_exactly_the_keys_import_accepts() {
    for (name, armored) in every_fixture() {
        assert_eq!(
            ensure_publishable_key(armored).is_ok(),
            import_public_key(armored).is_ok(),
            "{name}"
        );
    }
}

#[test]
fn exported_keys_of_each_supported_type_are_publishable() {
    for (name, armored) in ENCRYPTABLE.into_iter().chain(PUBLISHABLE_WITHOUT_ENCRYPTION) {
        assert!(ensure_publishable_key(armored).is_ok(), "{name}");
    }
}

#[test]
fn exported_keys_keep_their_bound_encryption_subkey() {
    for (name, armored) in ENCRYPTABLE {
        let key = import_public_key(armored).unwrap();
        assert!(key.has_valid_encryption_key(), "{name}");
    }
}

#[test]
fn keys_the_library_cannot_read_are_not_publishable() {
    for (name, armored) in UNREADABLE {
        assert!(import_public_key(armored).is_err(), "{name}");
        assert!(ensure_publishable_key(armored).is_err(), "{name}");
    }
}

#[test]
fn keys_on_an_unsupported_curve_say_so() {
    for (name, armored) in PUBLISHABLE_WITHOUT_ENCRYPTION {
        let key = import_public_key(armored).unwrap();
        assert!(!key.has_valid_encryption_key(), "{name}");
        assert_eq!(
            key.has_unsupported_encryption_algorithm(),
            UNSUPPORTED_CURVE.contains(&name),
            "{name}"
        );
    }
}
