# Handshake version 5

Handshake version 5 is the account-bound X3DH/PQXDH handshake. It binds a session to both parties' owner OpenPGP keys, signs every one-time prekey, frames every transcript and key-derivation input with explicit lengths, and carries the session binding into every ratchet header. Versions 1 to 4 stay readable and byte-identical; they are retiring and are no longer the target for new work.

The TypeScript client in `src/services/crypto/` is the reference implementation. The conformance vectors are in `handshake_v5_vectors.json` next to this file.

## Version registry

`HANDSHAKE_VERSIONS` in `src/services/crypto/x3dh.ts` is the only place that defines what each version hashes.

| Version | Status | Framing | Transcript fields |
|---|---|---|---|
| 1 | Retiring | Plain concatenation | None |
| 2 | Retiring | Plain concatenation | `ik_a ik_b kem_ct` |
| 3 | Retiring | Plain concatenation | `ik_a ik_b spk ek kem_ct` |
| 4 | Retiring | Plain concatenation | `ik_a ik_b spk ek opk opk_id kem_ct` |
| 5 | Current | Length-prefixed fields | `label version ifp_a ifp_b ik_a ik_b spk ek opk_id opk pq_ik_hash pq_opk_id pq_opk_hash kem_ct_hash` |

For version 5, the fields `ifp_a ifp_b ik_a ik_b spk` are required. A missing required field is an error, not an empty field.

## Field encoding

`encode_fields` in `src/services/crypto/handshake_encoding.ts` is the one encoder that every version 5 structure uses: the transcript, the key-derivation input, the one-time prekey signature input, and the ratchet header associated data.

Each field at position `i` (counting from 0) is encoded as:

```
u8(i + 1) || u32_be(len(field)) || field
```

An absent field is encoded with length 0. The position tag stops two adjacent fields from trading bytes, and the length stops a field from absorbing its neighbor.

## Keys

| Key | Holder | Purpose |
|---|---|---|
| Owner OpenPGP key | Account | Root of trust. Its fingerprint (`ifp`) is the account identity. |
| `IK` | Account | P-256 ratchet identity key, used only for ECDH. |
| Bundle signing key | Account | P-256 key used only for ECDSA over one-time prekeys. |
| `SPK` | Account | P-256 signed prekey. |
| `OPK` | Account | P-256 one-time prekeys, each signed by the bundle signing key. |
| PQ identity key | Account | ML-KEM-768 public key. |
| PQ one-time prekeys | Account | ML-KEM-768 one-time keys, each signed by the bundle signing key. |

### Bundle signing key

The bundle signing key separates signing from key agreement, so the ratchet identity scalar is never used for ECDSA. The client derives it deterministically from the ratchet identity private key:

```
seed   = HKDF-SHA256(ikm = IK.d, salt = "aster/handshake/bundle-signing/v5", info = "bundle-signing", L = 48)
scalar = hash_to_field(seed, n_P256)
```

This uses `derive_address_key` in `src/services/crypto/address_sender_identity.ts` through `derive_bundle_signing_key` in `src/services/crypto/handshake_keys/bundle_signing.ts`. Because the key is derived, every device that holds the vault produces the same key. A new device, a password change, and an account recovery therefore change nothing that a contact can see, and they raise no warning.

### Bundle signature, format 3

The owner OpenPGP key signs a cleartext message over the bundle. Format 3 adds the bundle signing public key and the advertised maximum version to format 2:

```
aster-ratchet-prekey-v3:<IK b64>.<SPK b64>.<PQ identity b64>.<signing public key b64>.<x3dh_max_version>
```

`build_ratchet_prekey_canonical` in `src/services/crypto/handshake_keys/prekey_signed_text.ts` builds formats 1, 2, and 3. The format 3 signature goes in the new bundle field `account_signature`. The existing `signed_prekey_signature` keeps its format 2 content, so clients that predate version 5 still verify the bundle.

### One-time prekey signature

```
digest    = SHA-256(encode_fields(["aster/handshake/one-time-prekey/v5", u8(kind), u32_be(key_id), public_key]))
signature = ECDSA-P256(bundle_signing_key, digest), compact r || s, low-s
```

