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
import type { TwinSibling } from "@/services/api/aliases";

import { useLayoutEffect, useRef, useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { Island, IslandIconButton, PillButton } from "@aster/ui";

import { use_preferences } from "@/contexts/preferences_context";
import { use_i18n } from "@/lib/i18n/context";

const ELLIPSIS = "…";

function measure_text_width(element: HTMLElement, text: string): number {
  const context = document.createElement("canvas").getContext("2d");

  if (!context) return 0;
  const style = getComputedStyle(element);

  context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;

  return context.measureText(text).width;
}

function fit_local_part(
  element: HTMLElement,
  local_part: string,
  available: number,
): string {
  if (measure_text_width(element, local_part) <= available) return local_part;
  let low = 0;
  let high = local_part.length;

  while (low < high) {
    const middle = Math.ceil((low + high) / 2);
    const candidate = local_part.slice(0, middle) + ELLIPSIS;

    if (measure_text_width(element, candidate) <= available) {
      low = middle;
    } else {
      high = middle - 1;
    }
  }

  return local_part.slice(0, low) + ELLIPSIS;
}

interface TwinAddressCardProps {
  siblings: TwinSibling[];
  on_claim: (local_part: string, domain: string) => void;
}

export function TwinAddressCard({ siblings, on_claim }: TwinAddressCardProps) {
  const { t } = use_i18n();
  const { preferences, update_preference } = use_preferences();
  const visible =
    siblings.length > 0 && !preferences.twin_address_banner_dismissed;
  const local_part = siblings[0]?.local_part ?? "";
  const text_ref = useRef<HTMLParagraphElement>(null);
  const address_ref = useRef<HTMLSpanElement>(null);
  const domain_ref = useRef<HTMLSpanElement>(null);
  const [fitted, set_fitted] = useState(local_part);

  useLayoutEffect(() => {
    const text = text_ref.current;
    const address = address_ref.current;
    const domain = domain_ref.current;

    if (!text || !address || !domain) return;
    const update = () => {
      if (getComputedStyle(text).flexDirection !== "column") {
        set_fitted(local_part);

        return;
      }
      const available = address.clientWidth - domain.offsetWidth - 1;

      set_fitted(fit_local_part(address, local_part, available));
    };
    const observer = new ResizeObserver(update);

    observer.observe(text);
    update();

    return () => observer.disconnect();
  }, [local_part, visible]);

  if (!visible) {
    return null;
  }

  const primary = siblings[0];
  const multiple = siblings.length > 1;
  const short_status =
    primary.state === "reserved"
      ? t("settings.twin_address_reserved")
      : t("settings.twin_address_available");
  const status = multiple
    ? t("settings.twin_address_reserved_multiple", { count: siblings.length })
    : short_status;

  return (
    <Island className="mb-2 max-md:py-3.5" padding="md">
      <div className="@container flex items-center gap-3">
        <p
          ref={text_ref}
          className="flex min-w-0 flex-1 flex-col text-sm leading-5 @md:flex-row @md:items-baseline @md:gap-x-3"
        >
          <span
            ref={address_ref}
            className="flex min-w-0 font-medium text-txt-primary"
            title={primary.address}
          >
            <span className="min-w-0 truncate">{fitted}</span>
            <span ref={domain_ref} className="shrink-0">
              @{primary.domain}
            </span>
          </span>
          <span className="min-w-0 truncate text-txt-muted @md:shrink-[2]">
            <span className="@md:hidden">{short_status}</span>
            <span className="hidden @md:inline">{status}</span>
          </span>
        </p>
        <div className="-me-3 flex shrink-0 items-center max-md:-me-3.5">
          <PillButton
            size="sm"
            variant="tonal"
            onClick={() => on_claim(primary.local_part, primary.domain)}
          >
            {t("settings.twin_address_create")}
          </PillButton>
          <IslandIconButton
            className="max-md:-ms-0.5"
            label={t("settings.twin_address_dismiss")}
            size="sm"
            onClick={() =>
              update_preference("twin_address_banner_dismissed", true, true)
            }
          >
            <XMarkIcon className="h-4 w-4" />
          </IslandIconButton>
        </div>
      </div>
    </Island>
  );
}
