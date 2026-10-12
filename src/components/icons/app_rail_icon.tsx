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
import { useCallback, useState, type CSSProperties } from "react";
import { UsersIcon } from "@heroicons/react/24/outline";

import { AsterSecurityMark } from "@/components/icons/aster_security_mark";

interface AppRailIconProps {
  name: "contacts" | "security";
}

export function AppRailIcon({ name }: AppRailIconProps) {
  const [has_failed, set_has_failed] = useState(false);

  const handle_error = useCallback(() => {
    set_has_failed(true);
  }, []);

  if (has_failed) {
    return name === "contacts" ? (
      <UsersIcon className="h-5 w-5 shrink-0" />
    ) : (
      <AsterSecurityMark className="h-5 w-5 shrink-0" />
    );
  }

  const base = `/icons/${name}/${name}`;
  const tint_style = {
    "--app-rail-icon-tint": `url("${base}_tint_72.png")`,
  } as CSSProperties;

  return (
    <span aria-hidden="true" className="app_rail_icon" style={tint_style}>
      <img
        alt=""
        className="app_rail_icon_detail"
        decoding="sync"
        draggable={false}
        height={24}
        loading="eager"
        src={`${base}_detail_24.png`}
        srcSet={`${base}_detail_24.png 1x, ${base}_detail_48.png 2x, ${base}_detail_72.png 3x`}
        width={24}
        onError={handle_error}
      />
    </span>
  );
}
