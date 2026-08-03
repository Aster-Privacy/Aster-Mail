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
import { useId, type ReactElement } from "react";

type MarkId =
  | "btc"
  | "eth"
  | "usdc"
  | "usdt"
  | "dai"
  | "ltc"
  | "sol"
  | "bch"
  | "xmr"
  | "stable"
  | "generic";

type ChainId =
  | "bitcoin"
  | "ethereum"
  | "base"
  | "monero"
  | "litecoin"
  | "solana"
  | "bitcoin_cash"
  | "generic";

const CURRENCY_MARKS: Record<string, MarkId> = {
  btc: "btc",
  xbt: "btc",
  eth: "eth",
  weth: "eth",
  usdc: "usdc",
  usdt: "usdt",
  tether: "usdt",
  dai: "dai",
  ltc: "ltc",
  sol: "sol",
  bch: "bch",
  xmr: "xmr",
  stable: "stable",
  stablecoin: "stable",
};

const CHAIN_MARKS: Record<string, ChainId> = {
  bitcoin: "bitcoin",
  ethereum: "ethereum",
  base: "base",
  monero: "monero",
  litecoin: "litecoin",
  solana: "solana",
  bitcoincash: "bitcoin_cash",
  "bitcoin-cash": "bitcoin_cash",
};

const NATIVE_CHAIN_OF: Record<MarkId, ChainId> = {
  btc: "bitcoin",
  eth: "ethereum",
  usdc: "generic",
  usdt: "generic",
  dai: "generic",
  ltc: "litecoin",
  sol: "solana",
  bch: "bitcoin_cash",
  xmr: "monero",
  stable: "generic",
  generic: "generic",
};

const VIEW_SIZE = 40;
const MARK_BOX = "0 0 32 32";
const COIN_SIZE = 33;
const COIN_INSET = (VIEW_SIZE - COIN_SIZE) / 2;
const BADGE_RADIUS = 8.2;
const BADGE_CENTER = VIEW_SIZE - BADGE_RADIUS - 0.4;
const BADGE_CUTOUT_RADIUS = BADGE_RADIUS + 1.6;
const BADGE_ORIGIN = BADGE_CENTER - BADGE_RADIUS;
const BADGE_SIZE = BADGE_RADIUS * 2;

function btc_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#f7931a" r="16" />
      <path
        d="M23.189 14.02c.314-2.096-1.283-3.223-3.465-3.975l.708-2.84-1.728-.43-.69 2.765c-.454-.114-.92-.22-1.385-.326l.695-2.783L15.596 6l-.708 2.839c-.376-.086-.746-.17-1.104-.26l.002-.009-2.384-.595-.46 1.846s1.283.294 1.256.312c.7.175.826.638.805 1.006l-.806 3.235c.048.012.111.03.18.057l-.183-.045-1.13 4.532c-.086.212-.303.531-.793.41.018.025-1.256-.313-1.256-.313l-.858 1.978 2.25.561c.418.105.828.215 1.231.318l-.715 2.872 1.727.43.708-2.84c.472.127.93.245 1.378.357l-.706 2.828 1.728.43.715-2.866c2.948.558 5.164.333 6.097-2.333.752-2.146-.037-3.385-1.588-4.192 1.13-.26 1.98-1.003 2.207-2.538zm-3.95 5.538c-.533 2.147-4.148.986-5.32.695l.95-3.805c1.172.293 4.929.872 4.37 3.11zm.535-5.569c-.487 1.953-3.495.96-4.47.717l.86-3.45c.975.243 4.118.696 3.61 2.733z"
        fill="#ffffff"
      />
    </g>
  );
}

function eth_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#627eea" r="16" />
      <g fill="#ffffff">
        <path d="M16.498 4v8.87l7.497 3.35z" fillOpacity=".602" />
        <path d="M16.498 4L9 16.22l7.498-3.35z" />
        <path d="M16.498 21.968v6.027L24 17.616z" fillOpacity=".602" />
        <path d="M16.498 27.995v-6.028L9 17.616z" />
        <path d="M16.498 20.573l7.497-4.353-7.497-3.348z" fillOpacity=".2" />
        <path d="M9 16.22l7.498 4.353v-7.701z" fillOpacity=".602" />
      </g>
    </g>
  );
}

