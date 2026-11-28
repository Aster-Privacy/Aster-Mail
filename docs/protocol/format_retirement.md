# Format retirement

This spec describes how a client moves an account's stored data off old storage formats, records that the move is finished, and then refuses the old format for that account. Web, Android, and iOS read and write the same record, so any client can finish the work and every client honors the result.

## The record

The record lives inside the encrypted vault as `format_retirements`. The server can't read it.

```json
{
  "format_retirements": {
    "v": 1,
    "classes": {
      "escrow_unbound": { "v": 1, "at": "2026-11-24T10:00:00.000Z" }
    }
  }
}
```

- `v` is the record version. A client that sees a higher `v` than it knows still reads the classes it knows and never removes classes it doesn't know.
- `classes` maps a class id to `{ v, at }`. `v` is the migrator version that finished the class, and `at` is an ISO 8601 timestamp.
- Merging is monotonic. A vault write merges the server copy, the base copy, and the new copy, keeps the union of classes, and keeps the highest `v` per class. A stale client can't remove a class. Web: `merge_format_retirements` in `src/services/format_retirement/record.ts`, called from `merge_vault_for_write` in `src/services/crypto/vault_cas_write.ts`.
- Two older markers count as entries in this record, so existing accounts don't need a second pass:
  - `mail_legacy_retired` (a valid `{ v, at }`) means `mail_public_kek` is retired.
  - `escrow_format === 2` means `recovery_escrow_legacy` is retired.

A class is written to the record only after the migrator reports zero remaining items and its verify step passes.

## Refusal switches

Each class has one switch, which takes one of three values:

| Value | Meaning |
|---|---|
| `accept` | Old items always open. |
| `after_marker` | Old items open until the account's record lists the class, then they are refused. |
| `always` | Old items are refused for every account. |

On web, the switches live in `src/services/format_retirement/switches.ts` as `FORMAT_REFUSAL_DEFAULTS`. You can override a switch at build time with `VITE_FORMAT_REFUSAL_<CLASS_ID_UPPERCASE>`. The older `VITE_REFUSE_UNBOUND_STORED_DATA=true` still means `always` for the four stored unbound classes. Every refusal check goes through `is_format_refused(class)` in `record.ts`.

| Class | Default | Reason |
|---|---|---|
| `storage_password_v1` | `after_marker` | Matches the existing retired key id behavior. |
| `mail_public_kek` | `after_marker` | Matches the existing `mail_legacy_retired` behavior. |
| `recovery_escrow_legacy` | `after_marker` | Format 2 accounts never need the legacy seal. |
| `escrow_unbound` | `accept` | Mobile writers aren't confirmed to bind yet. |
| `recovery_lane_unbound` | `accept` | No migrator yet. |
| `ratchet_unbound` | `accept` | No migrator yet. Sessions marked bound already refuse. |
| `inbound_unbound_marker` | `accept` | The server still issues markers 0x03 and 0x04 to clients that don't report bound support. |

Before you move a class to `after_marker`, every client that writes that class must write the bound form. Before you move a class to `always`, the remaining count for that class must be zero across all accounts.

Other switches:

- `FORMAT_MIGRATION_ENABLED` (default on), turned off with `VITE_FORMAT_MIGRATION_DISABLED=true`.
- `FORMAT_REMAINING_REPORT_ENABLED` (default off), turned on with `VITE_FORMAT_REMAINING_REPORT=true`.
- `FORMAT_MIGRATION_SESSION_BUDGET` (2000 items per session).

## Runner

`run_format_migrations` in `src/services/format_retirement/runner.ts` runs every registered migrator in order. Each migrator has an `id`, a `version`, and four methods: `detect`, `rewrap_batch(ctx, limit)`, `count`, and `verify`.

For each class, the runner does the following:

1. It skips the class if the explicit record already lists it.
2. It calls `detect`. If old items may exist, it calls `rewrap_batch` in batches of 50 until the batch reports `done` or the session budget runs out.
3. It calls `count`, which takes a fresh reading from the server or vault and never uses cached progress. If any write failed or the count isn't zero, the class stays open.
4. It calls `verify`, checks that the vault is still unlocked for the same user, and then writes the class into the record through the vault write lock and the merging write.

