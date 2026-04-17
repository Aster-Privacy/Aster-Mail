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
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import {
  ClockIcon,
  ArchiveBoxIcon,
  TrashIcon,
  PaperAirplaneIcon,
  PencilSquareIcon,
  StarIcon,
  FlagIcon,
  BoltIcon,
  ShieldExclamationIcon,
  ExclamationCircleIcon,
  CheckCircleIcon,
  TagIcon,
  FolderIcon,
  EnvelopeIcon,
  LockClosedIcon,
  BellIcon,
  SparklesIcon,
  FireIcon,
  HeartIcon,
  BookmarkIcon,
  ChatBubbleLeftIcon,
  DocumentIcon,
  CurrencyDollarIcon,
  ShoppingCartIcon,
  CodeBracketIcon,
  UserIcon,
  BuildingOfficeIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  EyeSlashIcon,
} from "@heroicons/react/16/solid";

import { cn } from "@/lib/utils";

export const tag_icon_map: Record<
  string,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  clock: ClockIcon,
  archive: ArchiveBoxIcon,
  trash: TrashIcon,
  send: PaperAirplaneIcon,
  draft: PencilSquareIcon,
  star: StarIcon,
  flag: FlagIcon,
  bolt: BoltIcon,
  shield: ShieldExclamationIcon,
  warning: ExclamationCircleIcon,
  check: CheckCircleIcon,
  tag: TagIcon,
  folder: FolderIcon,
  envelope: EnvelopeIcon,
  lock: LockClosedIcon,
  bell: BellIcon,
  sparkles: SparklesIcon,
  fire: FireIcon,
  heart: HeartIcon,
  bookmark: BookmarkIcon,
  chat: ChatBubbleLeftIcon,
  document: DocumentIcon,
  currency: CurrencyDollarIcon,
  cart: ShoppingCartIcon,
  code: CodeBracketIcon,
  user: UserIcon,
  building: BuildingOfficeIcon,
  globe: GlobeAltIcon,
  info: InformationCircleIcon,
  "eye-slash": EyeSlashIcon,
};

export type TagIconName = keyof typeof tag_icon_map;

