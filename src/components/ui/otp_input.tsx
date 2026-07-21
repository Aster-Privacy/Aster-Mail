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

interface OtpInputProps {
  length?: number;
  value: string;
  disabled?: boolean;
  status?: "default" | "error";
  autofocus?: boolean;
  align?: "center" | "left";
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
}

export function OtpInput({
  length = 6,
  value,
  disabled = false,
  status = "default",
  autofocus = true,
  align = "center",
  onChange,
  onComplete,
}: OtpInputProps) {
  const box_refs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (autofocus) box_refs.current[0]?.focus();
  }, [autofocus]);

  const digits = Array.from({ length }, (_, i) => value[i] ?? "");

  const set_at = (index: number, digit: string) => {
    const next = digits.slice();

    next[index] = digit;

    const joined = next.join("").slice(0, length);

    onChange(joined);
    if (joined.length === length) onComplete?.(joined);
  };

  const handle_change = (index: number, raw: string) => {
    const cleaned = raw.replace(/\D/g, "");

    if (!cleaned) {
      set_at(index, "");

      return;
    }

    if (cleaned.length > 1) {
      const next = value.split("");

      for (let i = 0; i < cleaned.length && index + i < length; i++) {
        next[index + i] = cleaned[i];
      }

      const joined = next.join("").slice(0, length);

      onChange(joined);
      if (joined.length === length) onComplete?.(joined);

      const last_index = Math.min(index + cleaned.length, length - 1);

      box_refs.current[last_index]?.focus();

      return;
    }

    set_at(index, cleaned);

    if (index < length - 1) {
      box_refs.current[index + 1]?.focus();
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
    >
      {digits.map((digit, index) => (
        <input
          key={index}
          ref={(el) => { box_refs.current[index] = el; }}
          autoComplete={index === 0 ? "one-time-code" : "off"}
          className={cn(
            "w-11 h-[52px] rounded-[10px] text-center text-xl font-semibold outline-none transition-colors bg-surf-primary text-txt-primary border-2",
            status === "error"
              ? "border-red-500"
              : "border-edge-primary focus:border-brand",
          )}
          disabled={disabled}
          inputMode="numeric"
          maxLength={1}
          type="text"
          value={digit}
          onChange={(e) => handle_change(index, e.target.value)}
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => handle_key_down(index, e)}
          onPaste={(e) => handle_paste(index, e)}
        />
      ))}
    </div>
  );
}
