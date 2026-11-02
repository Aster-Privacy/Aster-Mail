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
import { useCallback, useState } from "react";
import { CalendarDaysIcon, UsersIcon } from "@heroicons/react/24/outline";

import { AsterSecurityMark } from "@/components/icons/aster_security_mark";
import { use_dated_calendar_icon } from "@/lib/dated_calendar_icon";

export type AppRailIconName = "calendar" | "contacts" | "security";

interface AppRailIconProps {
  name: AppRailIconName;
}

const ICON_SIZE = 24;
const FALLBACK_CLASS = "h-5 w-5 shrink-0";

function FallbackIcon({ name }: AppRailIconProps) {
  if (name === "calendar") {
    return <CalendarDaysIcon className={FALLBACK_CLASS} />;
  }

  return name === "contacts" ? (
    <UsersIcon className={FALLBACK_CLASS} />
  ) : (
    <AsterSecurityMark className={FALLBACK_CLASS} />
  );
}

interface RailImageProps {
  name: AppRailIconName;
  src: string;
  src_set?: string;
}

function RailImage({ name, src, src_set }: RailImageProps) {
  const [failed_src, set_failed_src] = useState<string | null>(null);

  const handle_error = useCallback(() => {
    set_failed_src(src);
  }, [src]);

  if (failed_src === src) return <FallbackIcon name={name} />;

  return (
    <img
      alt=""
      aria-hidden="true"
      className="app_rail_icon"
      decoding="sync"
      draggable={false}
      height={ICON_SIZE}
      loading="eager"
      src={src}
      srcSet={src_set}
      width={ICON_SIZE}
      onError={handle_error}
    />
  );
}

function CalendarRailIcon() {
  const src = use_dated_calendar_icon("rail");

  return <RailImage name="calendar" src={src} />;
}

export function AppRailIcon({ name }: AppRailIconProps) {
  if (name === "calendar") return <CalendarRailIcon />;

  const base = `/icons/${name}/${name}_rail`;

  return (
    <RailImage
      name={name}
      src={`${base}_24.png`}
      src_set={`${base}_24.png 1x, ${base}_48.png 2x, ${base}_72.png 3x`}
    />
  );
}
