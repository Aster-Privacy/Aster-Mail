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
import {
  SparklesIcon,
  MoonIcon,
  GlobeAltIcon,
  LightBulbIcon,
  SunIcon,
  ArrowPathIcon,
  CloudIcon,
  RocketLaunchIcon,
  BoltIcon,
  StarIcon,
  HeartIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import type { ComponentType, SVGProps } from "react";

export type BadgeIconComponent = ComponentType<SVGProps<SVGSVGElement>>;

export interface BadgeVisual {
  icon: BadgeIconComponent;
  gradient_from: string;
  gradient_to: string;
  text_class: string;
  bg_class: string;
  border_class: string;
}

export const BADGE_VISUALS: Record<string, BadgeVisual> = {
  big_bang: {
    icon: SparklesIcon,
    gradient_from: "#fbbf24",
    gradient_to: "#f97316",
    text_class: "text-amber-700 dark:text-amber-400",
    bg_class: "bg-amber-100 dark:bg-amber-500/15",
    border_class: "border-amber-200 dark:border-amber-500/30",
  },
  event_horizon: {
    icon: MoonIcon,
    gradient_from: "#8b5cf6",
    gradient_to: "#6366f1",
    text_class: "text-violet-700 dark:text-violet-400",
    bg_class: "bg-violet-100 dark:bg-violet-500/15",
    border_class: "border-violet-200 dark:border-violet-500/30",
  },
  black_hole: {
    icon: GlobeAltIcon,
    gradient_from: "#6366f1",
    gradient_to: "#1e293b",
    text_class: "text-indigo-700 dark:text-indigo-400",
    bg_class: "bg-indigo-100 dark:bg-indigo-500/15",
    border_class: "border-indigo-200 dark:border-indigo-500/30",
  },
  singularity: {
    icon: LightBulbIcon,
    gradient_from: "#94a3b8",
    gradient_to: "#e2e8f0",
    text_class: "text-slate-700 dark:text-slate-300",
    bg_class: "bg-slate-100 dark:bg-slate-500/15",
    border_class: "border-slate-200 dark:border-slate-500/30",
  },
  supernova: {
    icon: SunIcon,
    gradient_from: "#f97316",
    gradient_to: "#ef4444",
    text_class: "text-orange-700 dark:text-orange-400",
    bg_class: "bg-orange-100 dark:bg-orange-500/15",
    border_class: "border-orange-200 dark:border-orange-500/30",
  },
  andromeda: {
    icon: ArrowPathIcon,
    gradient_from: "#a855f7",
    gradient_to: "#ec4899",
    text_class: "text-purple-700 dark:text-purple-400",
    bg_class: "bg-purple-100 dark:bg-purple-500/15",
    border_class: "border-purple-200 dark:border-purple-500/30",
  },
  nebula: {
    icon: CloudIcon,
    gradient_from: "#ec4899",
    gradient_to: "#8b5cf6",
    text_class: "text-pink-700 dark:text-pink-400",
    bg_class: "bg-pink-100 dark:bg-pink-500/15",
    border_class: "border-pink-200 dark:border-pink-500/30",
  },
  comet: {
    icon: RocketLaunchIcon,
    gradient_from: "#0ea5e9",
    gradient_to: "#22d3ee",
    text_class: "text-sky-700 dark:text-sky-400",
    bg_class: "bg-sky-100 dark:bg-sky-500/15",
    border_class: "border-sky-200 dark:border-sky-500/30",
  },
  pulsar: {
    icon: BoltIcon,
    gradient_from: "#3b82f6",
    gradient_to: "#06b6d4",
    text_class: "text-blue-700 dark:text-blue-400",
    bg_class: "bg-blue-100 dark:bg-blue-500/15",
    border_class: "border-blue-200 dark:border-blue-500/30",
  },
  stargazer: {
    icon: StarIcon,
    gradient_from: "#8b5cf6",
    gradient_to: "#3b82f6",
    text_class: "text-violet-700 dark:text-violet-400",
    bg_class: "bg-violet-100 dark:bg-violet-500/15",
    border_class: "border-violet-200 dark:border-violet-500/30",
  },
  founding_member: {
    icon: TrophyIcon,
    gradient_from: "#facc15",
    gradient_to: "#f59e0b",
    text_class: "text-yellow-700 dark:text-yellow-400",
    bg_class: "bg-yellow-100 dark:bg-yellow-500/15",
    border_class: "border-yellow-200 dark:border-yellow-500/30",
  },
  early_supporter: {
    icon: HeartIcon,
    gradient_from: "#f43f5e",
    gradient_to: "#a855f7",
    text_class: "text-rose-700 dark:text-rose-400",
    bg_class: "bg-rose-100 dark:bg-rose-500/15",
    border_class: "border-rose-200 dark:border-rose-500/30",
  },
};

const DEFAULT_VISUAL: BadgeVisual = {
  icon: StarIcon,
  gradient_from: "#64748b",
  gradient_to: "#94a3b8",
  text_class: "text-slate-700 dark:text-slate-300",
  bg_class: "bg-slate-100 dark:bg-slate-500/15",
  border_class: "border-slate-200 dark:border-slate-500/30",
};

export function get_badge_visual(slug: string): BadgeVisual {
  return BADGE_VISUALS[slug] ?? DEFAULT_VISUAL;
}

export function format_find_order(find_order: number | null | undefined): string | null {
  if (find_order == null || find_order < 1) return null;
  return `#${find_order.toLocaleString()}`;
}