function usdc_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#2775ca" r="16" />
      <g fill="#ffffff">
        <path d="M20.022 18.124c0-2.124-1.28-2.852-3.84-3.156-1.828-.243-2.193-.728-2.193-1.578 0-.85.61-1.396 1.828-1.396 1.097 0 1.707.364 2.011 1.275a.458.458 0 00.427.303h.975a.416.416 0 00.427-.425v-.06a3.04 3.04 0 00-2.743-2.489V9.142c0-.243-.183-.425-.487-.486h-.915c-.243 0-.426.182-.487.486v1.396c-1.829.243-2.986 1.456-2.986 2.974 0 2.002 1.218 2.791 3.778 3.095 1.707.303 2.255.667 2.255 1.638s-.853 1.638-2.011 1.638c-1.585 0-2.133-.667-2.316-1.578-.06-.242-.244-.364-.427-.364h-1.036a.416.416 0 00-.426.425v.06c.243 1.518 1.219 2.61 3.23 2.914v1.457c0 .242.183.425.487.485h.915c.243 0 .426-.182.487-.485V21.34c1.829-.303 3.047-1.578 3.047-3.217z" />
        <path d="M12.892 24.497c-4.754-1.7-7.192-6.98-5.424-11.653.914-2.55 2.925-4.491 5.424-5.402.244-.121.366-.303.366-.607v-.85c0-.242-.122-.424-.366-.485-.06 0-.183 0-.243.06a10.895 10.895 0 00-7.13 13.717c1.096 3.4 3.717 6.01 7.13 7.102.244.121.488 0 .548-.243.061-.06.061-.122.061-.243v-.85c0-.182-.183-.424-.366-.546zm6.46-18.937c-.244-.121-.488 0-.548.243-.061.06-.061.121-.061.243v.85c0 .242.183.485.366.606 4.754 1.7 7.192 6.98 5.424 11.653-.914 2.55-2.925 4.491-5.424 5.402-.244.121-.366.303-.366.607v.85c0 .242.122.424.366.485.06 0 .183 0 .243-.06a10.895 10.895 0 007.13-13.717c-1.096-3.46-3.778-6.07-7.13-7.162z" />
      </g>
    </g>
  );
}

function usdt_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#26a17b" r="16" />
      <path
        d="M17.94 17.5v-.002c-.11.008-.68.042-1.947.042-1.012 0-1.724-.03-1.974-.042v.003c-3.895-.172-6.802-.85-6.802-1.662 0-.81 2.907-1.489 6.802-1.663v2.649c.254.018.983.061 1.991.061 1.21 0 1.816-.05 1.93-.06v-2.65c3.887.174 6.788.852 6.788 1.663 0 .811-2.901 1.489-6.788 1.66m0-3.598V11.53h5.425V7.914H8.612v3.616h5.425v2.37c-4.408.203-7.723 1.077-7.723 2.123 0 1.046 3.315 1.919 7.723 2.123v7.596h3.92v-7.598c4.401-.203 7.709-1.076 7.709-2.121 0-1.045-3.308-1.918-7.709-2.121"
        fill="#ffffff"
      />
    </g>
  );
}

function dai_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#f5ac37" r="16" />
      <g fill="#ffffff">
        <path
          d="M9.5 8.5h7a7.5 7.5 0 010 15h-7zm3.3 3.3v8.4h3.7a4.2 4.2 0 000-8.4z"
          fillRule="evenodd"
        />
        <path d="M6.9 14.1h19v1.5h-19zM6.9 16.5h19V18h-19z" />
      </g>
    </g>
  );
}

function ltc_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#345d9d" r="16" />
      <path
        d="M10.427 19.214L9 19.768l.688-2.759 1.444-.58L13.213 8h5.129l-1.519 6.196 1.41-.571-.68 2.75-1.427.571-.848 3.483H23L22.127 24H9.252z"
        fill="#ffffff"
      />
    </g>
  );
}

