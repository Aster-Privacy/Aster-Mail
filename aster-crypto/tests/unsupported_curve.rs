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
use aster_crypto::{encrypt_message, import_public_key};

const BRAINPOOL_PUBLIC: &str = include_str!("fixtures/brainpool_p256r1_public.asc");
const ED25519_PUBLIC: &str = include_str!("fixtures/ed25519_public.asc");

#[test]
fn brainpool_key_imports_and_reports_a_fingerprint() {
    let key = import_public_key(BRAINPOOL_PUBLIC).expect("brainpool key should import");

    assert!(!key.fingerprint().is_empty());
}

#[test]
fn brainpool_key_is_not_advertised_as_encryption_capable() {
    let key = import_public_key(BRAINPOOL_PUBLIC).expect("brainpool key should import");

    assert!(!key.has_valid_encryption_key());
}

#[test]
fn brainpool_key_fails_encryption_instead_of_returning_plaintext() {
    let key = import_public_key(BRAINPOOL_PUBLIC).expect("brainpool key should import");

    let result = encrypt_message(b"secret body", &[&key]);

    assert!(result.is_err());
}

#[test]
fn brainpool_key_is_reported_as_an_unsupported_algorithm() {
    let key = import_public_key(BRAINPOOL_PUBLIC).expect("brainpool key should import");

    assert!(key.has_unsupported_encryption_algorithm());
}

#[test]
fn curve25519_key_is_encryption_capable() {
    let key = import_public_key(ED25519_PUBLIC).expect("ed25519 key should import");

    assert!(key.has_valid_encryption_key());
}

#[test]
fn curve25519_key_encrypts_to_armored_ciphertext() {
    let key = import_public_key(ED25519_PUBLIC).expect("ed25519 key should import");

    let ciphertext = encrypt_message(b"secret body", &[&key]).expect("encryption should succeed");
    let armored = String::from_utf8(ciphertext).expect("armor should be utf8");

    assert!(armored.starts_with("-----BEGIN PGP MESSAGE-----"));
    assert!(!armored.contains("secret body"));
}

#[test]
fn curve25519_key_is_not_flagged_as_unsupported() {
    let key = import_public_key(ED25519_PUBLIC).expect("ed25519 key should import");

    assert!(!key.has_unsupported_encryption_algorithm());
}