const email_tag_variants = cva(
  "inline-flex items-center gap-1 font-medium transition-colors select-none",
  {
    variants: {
      variant: {
        scheduled: [
          "bg-violet-100 text-violet-700 border border-violet-200",
          "dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/30",
        ].join(" "),
        sent: [
          "bg-emerald-100 text-emerald-700 border border-emerald-200",
          "dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
        ].join(" "),
        draft: [
          "bg-amber-100 text-amber-700 border border-amber-200",
          "dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
        ].join(" "),
        archived: [
          "bg-sky-100 text-sky-700 border border-sky-200",
          "dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/30",
        ].join(" "),
        trashed: [
          "bg-red-100 text-red-700 border border-red-200",
          "dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
        ].join(" "),
        spam: [
          "bg-orange-100 text-orange-700 border border-orange-200",
          "dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30",
        ].join(" "),
        snoozed: [
          "bg-indigo-100 text-indigo-700 border border-indigo-200",
          "dark:bg-indigo-500/15 dark:text-indigo-400 dark:border-indigo-500/30",
        ].join(" "),
        starred: [
          "bg-yellow-100 text-yellow-700 border border-yellow-200",
          "dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30",
        ].join(" "),
        important: [
          "bg-rose-100 text-rose-700 border border-rose-200",
          "dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30",
        ].join(" "),
        unread: [
          "bg-blue-100 text-blue-700 border border-blue-200",
          "dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30",
        ].join(" "),
        encrypted: [
          "bg-teal-100 text-teal-700 border border-teal-200",
          "dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/30",
        ].join(" "),
        red: [
          "bg-red-100 text-red-700 border border-red-200",
          "dark:bg-red-500/15 dark:text-red-400 dark:border-red-500/30",
        ].join(" "),
        orange: [
          "bg-orange-100 text-orange-700 border border-orange-200",
          "dark:bg-orange-500/15 dark:text-orange-400 dark:border-orange-500/30",
        ].join(" "),
        amber: [
          "bg-amber-100 text-amber-700 border border-amber-200",
          "dark:bg-amber-500/15 dark:text-amber-400 dark:border-amber-500/30",
        ].join(" "),
        yellow: [
          "bg-yellow-100 text-yellow-700 border border-yellow-200",
          "dark:bg-yellow-500/15 dark:text-yellow-400 dark:border-yellow-500/30",
        ].join(" "),
        lime: [
          "bg-lime-100 text-lime-700 border border-lime-200",
          "dark:bg-lime-500/15 dark:text-lime-400 dark:border-lime-500/30",
        ].join(" "),
        green: [
          "bg-green-100 text-green-700 border border-green-200",
          "dark:bg-green-500/15 dark:text-green-400 dark:border-green-500/30",
        ].join(" "),
        emerald: [
          "bg-emerald-100 text-emerald-700 border border-emerald-200",
          "dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/30",
        ].join(" "),
        teal: [
          "bg-teal-100 text-teal-700 border border-teal-200",
          "dark:bg-teal-500/15 dark:text-teal-400 dark:border-teal-500/30",
        ].join(" "),
        cyan: [
          "bg-cyan-100 text-cyan-700 border border-cyan-200",
          "dark:bg-cyan-500/15 dark:text-cyan-400 dark:border-cyan-500/30",
        ].join(" "),
        sky: [
          "bg-sky-100 text-sky-700 border border-sky-200",
          "dark:bg-sky-500/15 dark:text-sky-400 dark:border-sky-500/30",
        ].join(" "),
        blue: [
          "bg-blue-100 text-blue-700 border border-blue-200",
          "dark:bg-blue-500/15 dark:text-blue-400 dark:border-blue-500/30",
        ].join(" "),
        indigo: [
          "bg-indigo-100 text-indigo-700 border border-indigo-200",
          "dark:bg-indigo-500/15 dark:text-indigo-400 dark:border-indigo-500/30",
        ].join(" "),
        violet: [
          "bg-violet-100 text-violet-700 border border-violet-200",
          "dark:bg-violet-500/15 dark:text-violet-400 dark:border-violet-500/30",
        ].join(" "),
        purple: [
          "bg-purple-100 text-purple-700 border border-purple-200",
          "dark:bg-purple-500/15 dark:text-purple-400 dark:border-purple-500/30",
        ].join(" "),
        fuchsia: [
          "bg-fuchsia-100 text-fuchsia-700 border border-fuchsia-200",
          "dark:bg-fuchsia-500/15 dark:text-fuchsia-400 dark:border-fuchsia-500/30",
        ].join(" "),
        pink: [
          "bg-pink-100 text-pink-700 border border-pink-200",
          "dark:bg-pink-500/15 dark:text-pink-400 dark:border-pink-500/30",
        ].join(" "),
        rose: [
          "bg-rose-100 text-rose-700 border border-rose-200",
          "dark:bg-rose-500/15 dark:text-rose-400 dark:border-rose-500/30",
        ].join(" "),
        slate: [
          "bg-slate-100 text-slate-700 border border-slate-200",
          "dark:bg-slate-500/15 dark:text-slate-400 dark:border-slate-500/30",
        ].join(" "),
        neutral: [
          "bg-neutral-100 text-neutral-700 border border-neutral-200",
          "dark:bg-neutral-500/15 dark:text-neutral-400 dark:border-neutral-500/30",
        ].join(" "),
        custom: "",
      },
      size: {
        xs: "text-[9px] px-1.5 py-0.5 rounded",
        sm: "text-[10px] px-1.5 py-0.5 rounded",
        default: "text-[11px] px-2 py-0.5 rounded-md",
        lg: "text-xs px-2.5 py-1 rounded-md",
      },
    },
    defaultVariants: {
      variant: "neutral",
      size: "sm",
    },
  },
);

export interface EmailTagProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof email_tag_variants> {
  icon?: TagIconName | React.ReactNode;
  label: string;
  custom_color?: string;
  show_icon?: boolean;
  muted?: boolean;
}

