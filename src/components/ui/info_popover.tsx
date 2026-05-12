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
import { InformationCircleIcon } from "@heroicons/react/24/outline";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface InfoPopoverProps {
  title: string;
  description: string;
}

export function InfoPopover({ title, description }: InfoPopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          aria-label="More information"
          className="inline-flex items-center justify-center flex-shrink-0 text-txt-muted hover:text-txt-secondary transition-colors rounded-full focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
          type="button"
        >
          <InformationCircleIcon className="w-4 h-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 border border-edge-primary bg-modal-bg shadow-lg rounded-xl p-4 z-[200]"
        sideOffset={6}
      >
        <p className="text-sm font-semibold text-txt-primary mb-1.5">{title}</p>
        <p className="text-sm text-txt-muted leading-relaxed">{description}</p>
      </PopoverContent>
    </Popover>
  );
}
