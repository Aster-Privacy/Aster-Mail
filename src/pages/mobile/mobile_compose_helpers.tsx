//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { SenderOption } from "@/hooks/use_sender_aliases";
import type { TranslationKey } from "@/lib/i18n";
import type { EditDraftData } from "@/components/compose/compose_shared";

import { useMemo } from "react";
import { AtSymbolIcon } from "@heroicons/react/24/outline";

import { ProfileAvatar } from "@/components/ui/profile_avatar";
import { PROFILE_COLORS, get_gradient_background } from "@/constants/profile";

export function get_alias_color(address: string): string {
  let hash = 0;

  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) | 0;
  }

  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
}

export function MobileSenderIcon({
  option,
  size,
}: {
  option: SenderOption;
  size: "xs" | "sm";
}) {
  const gradient = useMemo(
    () => get_gradient_background(get_alias_color(option.email)),
    [option.email],
  );

  if (option.type === "primary") {
    return (
      <ProfileAvatar
        use_domain_logo
        email={option.email}
        name={option.display_name ?? ""}
        size={size}
      />
    );
  }
  const dim = size === "sm" ? 32 : 24;
  const icon_cls = size === "sm" ? "w-3.5 h-3.5" : "w-3 h-3";

  return (
    <div
      className="rounded-full flex items-center justify-center flex-shrink-0"
      style={{
        width: dim,
        height: dim,
        background: gradient,
        boxShadow:
          "inset 0 1px 1px rgba(255,255,255,0.2), inset 0 -1px 1px rgba(0,0,0,0.15)",
      }}
    >
      <AtSymbolIcon className={`${icon_cls} text-white`} />
    </div>
  );
}

export interface MobileComposePageProps {
  on_close: () => void;
  initial_to?: string;
  edit_draft?: EditDraftData | null;
}

export function format_expiry_relative(
  date: Date,
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  const now = new Date();
  const diff_ms = date.getTime() - now.getTime();

  if (diff_ms <= 0) return t ? t("common.expired") : "Expired";
  const hours = Math.floor(diff_ms / (1000 * 60 * 60));
  const minutes = Math.floor((diff_ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const rem_hours = hours % 24;

    return rem_hours > 0 ? `${days}d ${rem_hours}h` : `${days}d`;
  }
  if (hours > 0) return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;

  return `${minutes}m`;
}

export function sender_type_label(
  type: SenderOption["type"],
  t?: (key: TranslationKey, params?: Record<string, string | number>) => string,
): string {
  if (t) {
    switch (type) {
      case "alias":
        return t("common.sender_type_alias");
      case "domain":
        return t("common.sender_type_domain");
      case "external":
        return t("common.sender_type_external");
      case "ghost":
        return t("common.sender_type_ghost");
      default:
        return "";
    }
  }
  switch (type) {
    case "alias":
      return "Alias";
    case "domain":
      return "Domain";
    case "external":
      return "External";
    case "ghost":
      return "Ghost";
    default:
      return "";
  }
}

export function sender_type_color(type: SenderOption["type"]): string {
  switch (type) {
    case "alias":
      return "bg-blue-500/10 text-blue-500";
    case "domain":
      return "bg-purple-500/10 text-purple-500";
    case "external":
      return "bg-teal-500/10 text-teal-500";
    case "ghost":
      return "bg-purple-500/10 text-purple-500";
    default:
      return "";
  }
}
