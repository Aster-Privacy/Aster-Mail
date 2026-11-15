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
import type { ComponentType, ReactNode } from "react";

import { useEffect, useState } from "react";
import {
  FaAndroid,
  FaApple,
  FaLinux,
  FaUbuntu,
  FaWindows,
} from "react-icons/fa";
import {
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
} from "@heroicons/react/24/outline";

import { BrowserIcon } from "@/components/settings/security/browser_icon";
import { use_i18n } from "@/lib/i18n/context";
import { cn } from "@/lib/utils";
import { app_locale } from "@/utils/date_format";

type IconComponent = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean;
}>;

interface BrandIcon {
  match: RegExp;
  icon: IconComponent;
}

const OS_ICONS: BrandIcon[] = [
  { match: /windows/i, icon: FaWindows },
  { match: /android/i, icon: FaAndroid },
  { match: /ios|iphone|ipad|mac|os x|darwin/i, icon: FaApple },
  { match: /ubuntu/i, icon: FaUbuntu },
  { match: /linux|fedora|debian|arch|chrome ?os/i, icon: FaLinux },
];

function find_brand(list: BrandIcon[], name: string | null | undefined) {
  if (!name) return null;

  return list.find((entry) => entry.match.test(name)) ?? null;
}

export function GuardOsIcon({
  os,
  device_type,
  className,
}: {
  os?: string | null;
  device_type?: string | null;
  className?: string;
}) {
  const brand = find_brand(OS_ICONS, os);

  if (brand) {
    const Icon = brand.icon;

    return (
      <Icon
        aria-hidden
        className={cn("h-5 w-5 text-txt-secondary", className)}
      />
    );
  }
  const Fallback =
    device_type === "mobile" ? DevicePhoneMobileIcon : ComputerDesktopIcon;

  return (
    <Fallback
      aria-hidden
      className={cn("h-5 w-5 text-txt-secondary", className)}
    />
  );
}

export type GuardDevicePlatform =
  | "browser"
  | "android"
  | "apple"
  | "windows"
  | "linux";

const BROWSER_NAME =
  /edge|chrome|chromium|firefox|safari|brave|opera|vivaldi|duckduckgo/i;

const PLATFORM_NAMES: [Exclude<GuardDevicePlatform, "browser">, RegExp][] = [
  ["windows", /windows/i],
  [
    "android",
    /android|pixel|galaxy|samsung|oneplus|xiaomi|redmi|motorola|huawei|oppo|nokia|fairphone/i,
  ],
  ["apple", /ios|iphone|ipad|mac|os x|darwin/i],
  ["linux", /linux|ubuntu|fedora|debian|arch|chrome ?os/i],
];

const PLATFORM_ICONS: Record<
  Exclude<GuardDevicePlatform, "browser">,
  IconComponent
> = {
  android: FaAndroid,
  apple: FaApple,
  windows: FaWindows,
  linux: FaLinux,
};

export function guard_device_platform(
  name: string,
  device_type: string,
): GuardDevicePlatform | null {
  if (device_type === "web" && BROWSER_NAME.test(name)) return "browser";

  return PLATFORM_NAMES.find(([, match]) => match.test(name))?.[0] ?? null;
}

export function GuardDeviceIcon({
  name,
  device_type,
  className,
  "data-testid": test_id,
}: {
  name: string;
  device_type: string;
  className?: string;
  "data-testid"?: string;
}) {
  const platform = guard_device_platform(name, device_type);
  const Icon =
    platform === null
      ? GlobeAltIcon
      : platform === "browser"
        ? null
        : PLATFORM_ICONS[platform];

  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-5 w-5 shrink-0 items-center justify-center [&>svg]:h-5 [&>svg]:w-5",
        className,
      )}
      data-platform={platform ?? "unknown"}
      data-testid={test_id}
    >
      {Icon ? (
        <Icon aria-hidden className="text-txt-secondary" />
      ) : (
        <BrowserIcon browser={name} />
      )}
    </span>
  );
}

export function GuardBrowserIcon({
  browser,
  className,
}: {
  browser?: string | null;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex h-4 w-4 shrink-0 items-center justify-center text-txt-muted [&>svg]:h-4 [&>svg]:w-4",
        className,
      )}
    >
      <BrowserIcon browser={browser ?? ""} />
    </span>
  );
}

function capitalize_first(text: string): string {
  if (!text) return text;

  return text.charAt(0).toLocaleUpperCase(app_locale()) + text.slice(1);
}

export function format_guard_relative(iso: string, now: number): string {
  const ms = Date.parse(iso);

  if (Number.isNaN(ms)) return "";

  return capitalize_first(relative_text(ms, now));
}

function relative_text(ms: number, now: number): string {
  const seconds = Math.round((ms - now) / 1000);
  const format = new Intl.RelativeTimeFormat(app_locale(), { numeric: "auto" });
  const abs = Math.abs(seconds);

  if (abs < 45) return format.format(0, "second");
  if (abs < 3600) return format.format(Math.round(seconds / 60), "minute");
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), "hour");

  return format.format(Math.round(seconds / 86_400), "day");
}

