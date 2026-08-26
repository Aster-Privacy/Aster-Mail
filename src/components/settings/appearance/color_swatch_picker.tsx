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
import { useEffect, useRef, useState } from "react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { is_valid_hex_color } from "@/lib/material_theme";

interface Hsv {
  h: number;
  s: number;
  v: number;
}

function hex_to_rgb(hex: string): [number, number, number] {
  const normalized = hex.replace("#", "");
  const expanded =
    normalized.length === 3
      ? normalized
          .split("")
          .map((c) => c + c)
          .join("")
      : normalized;
  const int_value = parseInt(expanded, 16);

  return [(int_value >> 16) & 255, (int_value >> 8) & 255, int_value & 255];
}

function rgb_to_hex(r: number, g: number, b: number): string {
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));

  return `#${[r, g, b]
    .map((v) => clamp(v).toString(16).padStart(2, "0"))
    .join("")}`;
}

function rgb_to_hsv(r: number, g: number, b: number): Hsv {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;

  if (delta !== 0) {
    if (max === rn) h = ((gn - bn) / delta) % 6;
    else if (max === gn) h = (bn - rn) / delta + 2;
    else h = (rn - gn) / delta + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  const v = max;

  return { h, s, v };
}

function hsv_to_rgb(h: number, s: number, v: number): [number, number, number] {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;

  let rp = 0;
  let gp = 0;
  let bp = 0;

  if (h < 60) [rp, gp, bp] = [c, x, 0];
  else if (h < 120) [rp, gp, bp] = [x, c, 0];
  else if (h < 180) [rp, gp, bp] = [0, c, x];
  else if (h < 240) [rp, gp, bp] = [0, x, c];
  else if (h < 300) [rp, gp, bp] = [x, 0, c];
  else [rp, gp, bp] = [c, 0, x];

  return [(rp + m) * 255, (gp + m) * 255, (bp + m) * 255];
}

function hex_to_hsv(hex: string): Hsv {
  const [r, g, b] = hex_to_rgb(hex);

  return rgb_to_hsv(r, g, b);
}

function hsv_to_hex(hsv: Hsv): string {
  const [r, g, b] = hsv_to_rgb(hsv.h, hsv.s, hsv.v);

  return rgb_to_hex(r, g, b);
}

interface ColorSwatchPickerProps {
  value: string;
  onChange: (hex: string) => void;
  onCommit?: (hex: string) => void;
  label: string;
  size?: "sm" | "md";
}

export function ColorSwatchPicker({
  value,
  onChange,
  onCommit,
  label,
  size = "md",
}: ColorSwatchPickerProps) {
  const safe_value = is_valid_hex_color(value) ? value : "#3b82f6";
  const [hsv, set_hsv] = useState<Hsv>(() => hex_to_hsv(safe_value));
  const [hex_draft, set_hex_draft] = useState(safe_value);
  const [hex_error, set_hex_error] = useState(false);
  const [is_open, set_is_open] = useState(false);
  const sv_ref = useRef<HTMLDivElement>(null);
  const hue_ref = useRef<HTMLDivElement>(null);
  const dragging_ref = useRef<"sv" | "hue" | null>(null);
  const last_committed_hex_ref = useRef(safe_value);

  useEffect(() => {
    if (is_open) return;
    set_hsv(hex_to_hsv(safe_value));
    set_hex_draft(safe_value);
    set_hex_error(false);
    last_committed_hex_ref.current = safe_value;
  }, [safe_value, is_open]);

  const preview = (next: Hsv) => {
    set_hsv(next);
    const hex = hsv_to_hex(next);

    set_hex_draft(hex);

    return hex;
  };

  const finish_drag = () => {
    if (dragging_ref.current === null) return;

    dragging_ref.current = null;
    if (hex_draft !== last_committed_hex_ref.current) {
      last_committed_hex_ref.current = hex_draft;
      onChange(hex_draft);
      onCommit?.(hex_draft);
    }
  };

  const update_from_sv_point = (client_x: number, client_y: number) => {
    const el = sv_ref.current;

    if (!el) return;

    const rect = el.getBoundingClientRect();
    const s = Math.max(0, Math.min(1, (client_x - rect.left) / rect.width));
    const v = Math.max(0, Math.min(1, 1 - (client_y - rect.top) / rect.height));

    preview({ ...hsv, s, v });
  };

  useEffect(() => {
    if (!is_open) return;

    const handle_move = (e: PointerEvent) => {
      if (dragging_ref.current === "sv") {
        update_from_sv_point(e.clientX, e.clientY);
      } else if (dragging_ref.current === "hue") {
        const el = hue_ref.current;

        if (!el) return;
        const rect = el.getBoundingClientRect();
        const h = Math.max(
          0,
          Math.min(360, ((e.clientX - rect.left) / rect.width) * 360),
        );

        preview({ ...hsv, h });
      }
    };

    window.addEventListener("pointermove", handle_move);
    window.addEventListener("pointerup", finish_drag);

    return () => {
      window.removeEventListener("pointermove", handle_move);
      window.removeEventListener("pointerup", finish_drag);
    };
  }, [is_open, hsv, hex_draft]);

  const handle_hex_input = (raw: string) => {
    const next = raw.startsWith("#") ? raw : `#${raw}`;

    set_hex_draft(next);

    if (is_valid_hex_color(next)) {
      set_hex_error(false);
      set_hsv(hex_to_hsv(next));
      onChange(next);

      return;
    }

    set_hex_error(true);
  };

  const commit_hex_draft = () => {
    if (!is_valid_hex_color(hex_draft)) {
      const restored = last_committed_hex_ref.current;

      set_hex_draft(restored);
      set_hex_error(false);
      set_hsv(hex_to_hsv(restored));
      onChange(restored);

      return;
    }

    set_hex_error(false);

    if (hex_draft === last_committed_hex_ref.current) return;

    last_committed_hex_ref.current = hex_draft;
    onCommit?.(hex_draft);
  };

  const swatch_size = size === "sm" ? "h-8 w-8" : "h-10 w-14";
  const hue_hex = hsv_to_hex({ h: hsv.h, s: 1, v: 1 });

  return (
    <Popover open={is_open} onOpenChange={set_is_open}>
      <PopoverTrigger asChild>
        <button
          aria-label={label}
          className={`${swatch_size} rounded-lg border border-edge-secondary cursor-pointer flex-shrink-0 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand`}
          style={{ backgroundColor: safe_value }}
          type="button"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 border border-edge-primary bg-modal-bg shadow-lg rounded-xl p-4 z-[200]"
        sideOffset={8}
      >
        <div
          ref={sv_ref}
          className="relative h-36 w-full rounded-lg cursor-crosshair select-none"
          style={{
            backgroundImage: `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, ${hue_hex})`,
            backgroundBlendMode: "multiply",
          }}
          onPointerDown={(e) => {
            dragging_ref.current = "sv";
            update_from_sv_point(e.clientX, e.clientY);
          }}
        >
          <div
            className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md pointer-events-none"
            style={{
              left: `${hsv.s * 100}%`,
              top: `${(1 - hsv.v) * 100}%`,
              backgroundColor: safe_value,
            }}
          />
        </div>

        <div
          ref={hue_ref}
          className="relative mt-3 h-3 w-full rounded-full cursor-pointer select-none"
          style={{
            backgroundImage:
              "linear-gradient(to right, #ff0000, #ffff00, #00ff00, #00ffff, #0000ff, #ff00ff, #ff0000)",
          }}
          onPointerDown={(e) => {
            dragging_ref.current = "hue";
            const rect = e.currentTarget.getBoundingClientRect();
            const h = Math.max(
              0,
              Math.min(360, ((e.clientX - rect.left) / rect.width) * 360),
            );

            preview({ ...hsv, h });
          }}
        >
          <div
            className="absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md pointer-events-none"
            style={{
              left: `${(hsv.h / 360) * 100}%`,
              backgroundColor: hue_hex,
            }}
          />
        </div>

        <div className="mt-3 flex items-center gap-2">
          <div
            className="h-8 w-8 flex-shrink-0 rounded-md border border-edge-secondary"
            style={{ backgroundColor: safe_value }}
          />
          <input
            aria-invalid={hex_error}
            className={`flex-1 min-w-0 rounded-md border bg-transparent px-2 py-1.5 text-sm text-txt-primary font-mono focus:outline-none focus-visible:ring-2 focus-visible:ring-brand ${
              hex_error ? "border-danger" : "border-edge-secondary"
            }`}
            spellCheck={false}
            type="text"
            value={hex_draft}
            onBlur={commit_hex_draft}
            onChange={(e) => handle_hex_input(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              e.preventDefault();
              commit_hex_draft();
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
