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
import { useId, useMemo } from "react";

import {
  LED_VIEW_HEIGHT,
  LED_VIEW_WIDTH,
  layout_led,
  led_text,
} from "./offer_led";

import offer_hero_plate_url from "@/assets/offer_hero_plate.webp";
import { SpecialOfferHeroLockup } from "@/components/upgrade/special_offer_hero_lockup";

const GLOW_LAYERS = [
  { blur: 44, strength: 1.6, color: "rgb(191,8,31)" },
  { blur: 11.7, strength: 1.3, color: "rgb(255,20,26)" },
  { blur: 4.4, strength: 0.9, color: "rgb(255,20,26)" },
  { blur: 1.2, strength: 0.7, color: "rgb(255,64,64)" },
];

interface OfferLedHeroProps {
  percent: number | null;
  plan_name: string;
}

export function OfferLedHero({ percent, plan_name }: OfferLedHeroProps) {
  const id = useId().replace(/:/g, "");
  const layout = useMemo(
    () => (percent === null ? null : layout_led(led_text(percent))),
    [percent],
  );

  const dots = (radius: number) =>
    layout?.dots.map((dot) => (
      <circle key={`${dot.x}-${dot.y}`} cx={dot.x} cy={dot.y} r={radius} />
    ));

  return (
    <div
      className="special_offer_hero rounded-t-xl"
      onDragStart={(event) => event.preventDefault()}
    >
      <img
        alt=""
        aria-hidden="true"
        className="special_offer_hero_image"
        draggable={false}
        src={offer_hero_plate_url}
      />
      {layout && (
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 h-full w-full"
          data-testid="offer_led"
          preserveAspectRatio="xMidYMid slice"
          viewBox={`0 0 ${LED_VIEW_WIDTH} ${LED_VIEW_HEIGHT}`}
        >
          <defs>
            <radialGradient id={`${id}_void`}>
              <stop offset="0" stopColor="#000" stopOpacity="0.6" />
              <stop offset="0.41" stopColor="#000" stopOpacity="0.6" />
              <stop offset="0.6" stopColor="#000" stopOpacity="0.45" />
              <stop offset="0.8" stopColor="#000" stopOpacity="0.16" />
              <stop offset="1" stopColor="#000" stopOpacity="0" />
            </radialGradient>
            {GLOW_LAYERS.map((layer, index) => (
              <filter
                key={layer.blur}
                colorInterpolationFilters="sRGB"
                filterUnits="userSpaceOnUse"
                height={LED_VIEW_HEIGHT}
                id={`${id}_glow_${index}`}
                width={LED_VIEW_WIDTH}
                x="0"
                y="0"
              >
                <feGaussianBlur stdDeviation={layer.blur} />
                <feComponentTransfer>
                  <feFuncA slope={layer.strength} type="linear" />
                </feComponentTransfer>
              </filter>
            ))}
          </defs>
          <ellipse
            cx={layout.center_x}
            cy={layout.center_y}
            fill={`url(#${id}_void)`}
            rx={layout.width * 0.76}
            ry={layout.height * 1.395}
          />
          {GLOW_LAYERS.map((layer, index) => (
            <g
              key={layer.blur}
              fill={layer.color}
              filter={`url(#${id}_glow_${index})`}
              style={{ mixBlendMode: "screen" }}
            >
              {dots(layout.dot_radius)}
            </g>
          ))}
          <g fill="rgb(255,41,41)">{dots(layout.dot_radius)}</g>
          <g fill="rgb(255,209,204)">{dots(layout.hot_radius)}</g>
        </svg>
      )}
      <SpecialOfferHeroLockup plan_name={plan_name} />
    </div>
  );
}
