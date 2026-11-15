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
import type { CSSProperties, KeyboardEvent, PointerEvent } from "react";

import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@aster/ui";
import { CheckIcon } from "@heroicons/react/16/solid";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { use_i18n } from "@/lib/i18n/context";
import { use_escape_layer } from "@/lib/overlay_layer_stack";
import { tag_color_label_key } from "@/components/ui/email_tag";
import {
  COLOR_ROW_PRESETS,
  COLOR_ROW_PRESET_HEXES,
  COLOR_WHEEL_RAINBOW,
  DEFAULT_PICKER_COLOR,
  type Hsv,
  hex_to_hsv,
  hsv_to_hex,
  hue_saturation_to_wheel_point,
  is_preset_color,
  normalize_hex,
  readable_text_color,
  wheel_point_to_hue_saturation,
} from "@/lib/color_wheel";

const FULL_HEX_DRAFT_LENGTH = 7;
const HUE_KEY_STEP = 5;
const FRACTION_KEY_STEP = 0.05;

function clamp_unit(value: number): number {
  return Math.max(0, Math.min(1, value));
}

interface ColorWheelPanelProps {
  value: string;
  on_change: (hex: string) => void;
}

export function ColorWheelPanel({ value, on_change }: ColorWheelPanelProps) {
  const { t } = use_i18n();
  const initial = normalize_hex(value) ?? DEFAULT_PICKER_COLOR;
  const [hsv, set_hsv] = useState<Hsv>(() => hex_to_hsv(initial));
  const [hex_draft, set_hex_draft] = useState(initial);
  const [hex_error, set_hex_error] = useState(false);
  const wheel_ref = useRef<HTMLDivElement>(null);
  const brightness_ref = useRef<HTMLDivElement>(null);
  const emitted_ref = useRef(initial);

  useEffect(() => {
    const normalized = normalize_hex(value);

    if (!normalized || normalized === emitted_ref.current) return;
    emitted_ref.current = normalized;
    set_hsv(hex_to_hsv(normalized));
    set_hex_draft(normalized);
    set_hex_error(false);
  }, [value]);

  const apply_hsv = (next: Hsv) => {
    const hex = hsv_to_hex(next);

    set_hsv(next);
    set_hex_draft(hex);
    set_hex_error(false);
    if (hex !== emitted_ref.current) {
      emitted_ref.current = hex;
      on_change(hex);
    }
  };

  const update_from_wheel = (client_x: number, client_y: number) => {
    const el = wheel_ref.current;

    if (!el) return;
    const rect = el.getBoundingClientRect();
    const radius = rect.width / 2;
    const { h, s } = wheel_point_to_hue_saturation(
      client_x - rect.left - radius,
      client_y - rect.top - radius,
      radius,
    );

    apply_hsv({ h: s === 0 ? hsv.h : h, s, v: hsv.v === 0 ? 1 : hsv.v });
  };

  const update_from_brightness = (client_x: number) => {
    const el = brightness_ref.current;

    if (!el) return;
    const rect = el.getBoundingClientRect();

    apply_hsv({ ...hsv, v: clamp_unit((client_x - rect.left) / rect.width) });
  };

  const start_drag = (
    e: PointerEvent<HTMLDivElement>,
    update: (x: number, y: number) => void,
  ) => {
    if (e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    update(e.clientX, e.clientY);
  };

  const continue_drag = (
    e: PointerEvent<HTMLDivElement>,
    update: (x: number, y: number) => void,
  ) => {
    if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
    update(e.clientX, e.clientY);
  };

  const handle_wheel_key = (e: KeyboardEvent<HTMLDivElement>) => {
    const steps: Record<string, Partial<Hsv>> = {
      ArrowLeft: { h: (hsv.h - HUE_KEY_STEP + 360) % 360 },
      ArrowRight: { h: (hsv.h + HUE_KEY_STEP) % 360 },
      ArrowUp: { s: clamp_unit(hsv.s + FRACTION_KEY_STEP) },
      ArrowDown: { s: clamp_unit(hsv.s - FRACTION_KEY_STEP) },
    };
    const change = steps[e.key];

    if (!change) return;
    e.preventDefault();
    apply_hsv({ ...hsv, ...change });
  };

  const handle_brightness_key = (e: KeyboardEvent<HTMLDivElement>) => {
    const deltas: Record<string, number> = {
      ArrowLeft: -FRACTION_KEY_STEP,
      ArrowDown: -FRACTION_KEY_STEP,
      ArrowRight: FRACTION_KEY_STEP,
      ArrowUp: FRACTION_KEY_STEP,
    };

    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      apply_hsv({ ...hsv, v: e.key === "Home" ? 0 : 1 });

      return;
    }
    const delta = deltas[e.key];

    if (delta === undefined) return;
    e.preventDefault();
    apply_hsv({ ...hsv, v: clamp_unit(hsv.v + delta) });
  };

  const apply_hex = (normalized: string) => {
    set_hex_error(false);
    set_hex_draft(normalized);
    set_hsv(hex_to_hsv(normalized));
    if (normalized !== emitted_ref.current) {
      emitted_ref.current = normalized;
      on_change(normalized);
    }
  };

  const handle_hex_input = (raw: string) => {
    const trimmed = raw.trim();
    const draft =
      trimmed.length === 0 || trimmed.startsWith("#") ? trimmed : `#${trimmed}`;

    set_hex_draft(draft);
    set_hex_error(false);
    if (draft.length !== FULL_HEX_DRAFT_LENGTH) return;
    const normalized = normalize_hex(draft);

    if (normalized) apply_hex(normalized);
  };

  const commit_hex_draft = () => {
    const normalized = normalize_hex(hex_draft);

    if (!normalized) {
      set_hex_error(true);

      return;
    }
    apply_hex(normalized);
  };

  const current_hex = hsv_to_hex(hsv);
  const full_brightness_hex = hsv_to_hex({ ...hsv, v: 1 });
  const thumb = hue_saturation_to_wheel_point(hsv.h, hsv.s);
  const brightness_label_id = useId();
  const hex_error_id = useId();

  return (
    <div className="flex flex-col gap-3" data-color-wheel-panel="">
      <div
        ref={wheel_ref}
        aria-label={t("common.color_custom")}
        aria-valuetext={current_hex}
        className="relative aspect-square w-full cursor-crosshair touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surf-primary"
        role="application"
        style={{ backgroundImage: COLOR_WHEEL_RAINBOW }}
        tabIndex={0}
        onKeyDown={handle_wheel_key}
        onPointerDown={(e) => start_drag(e, update_from_wheel)}
        onPointerMove={(e) => continue_drag(e, update_from_wheel)}
      >
        <div
          className="pointer-events-none absolute inset-0 rounded-full"
          style={{
            backgroundImage:
              "radial-gradient(circle closest-side, #ffffff, rgba(255, 255, 255, 0))",
          }}
        />
        <div
          className="pointer-events-none absolute inset-0 rounded-full bg-black"
          style={{ opacity: 1 - hsv.v }}
        />
        <div
          className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
          style={{
            left: `${thumb.x * 100}%`,
            top: `${thumb.y * 100}%`,
            backgroundColor: current_hex,
            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.45)",
          }}
        />
      </div>

      <div>
        <span
          className="mb-1.5 block text-[12px] font-medium text-txt-secondary"
          id={brightness_label_id}
        >
          {t("common.color_brightness")}
        </span>
        <div
          ref={brightness_ref}
          aria-labelledby={brightness_label_id}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={Math.round(hsv.v * 100)}
          className="relative h-3 w-full cursor-pointer touch-none select-none rounded-full outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surf-primary"
          role="slider"
          style={{
            backgroundImage: `linear-gradient(to right, #000000, ${full_brightness_hex})`,
          }}
          tabIndex={0}
          onKeyDown={handle_brightness_key}
          onPointerDown={(e) => start_drag(e, update_from_brightness)}
          onPointerMove={(e) => continue_drag(e, update_from_brightness)}
        >
          <div
            className="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white"
            style={{
              left: `${hsv.v * 100}%`,
              backgroundColor: current_hex,
              boxShadow: "0 1px 4px rgba(0, 0, 0, 0.45)",
            }}
          />
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <div
            aria-hidden="true"
            className="h-8 w-8 flex-shrink-0 rounded-full border border-edge-secondary"
            style={{ backgroundColor: current_hex }}
          />
          <Input
            aria-describedby={hex_error ? hex_error_id : undefined}
            aria-invalid={hex_error}
            aria-label={t("common.color_hex")}
            autoCapitalize="off"
            autoComplete="off"
            className="w-auto min-w-0 flex-1 font-mono"
            maxLength={FULL_HEX_DRAFT_LENGTH}
            size="sm"
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
        {hex_error && (
          <p
            className="mt-1.5 text-[12px] text-[var(--color-danger)]"
            id={hex_error_id}
            role="alert"
          >
            {t("common.color_hex_invalid")}
          </p>
        )}
      </div>
    </div>
  );
}

