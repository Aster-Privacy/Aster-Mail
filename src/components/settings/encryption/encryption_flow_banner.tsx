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
import { useEffect, useState, useRef } from "react";
import { useReducedMotion } from "framer-motion";
import {
  LockClosedIcon,
  ShieldCheckIcon,
  KeyIcon,
} from "@heroicons/react/24/outline";

import { use_i18n } from "@/lib/i18n/context";

const CIPHER = "a4f8 e91c 0b7d 3f2a";
const HEX = "0123456789abcdef ";

function ScrambleLoop({ reduced }: { reduced: boolean }) {
  const [text, set_text] = useState(CIPHER);
  const frame_ref = useRef<number>();

  useEffect(() => {
    if (reduced) {
      set_text(CIPHER);

      return;
    }

    let last = 0;
    const tick = (now: number) => {
      if (now - last > 80) {
        last = now;
        let r = "";

        for (let i = 0; i < CIPHER.length; i++) {
          r += CIPHER[i] === " " ? " " : HEX[Math.floor(Math.random() * 16)];
        }
        set_text(r);
      }
      frame_ref.current = requestAnimationFrame(tick);
    };

    frame_ref.current = requestAnimationFrame(tick);

    return () => {
      if (frame_ref.current) cancelAnimationFrame(frame_ref.current);
    };
  }, [reduced]);

  return <>{text}</>;
}

export function EncryptionFlowBanner() {
  const { t } = use_i18n();
  const reduced = useReducedMotion() ?? false;

  return (
    <div
      className="relative overflow-hidden rounded-2xl p-6"
      style={{
        background:
          "linear-gradient(135deg, #4c1d95 0%, #6d28d9 40%, #7c3aed 70%, #8b5cf6 100%)",
        boxShadow:
          "0 1px 3px rgba(0, 0, 0, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.1)",
      }}
    >
      <div className="absolute right-5 top-1/2 -translate-y-1/2 flex items-end gap-2 pointer-events-none">
        <KeyIcon
          className="w-9 h-9 text-white/[0.15]"
          style={{ transform: "translateY(-18px) rotate(-15deg)" }}
        />
        <ShieldCheckIcon className="w-20 h-20 text-white/[0.2]" />
        <LockClosedIcon
          className="w-11 h-11 text-white/[0.12]"
          style={{ transform: "translateY(-28px) rotate(12deg)" }}
        />
        <KeyIcon
          className="w-7 h-7 text-white/[0.1]"
          style={{ transform: "translateY(-6px) rotate(-10deg)" }}
        />
      </div>

      <div className="relative z-10">
        <h3
          className="text-lg font-bold text-white mb-1 tracking-tight"
          style={{ textShadow: "0 1px 3px rgba(0, 0, 0, 0.15)" }}
        >
          {t("settings.encryption_banner_title")}
        </h3>
        <p
          className="text-sm text-purple-100/70 mb-5 max-w-[280px]"
          style={{ textShadow: "0 1px 2px rgba(0, 0, 0, 0.1)" }}
        >
          {t("settings.encryption_banner_subtitle")}
        </p>

        <div
          className="inline-flex items-center gap-3 px-4 py-2.5 rounded-xl"
          style={{
            background: "rgba(0, 0, 0, 0.15)",
            border: "1px solid rgba(255, 255, 255, 0.08)",
          }}
        >
          <span className="text-xs font-medium text-purple-100/90">
            {t("settings.encryption_banner_you")}
          </span>

          <div className="flex items-center gap-1.5">
            <div className="w-4 h-px bg-purple-300/30" />
            <LockClosedIcon className="w-3.5 h-3.5 text-purple-300/70" />
            <div className="w-4 h-px bg-purple-300/30" />
          </div>

          <span className="text-[11px] font-mono text-purple-200/40 tracking-wider min-w-[120px]">
            <ScrambleLoop reduced={reduced} />
          </span>

          <div className="flex items-center gap-1.5">
            <div className="w-4 h-px bg-purple-300/30" />
            <LockClosedIcon className="w-3.5 h-3.5 text-purple-300/70" />
            <div className="w-4 h-px bg-purple-300/30" />
          </div>

          <span className="text-xs font-medium text-purple-100/90">
            {t("settings.encryption_banner_recipient")}
          </span>
        </div>
      </div>
    </div>
  );
}
