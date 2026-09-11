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
import { SiAmericanexpress, SiVisa } from "react-icons/si";

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
      <SiVisa aria-hidden="true" color="#1a1f71" size={30} />
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
        className="h-[16px] w-[24px]"
        focusable="false"
        viewBox="0 0 32 21.16"
      >
        <circle cx="10.58" cy="10.58" fill="#eb001b" r="10.58" />
        <circle cx="21.42" cy="10.58" fill="#f79e1b" r="10.58" />
        <path
          d="M16,1.494 A10.58,10.58 0 0 1 16,19.666 A10.58,10.58 0 0 1 16,1.494 Z"
          fill="#ff5f00"
        />
      </svg>
    </BrandTile>
  );
}

function AmexMark(): ReactElement {
  return (
    <BrandTile background="#016fd0" title="American Express">
      <span className="flex h-[22px] w-[22px] items-center justify-center overflow-hidden bg-white">
        <SiAmericanexpress aria-hidden="true" color="#016fd0" size={22} />
      </span>
    </BrandTile>
  );
}

function DiscoverMark(): ReactElement {
  return (
    <BrandTile background="#ffffff" border="rgba(0,0,0,0.12)" title="Discover">
      <svg
        aria-hidden="true"
        className="h-[30px] w-[30px]"
        focusable="false"
        viewBox="0 0 24 24"
      >
        <path d="M14.58,12 a2.023,2.023 0 1 1 -4.046,0 a2.023,2.023 0 1 1 4.046,0 Z" fill="#ff6000" />
        <path d="M9.38,9.999c-1.124 0-2.025.884-2.025 1.99 0 1.118.878 1.984 2.007 1.984.319 0 .593-.063.93-.221v-.873c-.296.297-.559.416-.895.416-.747 0-1.277-.542-1.277-1.312 0-.73.547-1.306 1.243-1.306.354 0 .622.126.93.428v-.873a1.898 1.898 0 0 0-.913-.233zm-3.352 1.545c-.445-.165-.576-.273-.576-.479 0-.239.233-.422.553-.422.222 0 .405.091.598.308l.388-.508a1.665 1.665 0 0 0-1.117-.422c-.673 0-1.186.467-1.186 1.089 0 .524.239.792.936 1.043.291.103.438.171.513.217a.456.456 0 0 1 .222.394c0 .308-.245.536-.576.536-.354 0-.639-.177-.809-.507l-.479.461c.342.502.752.724 1.317.724.771 0 1.311-.513 1.311-1.249-.002-.603-.252-.876-1.095-1.185zM24 10.3a.29.29 0 0 1-.288.291.29.29 0 0 1-.291-.291v-.003A.29.29 0 1 1 24 10.3zm-.059.001a.235.235 0 0 0-.231-.239.234.234 0 0 0-.232.239c0 .132.104.239.232.239a.235.235 0 0 0 .231-.239zM3.472 13.887h.742v-3.803h-.742v3.803zm12.702-1.248l-1.014-2.554h-.81l1.614 3.9h.399l1.643-3.9h-.804l-1.028 2.554zm2.166 1.248h2.104v-.644h-1.362v-1.027h1.312v-.644h-1.312v-.844h1.362v-.644H18.34v3.803zm5.409-3.557l.11.138h-.097l-.094-.13v.13h-.08v-.334h.107c.081 0 .126.036.126.103.001.046-.025.08-.072.093zm-.006-.092c0-.029-.021-.043-.06-.043h-.014v.087h.014c.039 0 .06-.014.06-.044zm-1.228 2.047l1.197 1.602H22.8l-1.027-1.528h-.097v1.528h-.741v-3.803h1.1c.855 0 1.346.411 1.346 1.123 0 .583-.308.965-.866 1.078zm.103-1.038c0-.37-.251-.563-.713-.563h-.228v1.152h.217c.473-.001.724-.207.724-.589zm-19.487.742a1.91 1.91 0 0 1-.69 1.46c-.365.303-.781.439-1.357.439H.001v-3.803H1.09c1.202 0 2.041.781 2.041 1.904zm-.764-.006c0-.364-.154-.718-.411-.947-.245-.222-.536-.308-1.015-.308H.742v2.515h.199c.479 0 .782-.092 1.015-.302.256-.228.411-.593.411-.958z" fill="#231f20" />
      </svg>
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