function SelectedCheck({ fill }: { fill: string }) {
  return (
    <CheckIcon
      aria-hidden="true"
      className="pointer-events-none h-[55%] w-[55%]"
      data-swatch-check=""
      style={{ color: readable_text_color(fill) }}
    />
  );
}

const SWATCH_CLASS_NAME =
  "color_row_swatch relative flex aspect-square w-full min-w-0 items-center justify-center rounded-full";

interface CustomColorSwatchProps {
  value: string | null | undefined;
  presets?: readonly string[];
  on_change: (hex: string) => void;
  on_commit?: (hex: string) => void;
  align?: "start" | "center" | "end";
  content_class_name?: string;
}

export function CustomColorSwatch({
  value,
  presets = COLOR_ROW_PRESET_HEXES,
  on_change,
  on_commit,
  align = "center",
  content_class_name = "z-[300]",
}: CustomColorSwatchProps) {
  const { t } = use_i18n();
  const [is_open, set_is_open] = useState(false);
  const opened_with_ref = useRef<string | null>(null);
  const latest_ref = useRef<string | null>(null);
  const normalized = normalize_hex(value);
  const is_custom = normalized !== null && !is_preset_color(normalized, presets);

  const handle_open_change = (next: boolean) => {
    if (next) {
      opened_with_ref.current = normalized;
      latest_ref.current = normalized;
    } else if (
      latest_ref.current &&
      latest_ref.current !== opened_with_ref.current
    ) {
      on_commit?.(latest_ref.current);
    }
    set_is_open(next);
  };

  use_escape_layer(is_open, () => handle_open_change(false), "custom_color");

  const handle_change = (hex: string) => {
    latest_ref.current = hex;
    on_change(hex);
  };

  const style: CSSProperties =
    is_custom && normalized
      ? { backgroundColor: normalized }
      : { backgroundImage: COLOR_WHEEL_RAINBOW };

  return (
    <Popover open={is_open} onOpenChange={handle_open_change}>
      <PopoverTrigger asChild>
        <button
          aria-expanded={is_open}
          aria-haspopup="dialog"
          aria-label={t("common.color_custom")}
          aria-pressed={is_custom}
          className={SWATCH_CLASS_NAME}
          data-custom-color-swatch=""
          data-selected={is_custom ? "true" : undefined}
          style={style}
          title={t("common.color_custom")}
          type="button"
        >
          {is_custom && normalized && <SelectedCheck fill={normalized} />}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align={align}
        aria-label={t("common.color_custom")}
        className={`w-[248px] p-3 ${content_class_name}`}
        collisionPadding={12}
        role="dialog"
        sideOffset={8}
        onClick={(e) => e.stopPropagation()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          if (e.key !== "Escape") return;
          e.stopPropagation();
          handle_open_change(false);
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <ColorWheelPanel
          value={normalized ?? DEFAULT_PICKER_COLOR}
          on_change={handle_change}
        />
      </PopoverContent>
    </Popover>
  );
}

interface ColorSwatchRowProps {
  value: string | null | undefined;
  on_change: (hex: string) => void;
  on_commit?: (hex: string) => void;
  max_swatch_size?: number;
  class_name?: string;
  labelled_by?: string;
  label?: string;
  align?: "start" | "center" | "end";
  content_class_name?: string;
}

export function ColorSwatchRow({
  value,
  on_change,
  on_commit,
  max_swatch_size = 32,
  class_name = "w-full",
  labelled_by,
  label,
  align = "end",
  content_class_name,
}: ColorSwatchRowProps) {
  const { t } = use_i18n();
  const normalized = normalize_hex(value);

  const select_preset = (hex: string) => {
    on_change(hex);
    if (hex !== normalized) on_commit?.(hex);
  };

  return (
    <div
      aria-label={labelled_by ? undefined : label}
      aria-labelledby={labelled_by}
      className={`color_swatch_row grid items-center p-1 ${class_name}`}
      data-color-swatch-row=""
      role="group"
      style={{
        gridTemplateColumns: `repeat(${COLOR_ROW_PRESETS.length + 1}, minmax(0, ${max_swatch_size}px))`,
      }}
    >
      {COLOR_ROW_PRESETS.map((preset) => {
        const is_selected = normalized === preset.hex;

        return (
          <button
            key={preset.hex}
            aria-label={t(tag_color_label_key(preset.variant))}
            aria-pressed={is_selected}
            className={SWATCH_CLASS_NAME}
            data-selected={is_selected ? "true" : undefined}
            style={{ backgroundColor: preset.hex }}
            title={t(tag_color_label_key(preset.variant))}
            type="button"
            onClick={() => select_preset(preset.hex)}
          >
            {is_selected && <SelectedCheck fill={preset.hex} />}
          </button>
        );
      })}
      <CustomColorSwatch
        align={align}
        content_class_name={content_class_name}
        value={normalized}
        on_change={on_change}
        on_commit={on_commit}
      />
    </div>
  );
}
