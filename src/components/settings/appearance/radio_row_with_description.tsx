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
import { Radio } from "@aster/ui";

interface RadioRowWithDescriptionProps {
  label: string;
  description: string;
  is_selected: boolean;
  on_select: () => void;
}

export function RadioRowWithDescription({
  label,
  description,
  is_selected,
  on_select,
}: RadioRowWithDescriptionProps) {
  return (
    <button
      className={`w-full flex items-center justify-between px-4 py-3 rounded-lg border transition-colors ${
        is_selected
          ? "border-brand bg-surf-selected"
          : "border-edge-secondary bg-transparent"
      }`}
      type="button"
      onClick={on_select}
    >
      <div className="text-left">
        <span className="text-sm font-medium block text-txt-primary">
          {label}
        </span>
        <span className="text-xs mt-0.5 block text-txt-muted">
          {description}
        </span>
      </div>
      <span className="pointer-events-none flex-shrink-0 ml-3">
        <Radio readOnly checked={is_selected} />
      </span>
    </button>
  );
}
