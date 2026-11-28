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
import { useState } from "react";

import { AliasAtIcon } from "@/components/icons/alias_icons";

interface AliasNavIconProps {
  size: number;
  picture_size?: number;
  profile_picture?: string;
}

export function AliasNavIcon({
  size,
  picture_size,
  profile_picture,
}: AliasNavIconProps) {
  const [failed_picture, set_failed_picture] = useState<string | null>(null);
  const picture = profile_picture?.trim();

  if (picture && picture !== failed_picture) {
    const dim = picture_size ?? size;

    return (
      <img
        alt=""
        className="rounded-full object-cover flex-shrink-0"
        src={picture}
        style={{ width: dim, height: dim }}
        onError={() => set_failed_picture(picture)}
      />
    );
  }

  return <AliasAtIcon className="flex-shrink-0" height={size} width={size} />;
}
