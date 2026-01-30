# Aster Crypto

OpenPGP-based end-to-end encryption library for Aster Mail.

## Overview

This library provides cryptographic primitives for secure email communication:

- **Key Generation**: RSA and Ed25519/X25519 key pair generation
- **Encryption**: OpenPGP message encryption with multiple recipients
- **Decryption**: OpenPGP message decryption with signature verification
- **Signatures**: Digital signing and verification
- **Password Hashing**: Argon2id password hashing and key derivation

## Features

- Zero-knowledge architecture - private keys never leave the client
- Secure memory handling with automatic zeroization
- WASM support for browser environments
- Type-safe error handling

## Security

- Uses industry-standard OpenPGP (RFC 4880)
- Argon2id for password hashing (memory-hard, resistant to GPU attacks)
- Sensitive data automatically zeroized from memory
- Constant-time operations where applicable

## Building

### Native (Rust)

```bash
cargo build --release
```

### WebAssembly

```bash
cargo build --target wasm32-unknown-unknown --features wasm
```

## License

MIT License - See [LICENSE](LICENSE) for details.
