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
import type { KeyboardEvent } from "react";

import { useRef } from "react";

import {
  skin_tones,
  skin_tone_swatches,
  type SkinTone,
} from "@/config/emoji/skin_tones";
import { skin_tone_label_keys } from "@/config/emoji/skin_tone_labels";
import { use_i18n } from "@/lib/i18n/context";

interface SkinToneSwatchesProps {
  value: SkinTone;
  on_change: (tone: SkinTone) => void;
  label: string;
}

const ARROW_STEPS: Record<string, number> = {
  ArrowRight: 1,
  ArrowDown: 1,
  ArrowLeft: -1,
  ArrowUp: -1,
};

export function SkinToneSwatches({
  value,
  on_change,
  label,
}: SkinToneSwatchesProps) {
  const { t } = use_i18n();
  const button_refs = useRef<(HTMLButtonElement | null)[]>([]);

  const handle_key_down = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = ARROW_STEPS[event.key];

    if (step === undefined) return;
    event.preventDefault();
    const current = skin_tones.indexOf(value);
    const next = (current + step + skin_tones.length) % skin_tones.length;

    on_change(skin_tones[next]);
    button_refs.current[next]?.focus();
  };

  return (
    <div
      aria-label={label}
      className="flex flex-wrap items-center gap-1"
      role="radiogroup"
      onKeyDown={handle_key_down}
    >
      {skin_tones.map((tone, index) => {
        const selected = tone === value;
        const tone_label = t(skin_tone_label_keys[tone]);

        return (
          <button
            key={tone}
            ref={(element) => {
              button_refs.current[index] = element;
            }}
            aria-checked={selected}
            aria-label={tone_label}
            className={`flex h-9 w-9 cursor-pointer touch-manipulation items-center justify-center rounded-full text-[20px] leading-none outline-none transition-[background-color,box-shadow] duration-150 focus-visible:ring-2 focus-visible:ring-[var(--accent-blue)] ${selected ? "bg-[var(--aster-selected)] shadow-[inset_0_0_0_2px_var(--accent-blue)]" : "hover:bg-[var(--aster-hover)]"}`}
            data-skin-tone={tone}
            role="radio"
            tabIndex={selected ? 0 : -1}
            title={tone_label}
            type="button"
            onClick={() => on_change(tone)}
          >
            <span aria-hidden="true">{skin_tone_swatches[tone]}</span>
          </button>
        );
      })}
    </div>
  );
}
