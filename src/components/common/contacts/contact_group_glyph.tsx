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
import type { CSSProperties } from "react";
import type { TagIconName } from "@/components/ui/email_tag";

import { UserGroupIcon } from "@heroicons/react/24/outline";

import { tag_icon_map } from "@/components/ui/email_tag";

export const DEFAULT_CONTACT_GROUP_COLOR = "#6366f1";

interface ContactGroupGlyphProps {
  color?: string;
  icon?: TagIconName;
  class_name?: string;
}

export function ContactGroupGlyph({
  color,
  icon,
  class_name = "",
}: ContactGroupGlyphProps) {
  const tint = color || DEFAULT_CONTACT_GROUP_COLOR;
  const IconComponent = icon ? tag_icon_map[icon] : undefined;

  return (
    <span
      aria-hidden="true"
      className={`flex h-4 w-4 flex-shrink-0 items-center justify-center ${class_name}`}
    >
      {IconComponent ? (
        <IconComponent className="h-4 w-4" style={{ color: tint }} />
      ) : (
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: tint }}
        />
      )}
    </span>
  );
}

interface ContactGroupAvatarProps {
  color?: string;
  icon?: TagIconName;
  size_px?: number;
  class_name?: string;
}

export function ContactGroupAvatar({
  color,
  icon,
  size_px = 40,
  class_name = "",
}: ContactGroupAvatarProps) {
  const tint = color || DEFAULT_CONTACT_GROUP_COLOR;
  const IconComponent = (icon && tag_icon_map[icon]) || UserGroupIcon;
  const icon_px = Math.round(size_px * 0.5);

  return (
    <span
      aria-hidden="true"
      className={`contact_group_avatar ${class_name}`}
      data-testid="contact_group_avatar"
      style={
        {
          "--group-tint": tint,
          backgroundColor: tint,
          color: "#ffffff",
          width: size_px,
          height: size_px,
        } as CSSProperties
      }
    >
      <IconComponent
        style={{ width: icon_px, height: icon_px }}
        strokeWidth={1.75}
      />
    </span>
  );
}
