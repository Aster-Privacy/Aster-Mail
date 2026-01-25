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

  App.addListener("backButton", ({ canGoBack }: BackButtonListenerEvent) => {
    if (canGoBack) {
      window.history.back();
    } else {
      App.exitApp();
    }
  });

  await SplashScreen.hide();
}

async function setup_status_bar(): Promise<void> {
  if (!is_native_platform()) return;

  const is_dark = document.documentElement.classList.contains("dark");

  await StatusBar.setStyle({ style: is_dark ? Style.Dark : Style.Light });

  if (get_platform() === "android") {
    await StatusBar.setBackgroundColor({
      color: is_dark ? "#0a0a0a" : "#ffffff",
    });
  }
}

export async function update_status_bar_theme(is_dark: boolean): Promise<void> {
  if (!is_native_platform()) return;

  await StatusBar.setStyle({ style: is_dark ? Style.Dark : Style.Light });

  if (get_platform() === "android") {
    await StatusBar.setBackgroundColor({
      color: is_dark ? "#0a0a0a" : "#ffffff",
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
