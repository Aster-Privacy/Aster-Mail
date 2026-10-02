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

export interface AccountPillProps {
  email: string;
  avatar: ReactNode;
  label?: string;
  className?: string;
  on_click?: () => void;
}

const PILL_CLASS =
  "account_menu_row inline-flex max-w-full items-center gap-2.5 rounded-full py-1.5 ps-1.5 pe-3 text-start";

export const AccountPill = ({
  email,
  avatar,
  label,
  className = "",
  on_click,
}: AccountPillProps) => {
  const content = (
    <>
      {avatar}
      <span className="notranslate min-w-0 truncate text-[13px] leading-tight text-txt-primary">
        {email}
      </span>
      {on_click && (
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 text-txt-muted"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          viewBox="0 0 24 24"
        >
          <path d="m6 9 6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </>
  );
  const class_name = `${PILL_CLASS} ${className}`.trim();

  if (!on_click) return <span className={class_name}>{content}</span>;

  return (
    <button
      aria-label={label}
      className={class_name}
      title={label}
      type="button"
      onClick={on_click}
    >
      {content}
    </button>
  );
};
