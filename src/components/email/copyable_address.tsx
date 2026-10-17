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

import { use_i18n } from "@/lib/i18n/context";
import { copy_text_or_throw } from "@/utils/copy_text";
import { show_toast } from "@/components/toast/simple_toast";

interface CopyableAddressProps {
  address: string;
  children: ReactNode;
  className?: string;
}

function has_text_selection(): boolean {
  const selection = window.getSelection();

  return !!selection && !selection.isCollapsed;
}

export function CopyableAddress({
  address,
  children,
  className = "",
}: CopyableAddressProps) {
  const { t } = use_i18n();

  const copy_address = () => {
    copy_text_or_throw(address)
      .then(() => show_toast(t("common.email_copied"), "success"))
      .catch(() => show_toast(t("common.failed_to_copy"), "error"));
  };

  return (
    <span className={`min-w-0 ${className}`}>
      <span
        className="cursor-pointer select-text hover:underline"
        data-copy-address={address}
        dir="auto"
        title={address}
        onClick={() => {
          if (has_text_selection()) return;
          copy_address();
        }}
      >
        {children}
      </span>
      <button
        aria-label={t("common.copy_address")}
        className="sr-only rounded focus-visible:not-sr-only focus-visible:ms-1 focus-visible:px-1 focus-visible:text-txt-muted"
        type="button"
        onClick={copy_address}
      >
        {t("common.copy")}
      </button>
    </span>
  );
}

export function RecipientAddress({
  email,
  name,
}: {
  email?: string;
  name?: string;
}) {
  const { t } = use_i18n();

  if (!email) return <span>{name || t("common.unknown")}</span>;

  return (
    <CopyableAddress address={email} className="[overflow-wrap:anywhere]">
      {name && name !== email ? (
        <>
          {name} <span className="text-txt-muted">&lt;{email}&gt;</span>
        </>
      ) : (
        email
      )}
    </CopyableAddress>
  );
}
