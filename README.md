<img width="200" alt="Aster" src="https://raw.githubusercontent.com/Aster-Privacy/.github/main/profile/aster_logo.png" />

# Aster Mail

Aster Mail is a free, open-source, end-to-end encrypted mail service. Every message subject line and attachment is encrypted locally on your device. This means we have no way to read your email and we never will.

You can sign up at [astermail.org](https://astermail.org). A phone number and recovery email are not required.

## How it works

All Aster-to-Aster messages are end-to-end encrypted using the standard OpenPGP (Ed25519 and Curve25519). Subject lines are also encrypted. This means that we cannot read your subject lines, unlike other providers. Aster-to-Aster messages also use ML-KEM-768 inside an X3DH and Double Ratchet protocol, which protects against store-now-decrypt-later attacks.

Your keys are yours, and they are fully portable. You can export them and use them with GPG or any OpenPGP client. Public keys are published through WKD and key servers automatically, so encrypting to other Aster users happens without any setup.

Aster runs on a zero-access architecture located in Germany. This means we store nothing we could hand over, even if we were compelled.

## Getting started

Go to [astermail.org](https://astermail.org) to create a free account. If you would like to contribute code to Aster, see [CONTRIBUTING.md](https://github.com/Aster-Privacy/.github/blob/main/CONTRIBUTING.md) for instructions.

## Building from source

You can build Aster Mail yourself from this repository. It builds into a web bundle and a desktop app for Windows, macOS, and Linux. There is no account or API key involved, and you do not need to write a `.env` file. These are the same steps our release workflow runs.

You will need [Node.js](https://nodejs.org) 20 or later and a stable [Rust](https://rustup.rs) toolchain. On Debian or Ubuntu, the desktop build also needs a few system libraries:

```bash
sudo apt-get install libwebkit2gtk-4.1-dev libayatana-appindicator3-dev librsvg2-dev libxdo-dev libssl-dev build-essential file
```

Aster Mail shares its interface components with our other apps through [aster-ui](https://github.com/Aster-Privacy/aster-ui), so you will need to clone it next to Aster Mail and build it first. Installing will fail if it is not there:

```bash
git clone https://github.com/Aster-Privacy/aster-ui.git
git clone https://github.com/Aster-Privacy/Aster-Mail.git
cd aster-ui && npm install && npm run build
cd ../Aster-Mail && npm install --force
```

To build the web app:

```bash
npm run build
```

The build is written to `dist/`. You can serve it with any static web server.

The desktop app updates itself through GitHub Releases, so Tauri asks for a signing key even on a local build. Generate one once. It will only ever sign your own builds, and you can leave the password empty:

```bash
npm run tauri signer generate -- -w ~/.aster_updater.key
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.aster_updater.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""
npm run tauri:build
```

Installers and binaries are written to `src-tauri/target/release/bundle/`.

The Android project in this repository is a development wrapper. The app we publish to Google Play is built from [Aster-Android](https://github.com/Aster-Privacy/Aster-Android).

## Community

Join our [Discord](https://discord.gg/R4XqRUfgWZ) to share feedback, ask questions, and contribute to the privacy community. You can also find us on [X](https://x.com/AsterPrivacy) and [Reddit](https://www.reddit.com/r/AsterPrivacy).

If you have any questions or security disclosures, email us at [hello@astermail.org](mailto:hello@astermail.org) or [security@astermail.org](mailto:security@astermail.org). **Do not open a public issue for security vulnerabilities.** Read [SECURITY.md](SECURITY.md) for the full security vulnerability disclosure process.

## Contributing

We welcome contributions of all kinds. Read [CONTRIBUTING.md](https://github.com/Aster-Privacy/.github/blob/main/CONTRIBUTING.md) before opening a pull request.

By contributing to any Aster repository, you agree that your contributions will be licensed under [AGPL v3](https://www.gnu.org/licenses/agpl-3.0.en.html).
