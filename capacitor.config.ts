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
import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.astermail.app",
  appName: "Aster Mail",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "astermail",
  },
  plugins: {
    PushNotifications: {
      presentationOptions: ["badge", "sound"],
    },
    SplashScreen: {
      launchShowDuration: 0,
      backgroundColor: "#121212",
      launchAutoHide: false,
      showSpinner: false,
    },
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    LocalNotifications: {
      smallIcon: "ic_stat_notification",
      iconColor: "#6366f1",
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#121212",
    },
  },
  backgroundColor: "#121212",
  android: {
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
    backgroundColor: "#121212",
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    allowsLinkPreview: false,
    backgroundColor: "#121212",
  },
};

export default config;
