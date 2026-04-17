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
import type { ComponentType, SVGProps } from "react";

interface ContactFormSectionProps {
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  class_name?: string;
}

export function ContactFormSection({
  icon: Icon,
  label,
  class_name,
}: ContactFormSectionProps) {
  return (
    <div
      className={`flex items-center gap-2 pb-2 border-b border-edge-secondary ${class_name ?? ""}`}
    >
      <Icon className="w-4 h-4 text-txt-muted" />
      <span className="text-[11px] font-medium uppercase tracking-wider text-txt-muted">
        {label}
      </span>
    </div>
  );
}
