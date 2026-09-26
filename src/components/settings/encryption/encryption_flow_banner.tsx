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
import { useMemo } from "react";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { Island } from "@aster/ui";

import { use_i18n } from "@/lib/i18n/context";

const GROUP_SIZE = 4;
const GROUP_COUNT = 4;
const HAIRLINE = "color-mix(in srgb, var(--text-primary) 12%, transparent)";

function generate_hex_groups(): string {
  const bytes = new Uint8Array((GROUP_COUNT * GROUP_SIZE) / 2);

  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );

  return hex.match(new RegExp(`.{1,${GROUP_SIZE}}`, "g"))?.join(" ") || hex;
}

function to_hex_groups(fingerprint: string): string {
  const hex = fingerprint.replace(/[^0-9a-f]/gi, "").toLowerCase();
  const truncated = hex.slice(0, GROUP_COUNT * GROUP_SIZE);

  return (
    truncated.match(new RegExp(`.{1,${GROUP_SIZE}}`, "g"))?.join(" ") ||
    truncated
  );
}

function flow_link() {
  return (
    <span className="flex flex-shrink-0 items-center gap-1.5">
      <span className="h-px w-5" style={{ background: HAIRLINE }} />
      <LockClosedIcon
        aria-hidden="true"
        className="h-4 w-4 text-txt-secondary"
      />
      <span className="h-px w-5" style={{ background: HAIRLINE }} />
    </span>
  );
}

interface EncryptionFlowBannerProps {
  your_fingerprint?: string;
}

export function EncryptionFlowBanner({
  your_fingerprint,
}: EncryptionFlowBannerProps) {
  const { t } = use_i18n();
  const fallback_hex = useMemo(() => generate_hex_groups(), []);
  const display_hex = your_fingerprint
    ? to_hex_groups(your_fingerprint)
    : fallback_hex;

  return (
    <Island>
      <p className="text-[15px] font-semibold text-txt-primary">
        {t("settings.encryption_banner_title")}
      </p>
      <p className="mt-1 text-[14px] leading-5 text-txt-secondary">
        {t("settings.encryption_banner_subtitle")}
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[13px] font-medium text-txt-primary">
          {t("settings.encryption_banner_you")}
        </span>
        {flow_link()}
        <span className="font-mono text-[12.5px] tracking-wider text-txt-secondary">
          {display_hex}
        </span>
        {flow_link()}
        <span className="text-[13px] font-medium text-txt-primary">
          {t("settings.encryption_banner_recipient")}
        </span>
      </div>
    </Island>
  );
}
