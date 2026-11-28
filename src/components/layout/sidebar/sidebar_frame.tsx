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
import type { ReactNode } from "react";

interface SidebarFrameProps {
  header: ReactNode;
  list: ReactNode;
  footer: ReactNode;
}

export function SidebarFrame({ header, list, footer }: SidebarFrameProps) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain [scrollbar-width:thin]"
      data-sidebar-frame=""
    >
      {header}
      <div className="flex min-h-16 flex-1 flex-col" data-sidebar-list="">
        {list}
      </div>
      <div className="flex flex-shrink-0 flex-col" data-sidebar-footer="">
        {footer}
      </div>
    </div>
  );
}
