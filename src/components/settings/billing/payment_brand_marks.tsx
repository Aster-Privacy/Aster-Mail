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

import { CoinIcon } from "@/components/ui/coin_icon";
import visa_url from "@/vendor/payment_card_icons/visa.svg";
import mastercard_url from "@/vendor/payment_card_icons/mastercard.svg";
import amex_url from "@/vendor/payment_card_icons/amex.svg";
import discover_url from "@/vendor/payment_card_icons/discover.svg";

const card_brands: { id: string; label: string; src: string }[] = [
  { id: "visa", label: "Visa", src: visa_url },
  { id: "mastercard", label: "Mastercard", src: mastercard_url },
  { id: "amex", label: "American Express", src: amex_url },
  { id: "discover", label: "Discover", src: discover_url },
];

export function CardBrandMarks({
  class_name = "",
}: {
  class_name?: string;
}): ReactElement {
  return (
    <span
      className={`flex flex-wrap items-center gap-1 sm:gap-1.5 ${class_name}`}
    >
      {card_brands.map((brand) => (
        <img
          key={brand.id}
          alt={brand.label}
          className="pointer-events-none h-5 w-auto sm:h-6 shrink-0 select-none rounded-[4px]"
          decoding="async"
          draggable={false}
          height={24}
          src={brand.src}
          width={37}
        />
      ))}
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
        className="h-[13px] w-[13px] flex-shrink-0 text-txt-tertiary"
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
          className="inline-flex h-6 w-6 shrink-0 items-center justify-center"
          role="img"
          title={coin.label}
        >
          <CoinIcon
            chain={coin.chain}
            currency={coin.currency}
            show_chain={false}
            size={24}
          />
        </span>
      ))}
    </span>
  );
}
