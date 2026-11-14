//
// Aster Communications Inc.
//
// Copyright (c) 2026 Aster Communications Inc.
//
// This file is part of this project.
//
// This program is free software: you can redistribute it and/or modify
// it under the terms of the GNU Affero General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
// GNU Affero General Public License for more details.
//
// You should have received a copy of the GNU Affero General Public License
// along with this program. If not, see <https://www.gnu.org/licenses/>.
//
import type { SenderDisplayFields } from "@/utils/forwarding_alias";

import { use_i18n } from "@/lib/i18n/context";
import { forwarding_address } from "@/utils/forwarding_alias";

interface ForwardedViaLineProps {
  sender: SenderDisplayFields;
  className?: string;
}

export function ForwardedViaLine({
  sender,
  className = "block w-fit max-w-full truncate text-xs text-txt-muted mt-0.5",
}: ForwardedViaLineProps): React.ReactElement | null {
  const { t } = use_i18n();
  const address = forwarding_address(sender);

  if (!address) return null;

  const label = t("mail.forwarded_via", { address });

  return (
    <span className={className} dir="auto" title={label}>
      {label}
    </span>
  );
}
