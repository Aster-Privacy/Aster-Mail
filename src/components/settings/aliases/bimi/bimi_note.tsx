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
import type { ComponentType, ReactNode, SVGProps } from "react";

interface BimiNoteProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  tone?: "muted" | "success";
  children: ReactNode;
}

export function BimiNote({
  icon: Icon,
  tone = "muted",
  children,
}: BimiNoteProps) {
  return (
    <p className="flex items-start gap-2 text-sm text-txt-secondary">
      <Icon
        aria-hidden="true"
        className={`mt-0.5 w-4 h-4 flex-shrink-0 ${
          tone === "success" ? "text-green-500" : "text-txt-muted"
        }`}
      />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