function bch_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#8dc351" r="16" />
      <path
        d="M21.207 10.534c-.776-1.797-2.469-2.203-4.511-1.837l-.68-2.633-1.604.414.672 2.598c-.42.107-.851.19-1.279.301l-.665-2.572-1.602.414.678 2.632c-.347.09-2.579.665-2.579.665l.44 1.71s1.18-.32 1.169-.295c.655-.17.966.135 1.116.428l1.86 7.198c.027.187-.008.505-.412.611.023.011-1.17.3-1.17.3l.204 1.997s2.212-.567 2.58-.658l.687 2.663 1.602-.414-.688-2.677a65.55 65.55 0 001.283-.317l.684 2.664 1.604-.414-.686-2.658c2.476-.606 4.213-2.147 3.853-4.557-.226-1.51-1.947-2.788-3.298-2.953.833-.63 1.315-1.673.741-3.21zm-.294 6.484c.4 1.564-1.8 2.176-3.72 2.674l-.918-3.555c1.92-.494 4.219-1.35 4.638.881zm-2.104-5.312c.386 1.425-1.494 1.921-3.09 2.335l-.834-3.225c1.596-.414 3.463-1.02 3.924.89z"
        fill="#ffffff"
      />
    </g>
  );
}

function sol_mark(gradient_id: string): ReactElement {
  return (
    <g>
      <defs>
        <linearGradient
          gradientUnits="userSpaceOnUse"
          id={gradient_id}
          x1="26"
          x2="6"
          y1="24"
          y2="8"
        >
          <stop offset="0" stopColor="#00ffa3" />
          <stop offset="1" stopColor="#dc1fff" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" fill="#12121c" r="16" />
      <g fill={`url(#${gradient_id})`}>
        <path d="M9.2 8.4H26l-3.2 3.6H6z" />
        <path d="M6 14.2h16.8l3.2 3.6H9.2z" />
        <path d="M9.2 20H26l-3.2 3.6H6z" />
      </g>
    </g>
  );
}

function xmr_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#ff6600" r="16" />
      <path
        d="M16 4C9.373 4 4 9.373 4 16c0 1.325.215 2.599.612 3.791h3.59V10.29l7.798 7.798 7.798-7.798v9.501h3.59A11.96 11.96 0 0028 16c0-6.627-5.373-12-12-12z"
        fill="#ffffff"
      />
      <path
        d="M14.253 19.837l-3.145-3.145v5.516H6.005A12.005 12.005 0 0016 28a12.005 12.005 0 009.995-5.792h-5.103v-5.516l-3.145 3.145L16 21.584z"
        fill="#ffffff"
      />
    </g>
  );
}

function stable_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#0d9488" r="16" />
      <circle
        cx="16"
        cy="16"
        fill="none"
        r="12.6"
        stroke="#ffffff"
        strokeOpacity=".3"
        strokeWidth="1.3"
      />
      <g
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      >
        <path d="M16 6.9v18.2" />
        <path d="M19.6 11.9C19.6 10 17.9 9 16 9c-2.1 0-3.7 1.2-3.7 3.1 0 2.2 1.9 2.9 3.7 3.4 2.2.6 3.8 1.5 3.8 3.7 0 1.9-1.8 3.1-3.8 3.1s-3.7-1-3.7-2.9" />
      </g>
    </g>
  );
}

function generic_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#6b7280" r="16" />
      <path
        d="M16 8a8 8 0 100 16 8 8 0 000-16zm0 3.2a1.2 1.2 0 110 2.4 1.2 1.2 0 010-2.4zm1.4 9.6h-2.8v-5.6h2.8z"
        fill="#ffffff"
      />
    </g>
  );
}

function base_mark(): ReactElement {
  return (
    <g>
      <circle cx="16" cy="16" fill="#0052ff" r="16" />
      <path
        d="M15.98 26.5c5.79 0 10.48-4.7 10.48-10.5S21.77 5.5 15.98 5.5C10.49 5.5 5.99 9.71 5.54 15.07h13.85v1.86H5.54c.45 5.36 4.95 9.57 10.44 9.57z"
        fill="#ffffff"
      />
    </g>
  );
}

function mark_for(id: MarkId, gradient_id: string): ReactElement {
  if (id === "btc") return btc_mark();
  if (id === "eth") return eth_mark();
  if (id === "usdc") return usdc_mark();
  if (id === "usdt") return usdt_mark();
  if (id === "dai") return dai_mark();
  if (id === "ltc") return ltc_mark();
  if (id === "sol") return sol_mark(gradient_id);
  if (id === "bch") return bch_mark();
  if (id === "xmr") return xmr_mark();
  if (id === "stable") return stable_mark();

  return generic_mark();
}

