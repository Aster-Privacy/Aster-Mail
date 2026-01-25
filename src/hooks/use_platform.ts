import { useState, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";

export type Platform = "ios" | "android" | "web";
export type DeviceType = "phone" | "tablet" | "desktop";

export interface PlatformInfo {
  platform: Platform;
  device_type: DeviceType;
  is_native: boolean;
  is_ios: boolean;
  is_android: boolean;
  is_web: boolean;
  is_phone: boolean;
  is_tablet: boolean;
  is_desktop: boolean;
  is_touch_device: boolean;
  is_standalone: boolean;
  safe_area_insets: SafeAreaInsets;
  screen_width: number;
  screen_height: number;
  viewport_width: number;
  viewport_height: number;
}

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const TABLET_MIN_WIDTH = 768;
const DESKTOP_MIN_WIDTH = 1024;

function get_platform(): Platform {
  if (Capacitor.isNativePlatform()) {
    return Capacitor.getPlatform() as Platform;
  }

  return "web";
}

function get_device_type(width: number): DeviceType {
  if (width >= DESKTOP_MIN_WIDTH) return "desktop";
  if (width >= TABLET_MIN_WIDTH) return "tablet";

  return "phone";
}

function is_touch_device(): boolean {
  if (typeof window === "undefined") return false;

  return (
    "ontouchstart" in window ||
    navigator.maxTouchPoints > 0 ||
    // @ts-expect-error - msMaxTouchPoints is IE specific
    navigator.msMaxTouchPoints > 0
  );
}

function is_standalone_mode(): boolean {
  if (typeof window === "undefined") return false;

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // @ts-expect-error - navigator.standalone is iOS Safari specific
    window.navigator.standalone === true
  );
}

function get_safe_area_insets(): SafeAreaInsets {
  if (typeof window === "undefined") {
    return { top: 0, bottom: 0, left: 0, right: 0 };
  }

  const style = getComputedStyle(document.documentElement);

  return {
    top:
      parseInt(style.getPropertyValue("--sat") || "0", 10) ||
      parseInt(style.getPropertyValue("env(safe-area-inset-top)") || "0", 10),
    bottom:
      parseInt(style.getPropertyValue("--sab") || "0", 10) ||
      parseInt(
        style.getPropertyValue("env(safe-area-inset-bottom)") || "0",
        10,
      ),
    left:
      parseInt(style.getPropertyValue("--sal") || "0", 10) ||
      parseInt(style.getPropertyValue("env(safe-area-inset-left)") || "0", 10),
    right:
      parseInt(style.getPropertyValue("--sar") || "0", 10) ||
      parseInt(style.getPropertyValue("env(safe-area-inset-right)") || "0", 10),
  };
}

function create_platform_info(): PlatformInfo {
  const platform = get_platform();
  const screen_width = typeof window !== "undefined" ? window.screen.width : 0;
  const screen_height =
    typeof window !== "undefined" ? window.screen.height : 0;
  const viewport_width = typeof window !== "undefined" ? window.innerWidth : 0;
  const viewport_height =
    typeof window !== "undefined" ? window.innerHeight : 0;
  const device_type = get_device_type(viewport_width);
  const is_native = Capacitor.isNativePlatform();

  return {
    platform,
    device_type,
    is_native,
    is_ios: platform === "ios",
    is_android: platform === "android",
    is_web: platform === "web",
    is_phone: device_type === "phone",
    is_tablet: device_type === "tablet",
    is_desktop: device_type === "desktop",
    is_touch_device: is_touch_device(),
    is_standalone: is_standalone_mode(),
    safe_area_insets: get_safe_area_insets(),
    screen_width,
    screen_height,
    viewport_width,
    viewport_height,
  };
}

export function use_platform(): PlatformInfo {
  const [platform_info, set_platform_info] =
    useState<PlatformInfo>(create_platform_info);

  const update_platform_info = useCallback(() => {
    set_platform_info(create_platform_info());
  }, []);

  useEffect(() => {
    window.addEventListener("resize", update_platform_info);
    window.addEventListener("orientationchange", update_platform_info);

    const media_query = window.matchMedia("(display-mode: standalone)");

    media_query.addEventListener("change", update_platform_info);

    return () => {
      window.removeEventListener("resize", update_platform_info);
      window.removeEventListener("orientationchange", update_platform_info);
      media_query.removeEventListener("change", update_platform_info);
    };
  }, [update_platform_info]);

  return platform_info;
}

export function use_is_mobile(): boolean {
  const { is_phone, is_tablet, is_native } = use_platform();

  return is_phone || (is_tablet && is_native);
}

export function use_is_tablet(): boolean {
  const { is_tablet } = use_platform();

  return is_tablet;
}

export function use_show_mobile_ui(): boolean {
  const { is_phone, is_native, viewport_width } = use_platform();

  return is_phone || (is_native && viewport_width < TABLET_MIN_WIDTH);
}

export function use_show_tablet_split_view(): boolean {
  const { is_tablet, is_native, viewport_width } = use_platform();

  return (is_tablet || viewport_width >= TABLET_MIN_WIDTH) && is_native;
}

export function use_safe_area_insets(): SafeAreaInsets {
  const { safe_area_insets } = use_platform();

  return safe_area_insets;
}
