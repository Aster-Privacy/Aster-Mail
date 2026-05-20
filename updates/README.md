# Desktop auto-update

The Aster Mail desktop app (Tauri) checks for new versions by fetching:

```
https://github.com/Aster-Privacy/Aster-Mail/releases/latest/download/latest.json
```

This URL always resolves to the asset of the latest published GitHub Release. The desktop client verifies the bundle signature against the embedded ed25519 public key before applying any update.

## Release flow

1. Bump the version in **all** of these files (must match):
   - `package.json` -> `version`
   - `src-tauri/tauri.conf.json` -> `version`
   - `src-tauri/Cargo.toml` -> `[package].version`
   - `CLAUDE.md` -> the `> **Version: X.Y.Z**` header
2. Build per-platform bundles on the target OS:
   - macOS (universal): `npm run tauri:build:universal`
   - Windows: `npm run tauri:build`
   - Linux: `npm run tauri:build`
3. Sign the bundles. The signing key is **not** in this repo. Set the env var before building:
   ```
   export TAURI_SIGNING_PRIVATE_KEY="$(cat /path/to/tauri_updater_priv.key)"
   export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
   ```
4. Tauri emits each bundle plus a matching `.sig` file under `src-tauri/target/release/bundle/`.
5. Create a GitHub Release tagged `v<version>` and upload:
   - `Aster_Mail_<version>_universal.app.tar.gz` + `.sig` (macOS)
   - `Aster_Mail_<version>_x64_en-US.msi` + `.sig` (Windows)
   - `aster-mail_<version>_amd64.AppImage` + `.sig` (Linux)
   - `latest.json` (see template below)
6. Mark the release as **Latest**. The desktop clients will pick it up on next check (every 6 hours, or manually via Settings -> Updates).

## latest.json template

The `signature` field is the literal contents of the matching `.sig` file. The `url` fields point at the same release's assets.

```json
{
  "version": "1.4.0",
  "notes": "What's new in this release",
  "pub_date": "2026-05-20T12:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "<contents of Aster_Mail_1.4.0_universal.app.tar.gz.sig>",
      "url": "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v1.4.0/Aster_Mail_1.4.0_universal.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "<same as darwin-x86_64 for universal builds>",
      "url": "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v1.4.0/Aster_Mail_1.4.0_universal.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<contents of Aster_Mail_1.4.0_x64_en-US.msi.zip.sig>",
      "url": "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v1.4.0/Aster_Mail_1.4.0_x64_en-US.msi.zip"
    },
    "linux-x86_64": {
      "signature": "<contents of aster-mail_1.4.0_amd64.AppImage.sig>",
      "url": "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v1.4.0/aster-mail_1.4.0_amd64.AppImage"
    }
  }
}
```

## Signing key

The ed25519 keypair was generated with `tauri signer generate`. The public key (embedded in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`) is safe to publish. The private key must NEVER be committed; store it in a password manager and in CI as `TAURI_SIGNING_PRIVATE_KEY`. Losing the private key means breaking auto-update for every shipped client until they manually reinstall - generate carefully and back it up.