function chain_mark_for(id: ChainId, gradient_id: string): ReactElement {
  if (id === "bitcoin") return btc_mark();
  if (id === "ethereum") return eth_mark();
  if (id === "base") return base_mark();
  if (id === "monero") return xmr_mark();
  if (id === "litecoin") return ltc_mark();
  if (id === "solana") return sol_mark(gradient_id);
  if (id === "bitcoin_cash") return bch_mark();

  return generic_mark();
}

function resolve_currency(currency: string): MarkId {
  return CURRENCY_MARKS[currency.trim().toLowerCase()] ?? "generic";
}

function resolve_chain(chain: string): ChainId {
  return CHAIN_MARKS[chain.trim().toLowerCase()] ?? "generic";
}

function chain_letter(chain: string): string | null {
  const first = chain.trim().charAt(0).toUpperCase();

  return /^[A-Z0-9]$/.test(first) ? first : null;
}

function letter_chain_mark(letter: string): ReactElement {
  return (
    <>
      <circle cx="16" cy="16" fill="#3d3d47" r="16" />
      <text
        dominantBaseline="central"
        fill="#ffffff"
        fontFamily="system-ui, -apple-system, sans-serif"
        fontSize="19"
        fontWeight="700"
        textAnchor="middle"
        x="16"
        y="17"
      >
        {letter}
      </text>
    </>
  );
}

interface CoinIconProps {
  currency: string;
  chain: string;
  size?: number;
  class_name?: string;
}

export function CoinIcon({
  currency,
  chain,
  size = 32,
  class_name = "",
}: CoinIconProps): ReactElement {
  const instance_id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const currency_mark = resolve_currency(currency);
  const chain_mark = resolve_chain(chain);
  const chain_key = chain.trim().toLowerCase();
  const native_chain = NATIVE_CHAIN_OF[currency_mark];
  const is_native_chain =
    native_chain !== "generic" &&
    (chain_mark === native_chain || chain_key === native_chain);
  const chain_initial = chain_letter(chain);
  const show_badge =
    !is_native_chain && (chain_mark !== "generic" || chain_initial !== null);
  const show_letter_badge = show_badge && chain_mark === "generic";
  const cutout_id = `coin_icon_cutout_${instance_id}`;

  return (
    <svg
      aria-hidden="true"
      className={`shrink-0 ${class_name}`}
      focusable="false"
      height={size}
      role="presentation"
      viewBox={`0 0 ${VIEW_SIZE} ${VIEW_SIZE}`}
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      {show_badge && (
        <defs>
          <mask
            height={VIEW_SIZE}
            id={cutout_id}
            maskUnits="userSpaceOnUse"
            width={VIEW_SIZE}
            x="0"
            y="0"
          >
            <rect
              fill="#ffffff"
              height={VIEW_SIZE}
              width={VIEW_SIZE}
              x="0"
              y="0"
            />
            <circle
              cx={BADGE_CENTER}
              cy={BADGE_CENTER}
              fill="#000000"
              r={BADGE_CUTOUT_RADIUS}
            />
          </mask>
        </defs>
      )}
      <svg
        height={COIN_SIZE}
        mask={show_badge ? `url(#${cutout_id})` : undefined}
        overflow="visible"
        viewBox={MARK_BOX}
        width={COIN_SIZE}
        x={show_badge ? 0 : COIN_INSET}
        y={show_badge ? 0 : COIN_INSET}
      >
        {mark_for(currency_mark, `coin_icon_coin_gradient_${instance_id}`)}
      </svg>
      {show_badge && (
        <svg
          height={BADGE_SIZE}
          overflow="visible"
          viewBox={MARK_BOX}
          width={BADGE_SIZE}
          x={BADGE_ORIGIN}
          y={BADGE_ORIGIN}
        >
          {show_letter_badge
            ? letter_chain_mark(chain_initial ?? "?")
            : chain_mark_for(
                chain_mark,
                `coin_icon_chain_gradient_${instance_id}`,
              )}
        </svg>
      )}
    </svg>
  );
}
