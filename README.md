# Aster Mail

End-to-end encrypted email client for web, iOS, and Android.

## Overview

Aster Mail is a cross-platform email client built with React and Capacitor. All encryption and decryption happens locally on the device using OpenPGP. The server never has access to plaintext message content, private keys, or unencrypted metadata.

The client connects to the Aster Backend API for message storage, synchronization, and delivery. Messages are encrypted before leaving the device and decrypted only after retrieval.

## Requirements

- Node.js 18+
- npm 9+
- Xcode 15+ (for iOS builds)
- Android Studio Hedgehog or later (for Android builds)

## Setup

Clone the repository and install dependencies:

```bash
git clone git@github.com:Aster-Privacy/Aster-Mail.git
cd Aster-Mail
npm install
```

Create a `.env` file with the API endpoint:

```
VITE_API_URL=https://api.aster.example
```

## Development

Start the development server:

```bash
npm run dev
```

The app will be available at `http://localhost:5173` by default.

## Building

### Web

```bash
npm run build
```

The production build will be in the `dist` directory.

### iOS

Build web assets and sync with the native project:

```bash
npm run build:mobile
npm run cap:open:ios
```

From Xcode, select your target device and run the build.

### Android

```bash
npm run build:mobile
npm run cap:open:android
```

Build and run from Android Studio.

## Project Structure

```
src/
  components/    Reusable UI components
  config/        App configuration
  constants/     Static values and enums
  contexts/      React context providers
  hooks/         Custom React hooks
  layouts/       Page layout wrappers
  lib/           Utility libraries
  native/        Capacitor native integrations
  pages/         Route components
  services/      API clients and encryption services
  types/         TypeScript definitions
  utils/         Helper functions

android/         Android native project
ios/             iOS native project
```

## Encryption

All message content is encrypted using OpenPGP before transmission. The client fetches recipient public keys from the server or via WKD, encrypts locally, and sends only encrypted payloads. Decryption uses the user's private key, which never leaves the device.

## Tech Stack

- React 18
- TypeScript 5
- Vite
- Tailwind CSS
- Capacitor 6
- OpenPGP.js

## License

AGPL-3.0. See [LICENSE](LICENSE) for details.