export function format_guard_countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;

  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function use_guard_now(interval_ms = 1000): number {
  const [now, set_now] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => set_now(Date.now()), interval_ms);

    return () => window.clearInterval(timer);
  }, [interval_ms]);

  return now;
}

export function GuardLogo({ className }: { className?: string }) {
  const { t } = use_i18n();

  return (
    <div className={cn("flex justify-center", className)}>
      <img
        alt={t("common.aster_mail")}
        className="h-8 w-auto"
        decoding="async"
        draggable={false}
        height={32}
        src="/text_logo.png"
        width={129}
      />
    </div>
  );
}

type TileTone = "neutral" | "brand" | "danger" | "warning" | "success";

const TILE_TONES: Record<TileTone, string> = {
  neutral: "text-txt-secondary",
  brand: "text-brand",
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-600 dark:text-amber-400",
  success: "text-emerald-600 dark:text-emerald-400",
};

const TILE_TINTS: Record<TileTone, string> = {
  neutral: "bg-surf-tertiary",
  brand: "bg-brand/10",
  danger: "bg-red-500/10",
  warning: "bg-amber-500/15",
  success: "bg-emerald-500/15",
};

const TILE_SIZES = {
  md: "h-6 min-w-6",
  lg: "h-12 w-12 [&>svg]:h-11 [&>svg]:w-11",
  tinted: "h-9 w-9 rounded-xl [&>svg]:h-5 [&>svg]:w-5",
} as const;

export function GuardIconTile({
  children,
  tone = "neutral",
  size = "md",
  className,
}: {
  children: ReactNode;
  tone?: TileTone;
  size?: keyof typeof TILE_SIZES;
  className?: string;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "flex shrink-0 items-center justify-center",
        TILE_SIZES[size],
        TILE_TONES[tone],
        size === "tinted" && TILE_TINTS[tone],
        className,
      )}
    >
      {children}
    </div>
  );
}

export function GuardDetailRow({
  icon,
  label,
  primary,
  secondary,
  test_id,
}: {
  icon: ReactNode;
  label: string;
  primary: ReactNode;
  secondary?: ReactNode;
  test_id?: string;
}) {
  return (
    <div
      className="grid grid-cols-[24px_minmax(0,1fr)] items-center gap-x-3"
      data-testid={test_id}
    >
      <dt className="col-start-2 text-[11px] font-medium uppercase tracking-wide text-txt-muted">
        {label}
      </dt>
      <div
        aria-hidden
        className="col-start-1 flex h-5 w-6 items-center justify-center text-txt-secondary [&>svg]:h-5 [&>svg]:w-5"
      >
        {icon}
      </div>
      <dd className="col-start-2 flex min-w-0 items-center gap-1.5 text-sm font-medium text-txt-primary">
        {primary}
      </dd>
      {secondary && (
        <dd className="col-start-2 truncate text-xs text-txt-muted">
          {secondary}
        </dd>
      )}
    </div>
  );
}

const FLAG_URLS = import.meta.glob<string>(
  "/node_modules/country-flag-icons/3x2/*.svg",
  { query: "?url", import: "default" },
);

function flag_loader(code: string | null | undefined) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;

  return (
    FLAG_URLS[
      `/node_modules/country-flag-icons/3x2/${code.toUpperCase()}.svg`
    ] ?? null
  );
}

export function GuardFlag({ code }: { code?: string | null }) {
  const [url, set_url] = useState<string | null>(null);

  useEffect(() => {
    const load = flag_loader(code);
    let active = true;

    set_url(null);
    if (!load) return;
    load()
      .then((value) => {
        if (active) set_url(value);
      })
      .catch(() => {
        if (active) set_url(null);
      });

    return () => {
      active = false;
    };
  }, [code]);

  if (!url) return null;

  return (
    <img
      alt=""
      aria-hidden
      className="h-3 w-4 shrink-0 rounded-[2px] object-cover"
      data-testid="guard_flag"
      decoding="async"
      draggable={false}
      height={12}
      src={url}
      width={16}
    />
  );
}

type ChipTone = "neutral" | "brand" | "danger" | "warning" | "success";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-surf-tertiary text-txt-secondary",
  brand: "bg-brand/10 text-brand",
  danger: "bg-red-500/10 text-red-600 dark:text-red-400",
  warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
};

export function GuardChip({
  children,
  tone = "neutral",
  icon,
  className,
  test_id,
}: {
  children: ReactNode;
  tone?: ChipTone;
  icon?: ReactNode;
  className?: string;
  test_id?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium tabular-nums",
        CHIP_TONES[tone],
        className,
      )}
      data-testid={test_id}
    >
      {icon}
      {children}
    </span>
  );
}
