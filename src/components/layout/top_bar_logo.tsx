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
interface TopBarLogoProps {
  is_rail_header: boolean;
}

export function TopBarLogo({ is_rail_header }: TopBarLogoProps) {
  return (
    <>
      <img
        alt=""
        className={`h-9 w-9 object-contain ${is_rail_header ? "" : "hidden"}`}
        data-logo="rail"
        decoding="async"
        draggable={false}
        src="/mail_logo.png"
      />
      <img
        alt=""
        className={`h-6 w-auto max-w-full object-contain object-left ${is_rail_header ? "hidden" : "dark:hidden"}`}
        data-logo="wordmark_light"
        decoding="async"
        draggable={false}
        src="/aster_mail_logo_light.png"
      />
      <img
        alt=""
        className={`h-6 w-auto max-w-full object-contain object-left hidden ${is_rail_header ? "" : "dark:block"}`}
        data-logo="wordmark_dark"
        decoding="async"
        draggable={false}
        src="/aster_mail_logo_dark.png"
      />
    </>
  );
}
