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
import type { ReactNode } from "react";

import { EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";

import { Input } from "@/components/ui/input";

const SPAN_CLASS: Record<2 | 3 | 4 | 6, string> = {
  2: "sm:col-span-2",
  3: "sm:col-span-3",
  4: "sm:col-span-4",
  6: "sm:col-span-6",
};

interface FieldGroupProps {
  children: ReactNode;
}

export function FieldGroup({ children }: FieldGroupProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-6 gap-x-3 gap-y-4 p-4">
      {children}
    </div>
  );
}

interface FormFieldProps {
  id?: string;
  label: string;
  label_id?: string;
  span?: 2 | 3 | 4 | 6;
  hint?: ReactNode;
  children: ReactNode;
}

export function FormField({
  id,
  label,
  label_id,
  span = 6,
  hint,
  children,
}: FormFieldProps) {
  const label_class = "block mb-1.5 text-[13px] font-medium text-txt-secondary";

  return (
    <div className={`min-w-0 ${SPAN_CLASS[span]}`}>
      {id ? (
        <label className={label_class} htmlFor={id} id={label_id}>
          {label}
        </label>
      ) : (
        <span className={label_class} id={label_id}>
          {label}
        </span>
      )}
      {children}
      {hint && (
        <div className="mt-1.5 space-y-1 text-xs leading-[18px] text-txt-muted">
          {hint}
        </div>
      )}
    </div>
  );
}

interface PasswordInputProps {
  id: string;
  value: string;
  is_visible: boolean;
  show_label: string;
  hide_label: string;
  on_toggle_visible: () => void;
  on_change: (value: string) => void;
  disabled?: boolean;
  max_length?: number;
  placeholder?: string;
  auto_complete?: string;
}

export function PasswordInput({
  id,
  value,
  is_visible,
  show_label,
  hide_label,
  on_toggle_visible,
  on_change,
  disabled,
  max_length = 512,
  placeholder,
  auto_complete = "current-password",
}: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        autoComplete={auto_complete}
        className="aster_input_tonal w-full pe-11"
        disabled={disabled}
        id={id}
        maxLength={max_length}
        placeholder={placeholder}
        size="md"
        type={is_visible ? "text" : "password"}
        value={value}
        onChange={(e) => on_change(e.target.value)}
      />
      <button
        aria-label={is_visible ? hide_label : show_label}
        aria-pressed={is_visible}
        className="absolute end-1.5 top-1/2 disabled:opacity-50 disabled:pointer-events-none -translate-y-1/2 grid place-items-center w-8 h-8 rounded-lg text-txt-muted transition-colors hover:text-txt-primary hover:bg-[color-mix(in_srgb,var(--text-primary)_7%,transparent)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-color)]/50"
        disabled={disabled}
        type="button"
        onClick={on_toggle_visible}
      >
        {is_visible ? (
          <EyeSlashIcon className="w-4 h-4" />
        ) : (
          <EyeIcon className="w-4 h-4" />
        )}
      </button>
    </div>
  );
}
