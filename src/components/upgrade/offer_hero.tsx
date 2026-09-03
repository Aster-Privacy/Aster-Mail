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
const STARS = [
  { x: 42, y: 34, r: 1.6, o: 0.9 },
  { x: 78, y: 20, r: 1, o: 0.55 },
  { x: 118, y: 44, r: 1.2, o: 0.4 },
  { x: 268, y: 26, r: 1.4, o: 0.75 },
  { x: 312, y: 52, r: 1, o: 0.5 },
  { x: 336, y: 96, r: 1.6, o: 0.6 },
  { x: 30, y: 104, r: 1.2, o: 0.45 },
  { x: 296, y: 132, r: 1, o: 0.4 },
];

export function OfferHero({ label }: { label: string }) {
  return (
    <svg
      aria-label={label}
      className="h-full w-full"
      preserveAspectRatio="xMidYMid slice"
      role="img"
      viewBox="0 0 360 168"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="offer_hero_base" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#0a0f1f" />
          <stop offset="55%" stopColor="#111a33" />
          <stop offset="100%" stopColor="#0d1428" />
        </linearGradient>

        <linearGradient id="offer_hero_sky" x1="0" x2="1" y1="0" y2="1">
          <stop
            offset="0%"
            stopColor="var(--accent-color)"
            stopOpacity="0.34"
          />
          <stop
            offset="55%"
            stopColor="var(--accent-blue)"
            stopOpacity="0.16"
          />
          <stop offset="100%" stopColor="var(--accent-blue)" stopOpacity="0" />
        </linearGradient>

        <radialGradient cx="50%" cy="86%" id="offer_hero_glow" r="62%">
          <stop
            offset="0%"
            stopColor="var(--accent-color)"
            stopOpacity="0.55"
          />
          <stop offset="100%" stopColor="var(--accent-color)" stopOpacity="0" />
        </radialGradient>

        <linearGradient id="offer_hero_card" x1="0" x2="0.4" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.24" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.06" />
        </linearGradient>

        <linearGradient id="offer_hero_edge" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.75" />
          <stop
            offset="60%"
            stopColor="var(--accent-color)"
            stopOpacity="0.55"
          />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0.1" />
        </linearGradient>

        <linearGradient id="offer_hero_seal" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.9" />
          <stop offset="45%" stopColor="var(--accent-color)" />
          <stop
            offset="100%"
            stopColor="var(--accent-color)"
            stopOpacity="0.85"
          />
        </linearGradient>
      </defs>

      <rect fill="url(#offer_hero_base)" height="168" width="360" x="0" y="0" />
      <rect fill="url(#offer_hero_sky)" height="168" width="360" x="0" y="0" />
      <ellipse
        cx="180"
        cy="146"
        fill="url(#offer_hero_glow)"
        rx="190"
        ry="86"
      />

      <g opacity="0.5" stroke="var(--accent-color)">
        <ellipse
          cx="180"
          cy="96"
          rx="126"
          ry="42"
          strokeOpacity="0.35"
          strokeWidth="1"
          transform="rotate(-12 180 96)"
        />
        <ellipse
          cx="180"
          cy="96"
          rx="92"
          ry="30"
          strokeOpacity="0.22"
          strokeWidth="1"
          transform="rotate(-12 180 96)"
        />
      </g>

      <g fill="#ffffff">
        {STARS.map((star) => (
          <circle
            key={`${star.x}_${star.y}`}
            cx={star.x}
            cy={star.y}
            fillOpacity={star.o}
            r={star.r}
          />
        ))}
      </g>

      <g transform="rotate(-7 180 100)">
        <rect
          fill="url(#offer_hero_card)"
          height="82"
          rx="10"
          stroke="url(#offer_hero_edge)"
          strokeWidth="1.25"
          width="146"
          x="107"
          y="60"
        />
        <path
          d="M107 72 L180 112 L253 72"
          fill="none"
          stroke="url(#offer_hero_edge)"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.25"
        />
        <rect
          fill="#ffffff"
          fillOpacity="0.18"
          height="3"
          rx="1.5"
          width="44"
          x="123"
          y="124"
        />
        <rect
          fill="#ffffff"
          fillOpacity="0.12"
          height="3"
          rx="1.5"
          width="28"
          x="123"
          y="132"
        />
      </g>

      <g transform="translate(258 44)">
        <circle
          cx="0"
          cy="0"
          fill="url(#offer_hero_seal)"
          r="27"
          stroke="#ffffff"
          strokeOpacity="0.45"
          strokeWidth="1.25"
        />
        <path
          d="M0 -13 L3.6 -4.2 L13 -3.4 L5.9 2.6 L8.1 11.6 L0 6.8 L-8.1 11.6 L-5.9 2.6 L-13 -3.4 L-3.6 -4.2 Z"
          fill="#ffffff"
          fillOpacity="0.92"
        />
      </g>

      <g fill="#ffffff" fillOpacity="0.85">
        <path d="M84 62 L86.4 68.2 L92.6 70.6 L86.4 73 L84 79.2 L81.6 73 L75.4 70.6 L81.6 68.2 Z" />
        <path
          d="M300 108 L301.6 112.1 L305.7 113.7 L301.6 115.3 L300 119.4 L298.4 115.3 L294.3 113.7 L298.4 112.1 Z"
          fillOpacity="0.6"
        />
      </g>
    </svg>
  );
}