Failure handling:

- A thrown error is retried after 2 s, 8 s, and 30 s, and then the class is deferred to the next session. Retries cover network, quota, and server errors.
- When the vault locks or the user changes, the run stops at the next item and writes nothing.
- A crash in the middle of a batch is safe, because each item is replaced only after its new copy has been opened again. The next session starts over, and items already migrated show up as current and are skipped.
- Two devices can run at once. Both write the same bound form for an item, and both markers merge into one record.
- The run starts 20 s after unlock, during browser idle time. It runs at most once per user per session and never blocks sign-in or the UI. Web: `start_format_retirement` in `src/services/format_retirement/index.ts`, called from `on_vault_stored` in `src/contexts/auth/vault_decryption.ts`.
- The run shows no prompts, warnings, or sign-outs.

## Classes

### `escrow_unbound`

- **Stored in:** `message_plaintext_escrow(user_id, message_id, encrypted_plaintext, plaintext_nonce)` (backend migration 333). The API is `GET /crypto/v1/ratchet/plaintexts?paged=true&limit=&cursor=` and `POST /crypto/v1/ratchet/plaintext`.
- **Layout:** AES-256-GCM under the account escrow key, with a 12-byte nonce.
  - Current form: AAD `"aster.escrow.v2\0" || message_id` for plain message ids. Message ids with the `v3:` prefix use `escrow_aad_v3`.
  - Old form: no AAD, under the escrow key or a legacy escrow key.
- **Migrator** (`migrators/escrow_unbound.ts`): opens each row that has no `v3:` prefix. A row that opens with the v2 AAD is current. A row that opens without AAD, under the current or a legacy key, is sealed again with the v2 AAD under the current key, opened again, and then upserted under the same `message_id`. Rows that don't open with any key are left alone and aren't counted.
- **Refusal:** `stored_unbound_policy("escrow_unbound")` in `aes_gcm_aad_fallback.ts`, used by `message_escrow.ts`.

### `mail_public_kek`

- **Stored in:** mail item envelopes and metadata that are wrapped under the built-in public mail KEKs.
- **Migrator:** the existing `mail_legacy_migration.ts` does the work and writes `mail_legacy_retired`. The class migrator (`migrators/mirrors.ts`) copies that marker into the record so mobile clients can read it.
- **Refusal:** with `after_marker`, `envelope.ts` and `legacy_ios_envelope.ts` stop trying the legacy keys. With `always`, the public KEKs are also never loaded into memory (`without_refused_public_keks` in `keys.ts`, applied in `memory_key_store.ts`).

### `storage_password_v1`

- **Stored in:** vault-protected local data that was sealed under the version 1 password storage key.
- **Migrator:** the existing storage rotation re-seals the data and adds the v1 key id to `retired_storage_kek_ids`. The class migrator (`migrators/storage_password_v1.ts`) only checks the result. The class is marked when the KDF is stretched, the data KEK is random, no rekey is pending, and the id of the v1 key derived from the password is retired.
- **Refusal:** `derive_password_storage_raws` in `memory_key_store.ts` stops deriving the v1 key.

### `recovery_escrow_legacy`

- **Stored in:** `recovery_key_escrow_blobs.sealed` (backend migration 495), using the legacy seal with optional AAD.
- **Migrator:** the existing `sync_recovery_escrow` re-seals the blob and sets `escrow_format = 2`. The class migrator copies that state into the record.
- **Refusal:** `open_legacy_account_key_from_escrow` uses `stored_unbound_policy("recovery_escrow_legacy")`.

### `inbound_unbound_marker`

- **Stored in:** `mail_items.encrypted_envelope` for received mail. The first byte is the marker: `0x02`, `0x03`, or `0x04` is unbound, and `0x05` or `0x06` is bound to the owner (backend `services/envelope_encryption.rs`).
- **Migrator:** none on the client, because the server owns these envelopes. Removing them requires new mail to use bound markers only and old mail to age out or be wrapped again.
- **Refusal:** `inbound_gcm_params` in `src/components/email/shared/decrypt_envelope.ts` calls `unbound_gcm` in `src/services/format_retirement/policies.ts`.

