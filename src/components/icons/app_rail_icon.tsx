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
import contacts_icon_src from "@/assets/app_rail/contacts.png?inline";
import security_icon_src from "@/assets/app_rail/security.png?inline";
import { DatedCalendarImage } from "@/components/icons/dated_calendar_image";

export type AppRailIconName = "calendar" | "contacts" | "security";

type BrandIconName = Exclude<AppRailIconName, "calendar">;

interface AppRailIconProps {
  name: AppRailIconName;
}

const ICON_SIZE = 24;
const ICON_CLASS = "app_rail_icon";

const BRAND_ICON_SRC: Record<BrandIconName, string> = {
  contacts: contacts_icon_src,
  security: security_icon_src,
};

function BrandIcon({ name }: { name: BrandIconName }) {
  return (
    <svg
      aria-hidden="true"
      className={ICON_CLASS}
      data-app-rail-icon={name}
      focusable="false"
      height={ICON_SIZE}
      viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`}
      width={ICON_SIZE}
      xmlns="http://www.w3.org/2000/svg"
    >
      <image
        height={ICON_SIZE}
        href={BRAND_ICON_SRC[name]}
        preserveAspectRatio="xMidYMid meet"
        width={ICON_SIZE}
      />
    </svg>
  );
}

export function AppRailIcon({ name }: AppRailIconProps) {
  if (name === "calendar") {
    return <DatedCalendarImage className={ICON_CLASS} kind="rail" />;
  }

  return <BrandIcon name={name} />;
}