function EmailTag({
  className,
  variant,
  size,
  icon,
  label,
  custom_color,
  show_icon = true,
  muted = false,
  style,
  ...props
}: EmailTagProps) {
  const default_icons: Partial<
    Record<NonNullable<typeof variant>, TagIconName>
  > = {
    scheduled: "clock",
    sent: "send",
    draft: "draft",
    archived: "archive",
    trashed: "trash",
    spam: "shield",
    snoozed: "clock",
    starred: "star",
    important: "flag",
    unread: "envelope",
    encrypted: "lock",
  };

  const resolved_icon =
    icon ??
    (variant && variant in default_icons
      ? default_icons[variant as keyof typeof default_icons]
      : undefined);

  const IconComponent =
    typeof resolved_icon === "string" ? tag_icon_map[resolved_icon] : null;

  const icon_sizes: Record<NonNullable<typeof size>, string> = {
    xs: "w-2.5 h-2.5",
    sm: "w-3 h-3",
    default: "w-3.5 h-3.5",
    lg: "w-4 h-4",
  };

  const custom_styles =
    variant === "custom" && custom_color
      ? get_custom_color_styles(custom_color)
      : {};

  return (
    <span
      className={cn(
        email_tag_variants({ variant, size }),
        muted && "opacity-70",
        className,
      )}
      style={{ ...custom_styles, ...style }}
      {...props}
    >
      {show_icon && resolved_icon && (
        <>
          {IconComponent ? (
            <IconComponent
              className={cn(icon_sizes[size || "sm"], "flex-shrink-0 -ml-0.5")}
            />
          ) : (
            <span
              className={cn(icon_sizes[size || "sm"], "flex-shrink-0 -ml-0.5")}
            >
              {resolved_icon}
            </span>
          )}
        </>
      )}
      <span className="truncate">{label}</span>
    </span>
  );
}

function get_custom_color_styles(color: string): React.CSSProperties {
  const hex_to_rgb = (
    hex: string,
  ): { r: number; g: number; b: number } | null => {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);

    return result
      ? {
          r: parseInt(result[1], 16),
          g: parseInt(result[2], 16),
          b: parseInt(result[3], 16),
        }
      : null;
  };

  const rgb = hex_to_rgb(color);

  if (!rgb) return {};

  return {
    backgroundColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.12)`,
    color: color,
    borderColor: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.25)`,
  };
}

export const TAG_COLOR_PRESETS = [
  { name: "Red", variant: "red" as const, hex: "#ef4444" },
  { name: "Orange", variant: "orange" as const, hex: "#f97316" },
  { name: "Amber", variant: "amber" as const, hex: "#f59e0b" },
  { name: "Yellow", variant: "yellow" as const, hex: "#eab308" },
  { name: "Lime", variant: "lime" as const, hex: "#84cc16" },
  { name: "Green", variant: "green" as const, hex: "#22c55e" },
  { name: "Emerald", variant: "emerald" as const, hex: "#10b981" },
  { name: "Teal", variant: "teal" as const, hex: "#14b8a6" },
  { name: "Cyan", variant: "cyan" as const, hex: "#06b6d4" },
  { name: "Sky", variant: "sky" as const, hex: "#0ea5e9" },
  { name: "Blue", variant: "blue" as const, hex: "#3b82f6" },
  { name: "Indigo", variant: "indigo" as const, hex: "#6366f1" },
  { name: "Violet", variant: "violet" as const, hex: "#8b5cf6" },
  { name: "Purple", variant: "purple" as const, hex: "#a855f7" },
  { name: "Fuchsia", variant: "fuchsia" as const, hex: "#d946ef" },
  { name: "Pink", variant: "pink" as const, hex: "#ec4899" },
  { name: "Rose", variant: "rose" as const, hex: "#f43f5e" },
] as const;

export const TAG_ICONS = Object.keys(tag_icon_map) as TagIconName[];

export type TagVariant = NonNullable<
  VariantProps<typeof email_tag_variants>["variant"]
>;

export function hex_to_variant(hex: string): TagVariant {
  const preset = TAG_COLOR_PRESETS.find(
    (p) => p.hex.toLowerCase() === hex.toLowerCase(),
  );

  return preset?.variant ?? "custom";
}

export { EmailTag, email_tag_variants };
