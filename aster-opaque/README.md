# aster-opaque

`aster-opaque` implements the OPAQUE password protocol for sign-in, using the Ristretto255 suite from `opaque-ke` with Argon2 as the key stretching function.

## Dependency audit

`.cargo/audit.toml` ignores RUSTSEC-2026-0387 for this crate only. The advisory covers `crypto-bigint` 0.5, which reaches this crate through `elliptic-curve` 0.13, a required dependency of `opaque-ke` 4 and `voprf` 0.5. With the Ristretto255 suite, all group and scalar arithmetic runs in `curve25519-dalek`, and the only `elliptic-curve` code that runs is the `expand_message_xmd` hash expander, which does not use `crypto-bigint`. Remove the ignore when a stable `opaque-ke` release moves to `elliptic-curve` 0.14.
