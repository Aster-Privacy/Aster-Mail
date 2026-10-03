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
import { XMarkIcon } from "@heroicons/react/24/outline";

interface ContactDateClearButtonProps {
  label: string;
  beside_picker: boolean;
  on_clear: () => void;
}

export function contact_date_clear_padding(beside_picker: boolean): string {
  return beside_picker ? "pe-12" : "pe-10";
}

export function ContactDateClearButton({
  label,
  beside_picker,
  on_clear,
}: ContactDateClearButtonProps) {
  return (
    <button
      aria-label={label}
      className={`absolute ${
        beside_picker ? "end-9" : "end-1.5"
      } top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-txt-secondary transition-colors hover:bg-[var(--aster-hover)] hover:text-txt-primary`}
      type="button"
      onClick={on_clear}
    >
      <XMarkIcon className="h-4 w-4" />
    </button>
  );
}
