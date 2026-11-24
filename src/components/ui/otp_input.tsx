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
import { useRef, useEffect } from "react";

import { cn } from "@/lib/utils";

function only_digits(raw: string): string {
  return raw.replace(/\D/g, "");
}

interface OtpInputProps {
  length?: number;
  value: string;
  disabled?: boolean;
  status?: "default" | "error";
  autofocus?: boolean;
  size?: "md" | "lg";
  id_prefix?: string;
  align?: "center" | "left";
  aria_label?: string;
  input_mode?: "numeric" | "text";
  sanitize?: (raw: string) => string;
  placeholder?: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}

export function OtpInput({
  length = 6,
  value,
  disabled = false,
  status = "default",
  autofocus = true,
  size = "md",
  id_prefix,
  align = "center",
  aria_label,
  input_mode = "numeric",
  sanitize = only_digits,
  placeholder,
  onChange,
  onComplete,
}: OtpInputProps) {
  const box_refs = useRef<Array<HTMLInputElement | null>>([]);
  const autofocus_done_ref = useRef(false);
  const restore_index_ref = useRef<number | null>(null);

  useEffect(() => {
    if (disabled) return;

    if (autofocus && !autofocus_done_ref.current) {
      autofocus_done_ref.current = true;
      box_refs.current[0]?.focus();

      return;
    }

    const restore_index = restore_index_ref.current;

    if (restore_index === null) return;

    restore_index_ref.current = null;
    box_refs.current[restore_index]?.focus();
  }, [autofocus, disabled]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const set_at = (index: number, digit: string) => {
    const next = digits.slice();

    next[index] = digit;

    const joined = next.join("").slice(0, length);

    onChange(joined);
    if (joined.length === length) onComplete?.(joined);
  };

  const handle_change = (index: number, raw: string) => {
    const cleaned = sanitize(raw);

    if (!cleaned) {
      set_at(index, "");

      return;
    }

    const start = Math.min(index, value.length);

    if (cleaned.length > 1) {
      const next = digits.slice();

      for (let i = 0; i < cleaned.length && start + i < length; i++) {
        next[start + i] = cleaned[i];
      }

      const joined = next.join("").slice(0, length);

      onChange(joined);
      if (joined.length === length) onComplete?.(joined);

      const last_index = Math.min(start + cleaned.length, length - 1);

      box_refs.current[last_index]?.focus();

      return;
    }

    set_at(start, cleaned);

    if (start < length - 1) {
      box_refs.current[start + 1]?.focus();
    }
  };

  const handle_key_down = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace" && !digits[index] && index > 0) {
      box_refs.current[index - 1]?.focus();
      set_at(index - 1, "");
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      box_refs.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < length - 1) {
      e.preventDefault();
      box_refs.current[index + 1]?.focus();
    }
  };

  const handle_paste = (
    index: number,
    e: React.ClipboardEvent<HTMLInputElement>,
  ) => {
    e.preventDefault();
    handle_change(index, e.clipboardData.getData("text"));
  };

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2",
        align === "left" ? "justify-start" : "justify-center",
      )}
      aria-label={aria_label}
      role={aria_label ? "group" : undefined}
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => {
            box_refs.current[index] = el;
          }}
          aria-label={
            id_prefix && aria_label ? `${aria_label} ${index + 1}` : undefined
          }
          autoComplete={index === 0 ? "one-time-code" : "off"}
          className={cn(
            "text-center font-semibold tabular-nums outline-none transition-colors bg-surf-primary text-txt-primary border-2",
            size === "lg"
              ? "w-16 h-[76px] rounded-2xl text-4xl"
              : "w-11 h-[52px] rounded-[10px] text-xl",
            status === "error"
              ? "border-red-500"
              : "border-edge-primary focus:border-brand",
            placeholder &&
              "placeholder:font-normal placeholder:text-txt-muted/40 focus:placeholder:text-transparent",
          )}
          disabled={disabled}
          id={id_prefix ? `${id_prefix}_${index}` : undefined}
          inputMode={input_mode}
          maxLength={1}
          placeholder={placeholder}
          type="text"
          value={digit}
          onBlur={(e) => {
            restore_index_ref.current = e.target.disabled ? index : null;
          }}
          onChange={(e) => handle_change(index, e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => handle_key_down(index, e)}
          onPaste={(e) => handle_paste(index, e)}
        />
      ))}
    </div>
  );
}