`kind` is 1 for a P-256 one-time prekey and 2 for an ML-KEM-768 one-time prekey. The signature uses RFC 6979 deterministic nonces, so the vectors are stable.

## Transcript and key derivation

```
T   = encode_fields([
        "aster/handshake/transcript/v5", u8(5),
        ifp_a, ifp_b, IK_A, IK_B, SPK_B, EK_A,
        u32_be(opk_id) | empty, OPK_B | empty,
        SHA-256(PQ_IK_B) | empty,
        u32_be(pq_opk_id) | empty, SHA-256(PQ_OPK_B) | empty,
        SHA-256(kem_ct) | empty ])
IKM = encode_fields([DH1, DH2, DH3, DH4 | empty, pq_ss | empty, T])
SK  = HKDF-SHA256(ikm = IKM, salt = 0^32, info = "Aster Mail_{X3DH|PQXDH|PQXDH_identity}_v5", L = 32)
session_binding = SHA-256(T)
```

`ifp_a` is the raw fingerprint of the initiator's owner OpenPGP key and `ifp_b` is the responder's. `DH1` to `DH4` are the usual X3DH agreements: `DH(IK_A, SPK_B)`, `DH(EK_A, IK_B)`, `DH(EK_A, SPK_B)`, and `DH(EK_A, OPK_B)`. The KEM public keys enter `T` as hashes, so the transcript commits to them without carrying 1,184 bytes each.

`SHA-256(PQ_IK_B)` is present whenever the responder has a 1,184-byte ML-KEM-768 identity key, even when the handshake runs no KEM or uses a one-time KEM key. The initiator takes `PQ_IK_B` from `pq_kem_public_key` in the bundle it fetched, and the responder takes it from its own identity key. The field is empty only when the bundle carries no identity KEM key, or carries one of the wrong length.

## Wire changes

All new fields are optional, so older clients ignore them.

| Where | Field | Meaning |
|---|---|---|
| Prekey bundle | `signing_public_key` | Bundle signing public key, raw P-256, base64. |
| Prekey bundle | `account_signature` | Format 3 owner OpenPGP signature. |
| Prekey bundle | `x3dh_max_version` | `5` when the account has published version 5 material. |
| EC and PQ one-time prekey | `signature` | One-time prekey signature, base64. |
| Bootstrap recipient data | `ifp` | Initiator owner key fingerprint, lowercase hex. Set when `x3dh_v` is 5. |
| Ratchet header | `v` = 3 and `sb` | Header format 3, with `sb` = base64 `session_binding`. |
| Envelope capability | x3dh marker `5` | The client reports version 5 support. |

## Ratchet header associated data

| Header `v` | Associated data |
|---|---|
| 1 or absent | None |
| 2 | `"astermail-ratchet-header-v2" || u8(v) || dh || u32_be(pcl) || u32_be(mn)` |
| 3 or higher | `encode_fields(["aster/ratchet/header/v3", u8(v), sb, dh, u32_be(pcl), u32_be(mn)])`. A header without `sb` is malformed. |

A session that a version 5 handshake started stores its `session_binding`. Such a session sends only header format 3, and it refuses any header that is below format 3 or that carries a different `sb`. There is no unbound fallback. Sessions from versions 1 to 4 keep their existing header rules.

## Negotiation

1. A client advertises version 5 only after its bundle upload with `signing_public_key` and `account_signature` succeeds (`mark_account_bound_published` and `is_account_bound_published`).
2. A sender uses version 5 only when the recipient bundle advertises it. The sender first checks `account_signature` against the recipient's verified owner key. If the signature is missing or does not verify, if the bundle is address-scoped, or if the peer's trust is downgraded, the sender strips `signing_public_key` and treats the bundle as version 4.
3. At version 5, the sender uses a one-time prekey only when its signature verifies. An unsigned or forged one-time prekey is skipped, and the handshake runs without it.
4. The sender remembers the highest version it used with each contact. After a version 5 handshake, a bundle that no longer offers a verified version 5 makes the handshake fail with `HANDSHAKE_DOWNGRADE_ERROR`. The message falls back to OpenPGP and the client records a downgraded peer event.
5. The receiver accepts versions 1 to 4 from any peer. A version 5 bootstrap must carry `ifp`, and `ifp` must match the sender's pinned owner key, or the published owner key when no pin exists. Otherwise the receiver raises `SenderIdentityUnverifiedError` with reason `mismatch`.

