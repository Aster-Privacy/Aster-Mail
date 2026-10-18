# Desktop auto-update

The Aster Mail desktop app (Tauri) checks for new versions by fetching:

```
https://github.com/Aster-Privacy/Aster-Mail/releases/latest/download/latest_v2.json
```

This URL always resolves to the asset of the latest published GitHub Release. The desktop client verifies the bundle signature against the embedded ed25519 public key before applying any update.

## Updater key rotation

Aster Mail moved to its own updater key, minisign key ID `932A773924570BC5`. Releases before this change trust the previous key, `C6AD17B1E5D340F1`, and read `latest.json`. Releases from this change onward trust only the new key and read `latest_v2.json`.

During the transition, every release is signed with both keys:

- Each updater bundle gets a `.sig` file from the previous key and a `.v2.sig` file from the new key.
- `latest.json` lists the `.sig` signatures, so installs on older versions can still update.
- `latest_v2.json` lists the `.v2.sig` signatures for the same platforms.

Keep signing with both keys until nearly every install runs a version that reads `latest_v2.json`. After that, stop publishing `latest.json` and remove the previous key from CI.

## How CI signs updates

`release.yml` keeps the updater keys away from build-time code:

1. The `build` legs run with a read-only token. Each leg generates a throwaway updater key, builds with it, and uploads the unsigned bundles as artifacts.
2. The `sign` job has no token permissions and runs no project code. It installs `@tauri-apps/cli` at a pinned version, checks it against a pinned sha512 hash, and signs every bundle with `TAURI_SIGNING_PRIVATE_KEY` (the previous key) and `TAURI_SIGNING_PRIVATE_KEY_V2` (the new key).
3. The `publish` job uploads the bundles, their fixed-name copies, and both signature sets, then builds `latest.json` and `latest_v2.json`.
4. `promote_to_latest` marks the release as **Latest** only when both manifests report the release version and list Windows, macOS, and Linux x64.

`linux_arm_appimage.yml` follows the same split: the build job has a read-only token, a separate job signs the AppImage with both keys, and a third job attaches the AppImage and both signatures to the release you name.

## Release flow

1. Bump the version in **all** of these files (must match):
   - `package.json` -> `version`
   - `src-tauri/tauri.conf.json` -> `version`
   - `src-tauri/Cargo.toml` -> `[package].version`
2. Build per-platform bundles on the target OS:
   - macOS (universal): `npm run tauri:build:universal`
   - Windows: `npm run tauri:build`
   - Linux: `npm run tauri:build`
3. Sign each updater bundle with both updater keys. The keys are **not** in this repo. Sign once with each key and keep both signatures:
   ```
   TAURI_SIGNING_PRIVATE_KEY="$(cat <path to the previous updater key>)"    TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<its password>"    npm run tauri -- signer sign "<bundle>"
   mv "<bundle>.sig" "<bundle>.sig.v1"
   TAURI_SIGNING_PRIVATE_KEY="$(cat <path to the new updater key>)"    TAURI_SIGNING_PRIVATE_KEY_PASSWORD="<its password>"    npm run tauri -- signer sign "<bundle>"
   mv "<bundle>.sig" "<bundle>.v2.sig"
   mv "<bundle>.sig.v1" "<bundle>.sig"
   ```
4. You now have a `.sig` file (previous key) and a `.v2.sig` file (new key) next to each bundle.
5. Create a GitHub Release tagged `v<version>` and upload:
   - The versioned Tauri bundles with their `.sig` and `.v2.sig` files (for example `Aster.Mail_<version>_x64-setup.exe`, `Aster.Mail_<version>_x64_en-US.msi`, `Aster.Mail_<version>_amd64.AppImage`, `Aster.Mail_<version>_universal.dmg`, `Aster.Mail_universal.app.tar.gz`)
   - Fixed-name copies that the website download links depend on: `Aster-Mail-x64-setup.exe`, `Aster-Mail-x64.msi`, `Aster-Mail-x64.AppImage`, `Aster-Mail-amd64.deb`, `Aster-Mail-x86_64.rpm`, `Aster-Mail-universal.dmg`, `Aster-Mail.apk`, each with its `.sig` and `.v2.sig` where they exist
   - `latest.json` and `latest_v2.json` (see the template below)
6. Start the release body with the Aster Mail wordmark and the standard alert, then the release notes:
   ```
   <p align="left">
     <picture>
       <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/Aster-Privacy/Aster-Mail/01a79449e4706b43cd790419736ed24bfbea95c0/public/aster_mail_logo_dark.png">
       <img alt="Aster Mail" src="https://raw.githubusercontent.com/Aster-Privacy/Aster-Mail/01a79449e4706b43cd790419736ed24bfbea95c0/public/aster_mail_logo_light.png" width="320">
     </picture>
   </p>

   > [!NOTE]
   > These files are for new installations. If Aster Mail is already installed, it updates automatically.
   ```
   The `promote_to_latest` job in `release.yml` adds both of these to any release that is missing them, so you only write this by hand for a release you publish outside the workflow.
7. Mark the release as **Latest**. The desktop clients will pick it up on next check (every 6 hours, or manually via Settings -> Updates).

## Mac builds made by hand

When you build the macOS app on a Mac instead of in CI, sign `Aster.Mail_<version>_universal.app.tar.gz` with both keys as described in step 3. Upload the bundle, its `.sig`, and its `.v2.sig`, then add the `darwin-aarch64`, `darwin-x86_64`, `darwin-aarch64-app`, and `darwin-x86_64-app` entries to both manifests: use the `.sig` contents in `latest.json` and the `.v2.sig` contents in `latest_v2.json`. If only one manifest gets the entries, Mac installs on the other key stop updating.

## Manifest template

`latest.json` and `latest_v2.json` have the same shape and list the same platforms. In `latest.json`, the `signature` field is the literal contents of the matching `.sig` file. In `latest_v2.json`, it is the contents of the matching `.v2.sig` file. The `url` fields point at the same release's assets.

```json
{
  "version": "1.4.0",
  "notes": "What's new in this release",
  "pub_date": "2026-05-20T12:00:00Z",
  "platforms": {
    "darwin-x86_64": {
      "signature": "<contents of Aster.Mail_universal.app.tar.gz.sig>",
      "url": "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v1.4.0/Aster.Mail_universal.app.tar.gz"
    },
    "darwin-aarch64": {
      "signature": "<same as darwin-x86_64 for universal builds>",
      "url": "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v1.4.0/Aster.Mail_universal.app.tar.gz"
    },
    "windows-x86_64": {
      "signature": "<contents of Aster-Mail-x64-setup.exe.sig>",
      "url": "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v1.4.0/Aster-Mail-x64-setup.exe"
    },
    "windows-x86_64-msi": {
      "signature": "<contents of Aster-Mail-x64.msi.sig>",
      "url": "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v1.4.0/Aster-Mail-x64.msi"
    },
    "linux-x86_64": {
      "signature": "<contents of Aster-Mail-x64.AppImage.sig>",
      "url": "https://github.com/Aster-Privacy/Aster-Mail/releases/download/v1.4.0/Aster-Mail-x64.AppImage"
    }
  }
}
```

## Signing keys

Both ed25519 keypairs were generated with `tauri signer generate`. The new public key, embedded in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`, is safe to publish. Never commit a private key. Store each one in a password manager and in CI: the previous key as `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`, and the new key as `TAURI_SIGNING_PRIVATE_KEY_V2` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD_V2`. If you lose a private key, every install that trusts it stops updating until the user reinstalls, so keep a backup.
