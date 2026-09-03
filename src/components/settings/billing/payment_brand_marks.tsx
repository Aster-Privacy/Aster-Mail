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
import type { ReactElement } from "react";
import { LockClosedIcon } from "@heroicons/react/20/solid";
import { SiAmericanexpress, SiDiscover, SiVisa } from "react-icons/si";

import { CoinIcon } from "@/components/ui/coin_icon";

const brand_tile =
  "flex h-[24px] w-[36px] flex-shrink-0 items-center justify-center overflow-hidden rounded-[4px]";

function BrandTile({
  background,
  border,
  children,
  title,
}: {
  background: string;
  border?: string;
  children: ReactElement;
  title: string;
}): ReactElement {
  return (
    <span
      aria-label={title}
      className={brand_tile}
      role="img"
      style={{
        backgroundColor: background,
        boxShadow: border ? `inset 0 0 0 1px ${border}` : undefined,
      }}
    >
      {children}
    </span>
  );
}

function VisaMark(): ReactElement {
  return (
    <BrandTile background="#ffffff" border="rgba(0,0,0,0.12)" title="Visa">
      <SiVisa aria-hidden="true" color="#1434cb" size={34} />
    </BrandTile>
  );
}

function MastercardMark(): ReactElement {
  return (
    <BrandTile
      background="#ffffff"
      border="rgba(0,0,0,0.12)"
      title="Mastercard"
    >
      <svg
        aria-hidden="true"
        className="h-[16px] w-[26px]"
        focusable="false"
        viewBox="0 0 26 16"
      >
        <defs>
          <clipPath id="aster_mastercard_overlap">
            <circle cx="10" cy="8" r="6.4" />
          </clipPath>
        </defs>
        <circle cx="10" cy="8" fill="#eb001b" r="6.4" />
        <circle cx="16" cy="8" fill="#f79e1b" r="6.4" />
        <circle
          clipPath="url(#aster_mastercard_overlap)"
          cx="16"
          cy="8"
          fill="#ff5f00"
          r="6.4"
        />
      </svg>
    </BrandTile>
  );
}

function AmexMark(): ReactElement {
  return (
    <BrandTile background="#006fcf" title="American Express">
      <SiAmericanexpress aria-hidden="true" color="#ffffff" size={34} />
    </BrandTile>
  );
}

function DiscoverMark(): ReactElement {
  return (
    <BrandTile background="#ffffff" border="rgba(0,0,0,0.12)" title="Discover">
      <SiDiscover aria-hidden="true" color="#181818" size={34} />
    </BrandTile>
  );
}

export function CardBrandMarks({
  class_name = "",
}: {
  class_name?: string;
}): ReactElement {
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${class_name}`}>
      <VisaMark />
      <MastercardMark />
      <AmexMark />
      <DiscoverMark />
    </span>
  );
}

export function SecurityMarks({
  label,
  class_name = "",
}: {
  label: string;
  class_name?: string;
}): ReactElement {
  return (
    <span
      className={`flex items-center gap-1.5 text-[11px] leading-snug text-txt-muted ${class_name}`}
    >
      <LockClosedIcon
        aria-hidden="true"
        className="h-[13px] w-[13px] flex-shrink-0"
        style={{ color: "var(--accent-color)" }}
      />
      <span className="min-w-0">{label}</span>
    </span>
  );
}

const stacked_coins: { currency: string; chain: string; label: string }[] = [
  { currency: "btc", chain: "bitcoin", label: "Bitcoin" },
  { currency: "eth", chain: "ethereum", label: "Ethereum" },
  { currency: "usdc", chain: "base", label: "USD Coin" },
  { currency: "usdt", chain: "ethereum", label: "Tether" },
  { currency: "ltc", chain: "litecoin", label: "Litecoin" },
  { currency: "xmr", chain: "monero", label: "Monero" },
];

export function CoinStack({
  class_name = "",
}: {
  class_name?: string;
}): ReactElement {
  return (
    <span className={`flex flex-wrap items-center gap-1.5 ${class_name}`}>
      {stacked_coins.map((coin) => (
        <span
          key={`${coin.currency}_${coin.chain}`}
          aria-label={coin.label}
          className="inline-flex"
          role="img"
          title={coin.label}
        >
          <CoinIcon chain={coin.chain} currency={coin.currency} size={24} />
        </span>
      ))}
    </span>
  );
}