### `recovery_lane_unbound` and `ratchet_unbound`

These classes have refusal switches only (`ratchet_recovery_lane.ts`, and `double_ratchet.ts` through `ratchet_unbound_policy` in `policies.ts`). They need a migrator before they can move past `accept`.

## Backend additions

These additions are specified here and aren't built yet.

- `POST /crypto/v1/format_retirement/remaining`
  - Request body: `{ "v": 1, "counts": { "<class_id>": <non-negative integer> } }`.
  - Only known class ids are accepted, with at most one entry per class. The body carries no content, message ids, or device ids.
  - The server stores the latest counts per account (`account_format_remaining(user_id, class_id, remaining, reported_at)`) and keeps only the newest row.
  - It is rate-limited to one report per account per hour.
  - The client sends it only when `FORMAT_REMAINING_REPORT_ENABLED` is on.
- `GET /admin/format_retirement/summary` returns, for each class, the number of accounts that reported a nonzero count, the total remaining, and the newest report time. It returns no account ids.

## Production count queries

These queries are read-only. Run them against a replica, or in a read-only transaction (`BEGIN READ ONLY; ... ROLLBACK;`).

The vault is encrypted, so the server can't see the record. These queries count what the server can observe.

```sql
SELECT count(*) AS rows, count(DISTINCT user_id) AS accounts
FROM message_plaintext_escrow
WHERE message_id NOT LIKE 'v3:%'
  AND (expires_at IS NULL OR expires_at > now());
```

This is the upper bound for `escrow_unbound`. The server can't tell a v2-bound row from an unbound one.

```sql
SELECT get_byte(encrypted_envelope, 0) AS marker, count(*) AS items,
       count(DISTINCT user_id) AS accounts
FROM mail_items
WHERE item_type = 'received' AND octet_length(encrypted_envelope) > 0
GROUP BY 1 ORDER BY 1;
```

This counts `inbound_unbound_marker` items: markers 2, 3, and 4 are unbound. The query assumes that the stored envelope starts with the marker byte.

```sql
SELECT bound_envelope_version, count(*) AS accounts
FROM client_envelope_capabilities GROUP BY 1 ORDER BY 1;
```

This shows which clients can receive bound envelopes (backend migration 692).

```sql
SELECT count(*) AS accounts FROM recovery_key_escrow_blobs;
```

This counts accounts that have a recovery escrow blob. The format is inside the vault, so the per-account remaining count comes from the report endpoint.

```sql
SELECT vault_kdf_iterations, count(*) AS accounts
FROM encrypted_key_vault GROUP BY 1 ORDER BY 1;
```

This approximates the `storage_password_v1` population (backend migration 684). `NULL` means the account hasn't reported yet.

```sql
SELECT storage_rekey_level, count(*) AS accounts FROM users GROUP BY 1 ORDER BY 1;
```

This shows storage rekey progress (backend migration 682).

## Removal phases

Each class moves through four phases in order. A class doesn't advance until it meets the exit criteria for its current phase.

1. **Migrated.** The migrator ships on every client that writes the class, and every writer produces the bound form.
   - Exit criteria: release adoption above 95% on all platforms.
2. **Counts at zero.** The remaining report is turned on, and the counts above are watched.
   - Exit criteria: for 30 days, no account reports a nonzero count, and the server-side queries show no growth.
3. **Refused by config.** The class switch moves from `accept` to `after_marker`, and then to `always`.
   - Exit criteria: no support reports of unreadable mail for 30 days after the switch moves to `always`.
4. **Code deleted.** Remove the old read path, the migrator, and the switch. Keep the class id in the record, because old vaults may still list it.

To roll back a class, change its switch in `switches.ts`. Record entries stay in place, and moving a switch back to `accept` reopens old items right away.
