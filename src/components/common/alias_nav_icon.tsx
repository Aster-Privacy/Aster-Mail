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
import { useMemo, useState } from "react";
import { AliasIconView } from "@aster/ui";

import { get_gradient_background } from "@/constants/profile";
import { get_alias_color } from "@/lib/avatar_color";

interface AliasNavIconProps {
  address: string;
  is_random: boolean;
  size: number;
  profile_picture?: string;
  icon_class_name?: string;
}

export function AliasNavIcon({
  address,
  is_random,
  size,
  profile_picture,
  icon_class_name,
}: AliasNavIconProps) {
  const [failed_picture, set_failed_picture] = useState<string | null>(null);
  const gradient = useMemo(
    () => get_gradient_background(get_alias_color(address)),
    [address],
  );
  const picture = profile_picture?.trim();

  if (picture && picture !== failed_picture) {
    return (
      <img
        alt=""
        className="rounded-full object-cover flex-shrink-0"
        src={picture}
        style={{ width: size, height: size }}
        onError={() => set_failed_picture(picture)}
      />
    );
  }

  return (
    <AliasIconView
      background={gradient}
      icon_class_name={icon_class_name}
      is_random={is_random}
      size={size}
    />
  );
}
