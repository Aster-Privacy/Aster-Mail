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
import type { CSSProperties } from "react";

import { useLayoutEffect, useRef, useState } from "react";

import special_offer_wordmark_url from "@/assets/special_offer_wordmark.webp";

const LOCKUP_MAX_WIDTH_RATIO = 306 / 880;

interface SpecialOfferHeroLockupProps {
  plan_name: string;
}

export function SpecialOfferHeroLockup({
  plan_name,
}: SpecialOfferHeroLockupProps) {
  const lockup_ref = useRef<HTMLDivElement | null>(null);
  const [scale, set_scale] = useState(1);

  useLayoutEffect(() => {
    const lockup = lockup_ref.current;

    if (!lockup) return;

    let is_active = true;

    const fit = () => {
      const hero_width = lockup.parentElement?.clientWidth ?? 0;
      const natural_width = lockup.offsetWidth;

      if (!is_active || hero_width <= 0 || natural_width <= 0) return;

      set_scale(
        Math.min(1, (hero_width * LOCKUP_MAX_WIDTH_RATIO) / natural_width),
      );
    };

    fit();
    void document.fonts?.ready.then(fit);

    return () => {
      is_active = false;
    };
  }, [plan_name]);

  return (
    <div
      ref={lockup_ref}
      className="special_offer_hero_lockup"
      dir="ltr"
      style={{ "--special_offer_hero_scale": scale } as CSSProperties}
    >
      <img
        alt=""
        className="special_offer_hero_wordmark"
        draggable={false}
        src={special_offer_wordmark_url}
      />
      <span className="special_offer_hero_plan">{plan_name}</span>
    </div>
  );
}
