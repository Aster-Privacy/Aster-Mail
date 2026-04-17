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
import { Capacitor } from "@capacitor/core";
import {
  App,
  type URLOpenListenerEvent,
  type BackButtonListenerEvent,
} from "@capacitor/app";
import { SplashScreen } from "@capacitor/splash-screen";
import { StatusBar, Style } from "@capacitor/status-bar";
import { Keyboard, type KeyboardInfo } from "@capacitor/keyboard";
import { Network, type ConnectionStatus } from "@capacitor/network";

import { register_push_notifications } from "./push_notifications";
import { handle_deep_link } from "./deep_link_handler";
import { initialize_share_receiver } from "./share_receiver";
import {
  initialize_offline_queue,
  process_offline_queue,
} from "./offline_queue";

let is_initialized = false;

export function is_native_platform(): boolean {
  return Capacitor.isNativePlatform();
}

export function get_platform(): "ios" | "android" | "web" {
  return Capacitor.getPlatform() as "ios" | "android" | "web";
}

export async function initialize_capacitor(): Promise<void> {
  if (is_initialized || !is_native_platform()) {
    return;
  }

  is_initialized = true;

  await Promise.all([
    setup_status_bar(),
    setup_keyboard_listeners(),
    setup_app_state_listener(),
    setup_network_listener(),
    register_push_notifications(),
    initialize_share_receiver(),
    initialize_offline_queue(),
  ]);

  App.addListener("appUrlOpen", (event: URLOpenListenerEvent) => {
    handle_deep_link(event.url);
  });

  try {
    const launch_url = await App.getLaunchUrl();

    if (launch_url?.url) {
      handle_deep_link(launch_url.url);
    }
  } catch {
    /* no launch url */
  }

  App.addListener("backButton", ({ canGoBack }: BackButtonListenerEvent) => {
    const event = new CustomEvent("capacitor:backbutton", { cancelable: true });
    const was_handled = !window.dispatchEvent(event);

    if (was_handled) return;

    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });
}

export async function hide_splash(): Promise<void> {
  if (!is_native_platform()) return;
  await SplashScreen.hide({ fadeOutDuration: 200 });
}

async function setup_status_bar(): Promise<void> {
  if (!is_native_platform()) return;

  const is_dark =
    document.documentElement.classList.contains("dark") ||
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  await StatusBar.setStyle({ style: is_dark ? Style.Dark : Style.Light });

  if (get_platform() === "android") {
    await StatusBar.setBackgroundColor({
      color: is_dark ? "#121212" : "#ffffff",
    });
  }
}

export async function update_status_bar_theme(is_dark: boolean): Promise<void> {
  if (!is_native_platform()) return;

  await StatusBar.setStyle({ style: is_dark ? Style.Dark : Style.Light });

  if (get_platform() === "android") {
    await StatusBar.setBackgroundColor({
      color: is_dark ? "#121212" : "#ffffff",
    });
  }
}

async function setup_keyboard_listeners(): Promise<void> {
  if (!is_native_platform()) return;

  Keyboard.addListener("keyboardWillShow", (info: KeyboardInfo) => {
    document.body.style.setProperty(
      "--keyboard-height",
      `${info.keyboardHeight}px`,
    );
    document.body.classList.add("keyboard-visible");
  });

  Keyboard.addListener("keyboardWillHide", () => {
    document.body.style.setProperty("--keyboard-height", "0px");
    document.body.classList.remove("keyboard-visible");
  });
}

type AppStateCallback = (is_active: boolean) => void;
const app_state_listeners: AppStateCallback[] = [];

async function setup_app_state_listener(): Promise<void> {
  if (!is_native_platform()) return;

  App.addListener("appStateChange", ({ isActive }: { isActive: boolean }) => {
    app_state_listeners.forEach((callback) => callback(isActive));

    if (isActive) {
      process_offline_queue();
    }
  });
}

export function add_app_state_listener(callback: AppStateCallback): () => void {
  app_state_listeners.push(callback);

  return () => {
    const index = app_state_listeners.indexOf(callback);

    if (index > -1) {
      app_state_listeners.splice(index, 1);
    }
  };
}

type NetworkStatusCallback = (status: ConnectionStatus) => void;
const network_listeners: NetworkStatusCallback[] = [];

async function setup_network_listener(): Promise<void> {
  if (!is_native_platform()) return;

  Network.addListener("networkStatusChange", (status: ConnectionStatus) => {
    network_listeners.forEach((callback) => callback(status));

    if (status.connected) {
      process_offline_queue();
    }
  });
}

export function add_network_listener(
  callback: NetworkStatusCallback,
): () => void {
  network_listeners.push(callback);

  return () => {
    const index = network_listeners.indexOf(callback);

    if (index > -1) {
      network_listeners.splice(index, 1);
    }
  };
}

export async function get_network_status(): Promise<ConnectionStatus> {
  if (!is_native_platform()) {
    return { connected: navigator.onLine, connectionType: "wifi" };
  }

  return Network.getStatus();
}