## Switch

`ADVERTISE_HANDSHAKE_V5` in `src/services/crypto/crypto_enforcement_policy.ts` is the only switch, read through `is_handshake_v5_advertised`. The default is off. `VITE_ADVERTISE_HANDSHAKE_V5` can turn it on per build.

With the switch off, the client does not derive a bundle signing key, does not sign one-time prekeys, does not upload version 5 bundle fields, and does not advertise version 5. Every read and verify path for version 5 is live regardless of the switch, so a client that never turns it on still accepts version 5 bootstraps and bound headers from peers that do.

## Backend requirements

The backend must make these changes before the switch is turned on. Until then, a turned-on client stays inert because the backend caps the version.

1. Store and serve `signing_public_key` and `account_signature` on the prekey bundle, unchanged.
2. Store and serve the per-key `signature` for EC and PQ one-time prekeys, unchanged, alongside the key it signs.
3. Stop capping the advertised version: `reported_x3dh_max_version` in `capability.rs`, and `capped_for_requester` and `served_x3dh_version` in `prekeys.rs`, must pass `5` through.
4. Keep serving PQ one-time prekeys to every requester that advertises version 2 or later.
5. Treat all of these fields as opaque. The backend never verifies them; clients do.

## Key lifecycle

| Event | What happens |
|---|---|
| Signed prekey rotation | The client re-signs the bundle in formats 2 and 3 and uploads both. |
| One-time prekey replenish | Every new EC and PQ one-time prekey is signed at upload. |
| Bundle signing key change | It changes only when the ratchet identity key changes. The client then re-uploads the bundle and replaces every one-time prekey, because old signatures no longer verify. |
| New device, password change, recovery | No change. The signing key is derived from the vault, so contacts see nothing new and the client shows no warning. |
| Owner OpenPGP key rotation | Shows as an owner pin change and is handled by the existing pin change notice. |

## Deprecation plan

1. Ship: release the client with the switch off, then ship the backend changes above, then turn the switch on.
2. Measure: the backend counts active accounts whose capability report is below version 5. This step is described here only; it is not built.
3. Raise the floor: when the count is low enough, a config change raises the minimum accepted version for new sessions.
4. Remove: once no stored session depends on versions 1 to 4, delete their entries from `HANDSHAKE_VERSIONS` and the format 2 header path.

## Known limitations

- The receiver floor is lenient. `is_below_remembered_x3dh` compares against `min(remembered, 3)`, because a peer with several devices can legitimately send from a device that has not upgraded.
- Messages to your own account use the local bundle, which carries no signing key, so they never use version 5.
- On first contact, an attacker who controls the server can replay an older bundle with only the format 2 signature, which makes the sender use version 4. The per-contact floor protects every later session.
- A downgrade refusal sends the message over OpenPGP instead of failing to send.
- Per-address version 5 entries are not implemented. Address-scoped bundles always run at version 4, so finding 038 is only partly addressed.

## Vectors

`handshake_v5_vectors.json` holds:

- `legacy`: shared secrets for versions 1 to 4 in every PQ mode. They prove that versions 1 to 4 are byte-identical to the code before version 5.
- `v5`: the transcript, session binding, and shared secret for version 5 with no PQ key, with a one-time prekey, with the PQ identity key, and with a PQ one-time prekey.
- `negative`: a one-time prekey signature and a forged one, the secret for a wrong account fingerprint, header associated data for formats 2 and 3 with a tampered header, and a downgrade case.

`src/services/crypto/handshake_vectors.test.ts` and `src/services/crypto/handshake_v5.test.ts` check the vectors. The version 5 test also recomputes `T` and the shared secret straight from this document with `@noble/curves`, independent of the client code path. To regenerate the files, set `HANDSHAKE_VECTORS_OUT` or `HANDSHAKE_V5_VECTORS_OUT` to an output path and run the tests.
