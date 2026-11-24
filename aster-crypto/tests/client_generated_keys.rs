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
use aster_crypto::{encrypt_message, ensure_publishable_key, import_public_key};
use pgp::composed::{Deserializable, SignedPublicKey};

const WEB_CLIENT_PUBLIC_KEY: &str = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\
    \n\
    xjMEaqByCRYJKwYBBAHaRw8BAQdAZhosaI7VgDJ5ZLilZKcah11pUXRDUoVc\n\
    +1FJXpsBJFzNG3Byb2JlIDxwcm9iZUBhc3Rlcm1haWwub3JnPsLAEwQTFgoA\n\
    hQWCaqByCQMLCQcJEMubMzkhBAyRRRQAAAAAABwAIHNhbHRAbm90YXRpb25z\n\
    Lm9wZW5wZ3Bqcy5vcme5QaC6LqhxaIlI5UqlrFn6PXFBgO7MTjlM2iyW1XEk\n\
    WAUVCggODAQWAAIBAhkBApsDAh4BFiEEKgfJYRimk8RDuv18y5szOSEEDJEA\n\
    AARXAQDkQVTIfEXsdaHM0wA4u+g5oXjWM01ynyb9Cj/9LsHQcQD+JJ/B+i3b\n\
    7zOUoHqWrsZWYO2qr8Y4uzRx+QIucfF1Xw3OOARqoHIJEgorBgEEAZdVAQUB\n\
    AQdAtm1og7uj14ADzlbW7cr3wfLd407ABQwd7uP1gXQJYyUDAQgHwr4EGBYK\n\
    AHAFgmqgcgkJEMubMzkhBAyRRRQAAAAAABwAIHNhbHRAbm90YXRpb25zLm9w\n\
    ZW5wZ3Bqcy5vcmdRfO1YbVrBGRWdPxWm9K/yQ9DT4Em3Mkcuc9tujuy6RwKb\n\
    DBYhBCoHyWEYppPEQ7r9fMubMzkhBAyRAAAjegEA3fSR8F/W5FWnNvhLzNRD\n\
    cQepS1PgNW8L5h8VBg83/nEA/jb7DSnCkmtrd+4hE14CWkGtk37Dlpw6qWZX\n\
    p+gRzpIM\n\
    =6aWS\n\
    -----END PGP PUBLIC KEY BLOCK-----\n\
    \n\
    ";

const IOS_CLIENT_PUBLIC_KEY: &str = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\
    \n\
    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\n\
    =N9Ml\n\
    -----END PGP PUBLIC KEY BLOCK-----\n\
    -----BEGIN PGP PUBLIC KEY BLOCK-----\n\
    \n\
    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\r\n\
    CTRKc3A7LcFK7bzd/4d+2jGJEihheR1ge13W\n\
    =nufv\n\
    -----END PGP PUBLIC KEY BLOCK-----\n\
    ";

const ANDROID_CLIENT_PUBLIC_KEY: &str = "-----BEGIN PGP PUBLIC KEY BLOCK-----\n\
    Version: BCPG v1.86\n\
    \n\
    mDMEavxyARYJKwYBBAHaRw8BAQdAlN9nk4ChOa/+8kcOOq0xM9f424EDl9lxjvho\n\
    AWX8cXa0JE11cmF0aSA8bXVyYXRpLmJhbGF6c0Bhc3Rlcm1haWwub3JnPsJxBBMW\n\
    CgAZBYJq/HIBAhsDBBUKCQgECwkIBwIeAQIZAQAKCRCQpmeFEdrQXTYfAP9lcmm2\n\
    Sm9sXArLeqnGsv7/0xojUsiYlV2yDJClz/gwXAEA0HdPB5XUairz9utiZRi0WnP/\n\
    qoC/YgNjri0WLts6Nga0I011cmF0aSA8bXVyYXRpYmFsYXpzQGFzdGVybWFpbC5v\n\
    cmc+wmEEExYKAAkFgmr8cgECGwMACgkQkKZnhRHa0F0ynQD+KHNE1BvErm+NDxDv\n\
    +evXA13sCEbMcVL2vBAQyknMQDIA/0LaSoU25FT+xrhOo33pRh8niKgjv1xuDeUx\n\
    90kVIicAuDgEavxyARIKKwYBBAGXVQEFAQEHQKg//hAnfwcRF1u+8CJJKZvQo8Xc\n\
    fyFfSgTXb0Jg8iUEAwEIB8JhBBgWCgAJBYJq/HIBAhsMAAoJEJCmZ4UR2tBdXdgB\n\
    AKE07e+rH9BrPgsYm31Ot5ThF8Q8LIcs33qex76dcGRbAP47wFZKj8aPFbrFjg8N\n\
    FmaTHOaOW87gsStG0nLzhv/YBQ==\n\
    =7fEz\n\
    -----END PGP PUBLIC KEY BLOCK-----\n\
    ";

const CLIENT_GENERATED_KEYS: [(&str, &str); 3] = [
    ("web", WEB_CLIENT_PUBLIC_KEY),
    ("android", ANDROID_CLIENT_PUBLIC_KEY),
    ("ios", IOS_CLIENT_PUBLIC_KEY),
];

fn without_subkey_bindings(armored: &str) -> String {
    let (mut key, _) = SignedPublicKey::from_string(armored).unwrap();
    for sub in key.public_subkeys.iter_mut() {
        sub.signatures.clear();
    }
    key.to_armored_string(None.into()).unwrap()
}

#[test]
fn every_client_generated_key_is_publishable() {
    for (client, armored) in CLIENT_GENERATED_KEYS {
        assert!(
            ensure_publishable_key(armored).is_ok(),
            "{client} key should be publishable"
        );
    }
}

#[test]
fn every_client_generated_key_has_a_bound_encryption_subkey() {
    for (client, armored) in CLIENT_GENERATED_KEYS {
        let key = import_public_key(armored).unwrap();
        assert!(key.has_encryption_key(), "{client} key should be capable");
        assert!(key.has_valid_encryption_key(), "{client} key should be valid");
        assert!(
            encrypt_message(b"body", &[&key]).is_ok(),
            "{client} key should encrypt"
        );
    }
}

#[test]
fn a_subkey_without_a_binding_signature_is_never_selected() {
    for (client, armored) in CLIENT_GENERATED_KEYS {
        let key = import_public_key(&without_subkey_bindings(armored)).unwrap();
        assert!(!key.has_encryption_key(), "{client} unbound subkey selected");
        assert!(!key.has_valid_encryption_key(), "{client} unbound subkey valid");
        assert!(
            encrypt_message(b"body", &[&key]).is_err(),
            "{client} unbound subkey used for encryption"
        );
    }
}
