<img width="1200" height="628" alt="crypto" src="https://github.com/user-attachments/assets/93ee8227-8dfe-41c9-92e2-2435dc0a712f" />

# aster-crypto

OpenPGP for [Aster Mail](https://astermail.org), completely written in Rust, compiled to native and WebAssembly at the same time.

```rust
use aster_crypto::decrypt::decrypt_and_verify;
use aster_crypto::encrypt::encrypt_and_sign;
use aster_crypto::generate_keypair;

let alice = generate_keypair("Alice", "alice@astermail.org").unwrap();
let bob   = generate_keypair("Bob",   "bob@astermail.org").unwrap();

let ciphertext = encrypt_and_sign(b"Hello from Aster!", &[&bob.public_key()], &alice).unwrap();
let plaintext  = decrypt_and_verify(&ciphertext, &[&bob], &[&alice.public_key()]).unwrap();

assert_eq!(plaintext, b"Hello from Aster!");
```

## Modules at a glance

| Module | Purpose |
| --- | --- |
| `keys` | RSA-4096 key pair generation, import, export, optional passphrase protection. |
| `encrypt` | Encrypt to one or many recipients in armored or binary form. `encrypt_and_sign` bundles signing in. |
| `decrypt` | Decrypt with any of several candidate secret keys. `decrypt_and_verify` checks the sender too. |
| `sign` | Inline OpenPGP signatures, verified against a set of trusted signer keys. |
| `password` | Argon2id hashing, constant-time verification, password-based key derivation. |

## Using aster-crypto in your project (be careful)

```toml
[dependencies]
aster-crypto = { git = "https://github.com/Aster-Privacy/Aster-Mail", branch = "main" }
```

Native builds should work out of the box, but for any browser target, please add the WebAssembly toolchain:

```bash
rustup target add wasm32-unknown-unknown
```

## Building the crate itself

```bash
cargo build --release
cargo build --target wasm32-unknown-unknown --features wasm --release
cargo test
```

1. The first line is the native build that is inside all of our desktop and mobile apps.
2. The second produces the WebAssembly bundle that is used by our browser client.
3. The third one will run the full test suite, including the examples above.
   
## A note on security

aster-crypto wraps the reputable and well audited [`pgp`](https://crates.io/crates/pgp) (RFC 4880) and [`argon2`](https://crates.io/crates/argon2) crates, zeroizes secret material on drop, and keeps a deliberately small public API, but you should still have a good grasp of the primitives before you wire it anywhere in your own product.

Found a vulnerability? Please email [security@astermail.org](mailto:security@astermail.org) privately and please do not open a public issue.

## Community and contributing

Any bug reports, feature requests, or pull requests are welcome and recommended at [GitHub Issues](https://github.com/Aster-Privacy/Aster-Mail/issues). For anything else, say hi to us at [hello@astermail.org](mailto:hello@astermail.org), or join our community here:

[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/EvZGep3Uqh)
[![X](https://img.shields.io/badge/X-Follow-000000?logo=x&logoColor=white)](https://x.com/AsterPrivacy)
[![Reddit](https://img.shields.io/badge/Reddit-Join-FF4500?logo=reddit&logoColor=white)](https://reddit.com/r/AsterPrivacy)

## License

[![License](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](./LICENSE)

aster-crypto is licensed under AGPL-3.0-only. Use and adapt it freely, as long as you respect the terms of the license.
