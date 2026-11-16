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
import DOMPurify from "dompurify";
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

export function GuardResultView({
  title,
  title_info,
  body,
  actions,
  children,
  test_id,
  live = false,
  className,
}: {
  title: string;
  title_info?: ReactNode;
  body?: string;
  actions: ReactNode;
  children?: ReactNode;
  test_id?: string;
  live?: boolean;
  className?: string;
}) {
  return (
    <div
      aria-live={live ? "polite" : undefined}
      className={cn("flex flex-col items-center text-center", className)}
      data-testid={test_id}
    >
      <GuardLogo className="mb-5" />
      <div className="flex items-center justify-center gap-1.5">
        <h2 className="text-lg font-semibold text-txt-primary">{title}</h2>
        {title_info}
      </div>
      {body && (
        <p className="mt-1.5 max-w-sm text-sm text-txt-muted" role="status">
          {body}
        </p>
      )}
      {children}
      <div className="mt-6 flex w-full flex-col gap-2">{actions}</div>
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

const TILE_SIZES = {
  md: "h-6 min-w-6",
  lg: "h-12 w-12 [&>svg]:h-11 [&>svg]:w-11",
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

const FLAG_SOURCES = import.meta.glob<string>(
  "/node_modules/country-flag-icons/3x2/*.svg",
  { query: "?raw", import: "default" },
);

function flag_loader(code: string | null | undefined) {
  if (!code || !/^[A-Za-z]{2}$/.test(code)) return null;

  return (
    FLAG_SOURCES[
      `/node_modules/country-flag-icons/3x2/${code.toUpperCase()}.svg`
    ] ?? null
  );
}

export function prepare_flag_svg(source: string): string | null {
  const clean = DOMPurify.sanitize(source, {
    USE_PROFILES: { svg: true },
    RETURN_DOM: true,
  }) as unknown as HTMLElement;
  const svg = clean.querySelector("svg");

  if (!svg) return null;
  svg.setAttribute("width", "18");
  svg.setAttribute("height", "12");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", "block h-full w-full");

  return svg.outerHTML;
}

export function GuardFlag({ code }: { code?: string | null }) {
  const [markup, set_markup] = useState<string | null>(null);

  useEffect(() => {
    const load = flag_loader(code);
    let active = true;

    set_markup(null);
    if (!load) return;
    load()
      .then((source) => {
        if (active) set_markup(prepare_flag_svg(source));
      })
      .catch(() => {
        if (active) set_markup(null);
      });

    return () => {
      active = false;
    };
  }, [code]);

  if (!markup) return null;

  return (
    <span
      aria-hidden
      className="guard_flag relative inline-block h-3 w-[18px] shrink-0 overflow-hidden rounded-[2px]"
      data-testid="guard_flag"
    >
      <span
        dangerouslySetInnerHTML={{ __html: markup }}
        className="block h-full w-full"
      />
    </span>
  );
}

type ChipTone = "neutral" | "brand" | "danger" | "warning" | "success";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "text-txt-secondary",
  brand: "text-brand",
  danger: "text-red-600 dark:text-red-400",
  warning: "text-amber-700 dark:text-amber-300",
  success: "text-emerald-700 dark:text-emerald-300",
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
        "inline-flex items-center gap-1.5 text-xs font-medium tabular-nums [&>svg]:text-txt-muted",
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

export function GuardMarkIcon({
  className,
  "data-testid": test_id,
}: {
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      data-testid={test_id}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path d="M12 2.714A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.18 3.28 9.6 7.9 11.29" />
      <path d="M12 2.714A11.959 11.959 0 0 0 20.25 6h.152c.388 1.18.598 2.441.598 3.75 0 .37-.02.74-.05 1.1" />
      <rect height={5.25} rx={1.125} width={7.5} x={13.5} y={16.5} />
      <path d="M15 16.5v-1.5a2.25 2.25 0 0 1 4.5 0v1.5" />
    </svg>
  );
}

export type GuardFeatureKind = "approve" | "hold" | "rescue";

export function GuardFeatureIcon({
  kind,
  className,
}: {
  kind: GuardFeatureKind;
  className?: string;
}) {
  return (
    <svg
      aria-hidden
      className={className}
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      {kind === "approve" && (
        <>
          <rect height={18.5} rx={2.25} width={10.5} x={6.75} y={2.75} />
          <path d="M10.5 5.75h3" />
          <path d="m9.75 13 1.6 1.6 3-3.2" />
        </>
      )}
      {kind === "hold" && (
        <>
          <circle cx={12} cy={12} r={8.75} />
          <path d="M12 7.5V12l3 2" />
        </>
      )}
      {kind === "rescue" && (
        <>
          <circle cx={8} cy={15.5} r={4.25} />
          <path d="m11 12.5 8.5-8.5M16.5 7l2.5 2.5M14.5 9l1.75 1.75" />
        </>
      )}
    </svg>
  );
}

export function GuardPlatformGlyph({
  name,
  device_type,
}: {
  name: string;
  device_type: string;
}) {
  const platform = guard_device_platform(name, device_type);
  const Icon =
    platform === null || platform === "browser"
      ? GlobeAltIcon
      : PLATFORM_ICONS[platform];

  return (
    <Icon
      aria-hidden
      className="h-3.5 w-3.5 shrink-0 text-txt-secondary"
    />
  );
}
