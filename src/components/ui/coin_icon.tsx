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
const BADGE_CUTOUT_RADIUS = VIEW_SIZE / 4;
const BADGE_CENTER = VIEW_SIZE - BADGE_CUTOUT_RADIUS;
const BADGE_RING = 1.8;
const BADGE_RADIUS = BADGE_CUTOUT_RADIUS - BADGE_RING;
const BADGE_ORIGIN = BADGE_CENTER - BADGE_RADIUS;
const BADGE_SIZE = BADGE_RADIUS * 2;

function btc_mark(): ReactElement {
  return (
    <g>
      <path
        d="M31.519 19.871C29.382 28.442 20.701 33.658 12.128 31.521 3.56 29.384-1.657 20.702 0.481 12.131 2.617 3.559 11.298-1.658 19.868 0.479 28.44 2.616 33.656 11.299 31.519 19.871Z"
        fill="#f7931a"
      />
      <path
        d="M23.054 13.721C23.373 11.592 21.752 10.447 19.535 9.684L20.254 6.8 18.499 6.362 17.799 9.17C17.337 9.055 16.863 8.947 16.392 8.839L17.097 6.013 15.343 5.575 14.623 8.458C14.241 8.371 13.866 8.285 13.502 8.195L13.504 8.186 11.083 7.581 10.616 9.456S11.919 9.755 11.891 9.773C12.602 9.951 12.731 10.421 12.709 10.794L11.89 14.08C11.939 14.092 12.003 14.11 12.073 14.138 12.014 14.124 11.952 14.108 11.887 14.092L10.739 18.695C10.652 18.911 10.432 19.235 9.935 19.112 9.952 19.137 8.659 18.793 8.659 18.793L7.788 20.803 10.072 21.372C10.497 21.479 10.913 21.59 11.323 21.695L10.597 24.612 12.35 25.05 13.07 22.164C13.549 22.294 14.014 22.414 14.469 22.527L13.752 25.399 15.507 25.837 16.234 22.925C19.227 23.492 21.478 23.263 22.426 20.556 23.189 18.376 22.388 17.118 20.813 16.298 21.96 16.034 22.824 15.279 23.054 13.721ZM19.043 19.345C18.501 21.525 14.83 20.347 13.64 20.051L14.604 16.187C15.794 16.484 19.61 17.072 19.043 19.345ZM19.586 13.689C19.091 15.672 16.036 14.665 15.045 14.418L15.919 10.913C16.91 11.16 20.102 11.621 19.586 13.689Z"
        fill="#ffffff"
      />
    </g>
  );
}

function eth_mark(): ReactElement {
  return (
    <g>
      <path d="M0 16A16 16 0 1 0 32 16 16 16 0 1 0 0 16Z" fill="#627eea" />
      <path
        d="M16.498 4V12.87L23.995 16.22Z"
        fill="#ffffff"
        fillOpacity="0.602"
      />
      <path d="M16.498 4L9 16.22 16.498 12.87Z" fill="#ffffff" />
      <path
        d="M16.498 21.968V27.995L24 17.616Z"
        fill="#ffffff"
        fillOpacity="0.602"
      />
      <path d="M16.498 27.995V21.967L9 17.616Z" fill="#ffffff" />
      <path
        d="M16.498 20.573L23.995 16.22 16.498 12.872Z"
        fill="#ffffff"
        fillOpacity="0.2"
      />
      <path
        d="M9 16.22L16.498 20.573V12.872Z"
        fill="#ffffff"
        fillOpacity="0.602"
      />
    </g>
  );
}

function usdc_mark(): ReactElement {
  return (
    <g>
      <path
        d="M16 32C24.837 32 32 24.837 32 16 32 7.163 24.837 0 16 0 7.163 0 0 7.163 0 16 0 24.837 7.163 32 16 32Z"
        fill="#0b53bf"
      />
      <path
        d="M18.88 4.35V6.41C22.99 7.65 26 11.47 26 16 26 20.53 22.99 24.35 18.88 25.59V27.65C24.12 26.37 28 21.64 28 16 28 10.36 24.12 5.63 18.88 4.35Z"
        fill="#ffffff"
      />
      <path
        d="M6 16C6 11.47 9.01 7.65 13.12 6.41V4.35C7.88 5.63 4 10.36 4 16 4 21.64 7.88 26.37 13.12 27.65V25.59C9.01 24.36 6 20.53 6 16Z"
        fill="#ffffff"
      />
      <path
        d="M20.3 18.23C20.3 14.14 13.89 15.82 13.89 13.56 13.89 12.75 14.54 12.23 15.78 12.23 17.26 12.23 17.77 12.95 17.93 13.92H19.97C19.788 12.1 18.743 10.95 17 10.608V9H15V10.55C13.091 10.794 11.89 11.906 11.89 13.56 11.89 17.67 18.31 16.13 18.31 18.35 18.31 19.19 17.5 19.75 16.13 19.75 14.34 19.75 13.75 18.96 13.53 17.87H11.54C11.669 19.864 12.899 21.112 15 21.423V23H17V21.444C19.051 21.179 20.3 19.986 20.3 18.23Z"
        fill="#ffffff"
      />
    </g>
  );
}

function usdt_mark(): ReactElement {
  return (
    <g>
      <path d="M0 16A16 16 0 1 0 32 16 16 16 0 1 0 0 16Z" fill="#009393" />
      <path
        d="M16.02 17.144C18.771 17.144 21.071 16.678 21.633 16.057 21.156 15.53 19.43 15.114 17.238 15.001V16.314C16.845 16.334 16.437 16.344 16.019 16.344S15.193 16.334 14.8 16.314V15.001C12.609 15.114 10.882 15.53 10.405 16.057 10.968 16.678 13.268 17.144 16.019 17.144ZM20.908 10.962V12.771H17.238V14.025C19.816 14.159 21.751 14.71 21.765 15.37V16.745C21.751 17.404 19.816 17.954 17.238 18.089V21.166H14.8V18.089C12.222 17.955 10.288 17.404 10.274 16.745V15.37C10.288 14.71 12.222 14.159 14.8 14.025V12.771H11.13V10.962H20.909ZM9.686 8.084H22.572C22.88 8.084 23.164 8.246 23.318 8.51L27.072 14.956C27.266 15.29 27.208 15.712 26.931 15.983L16.597 26.07C16.262 26.397 15.724 26.397 15.389 26.07L5.068 15.997C4.785 15.719 4.731 15.285 4.94 14.949L8.954 8.49C9.11 8.238 9.388 8.085 9.686 8.085Z"
        fill="#ffffff"
        fillRule="evenodd"
      />
    </g>
  );
}

function dai_mark(): ReactElement {
  return (
    <g>
      <path
        d="M16 0C24.837 0 32 7.164 32 16 32 24.837 24.837 32 16 32 7.164 32 0 24.837 0 16 0 7.164 7.164 0 16 0Z"
        fill="#f5ac37"
      />
      <path
        d="M16.59 17.13L22.669 17.13C22.799 17.13 22.86 17.13 22.87 16.96 22.919 16.341 22.919 15.719 22.87 15.1 22.87 14.98 22.81 14.93 22.68 14.93L10.58 14.93C10.43 14.93 10.39 14.98 10.39 15.12L10.39 16.9C10.39 17.13 10.39 17.13 10.629 17.13L16.59 17.13ZM22.191 12.85C22.208 12.805 22.208 12.755 22.191 12.71 22.089 12.489 21.969 12.278 21.829 12.08 21.619 11.742 21.371 11.43 21.089 11.15 20.956 10.981 20.802 10.829 20.629 10.7 19.763 9.963 18.735 9.442 17.629 9.18 17.071 9.055 16.5 8.995 15.929 9L10.559 9C10.409 9 10.389 9.06 10.389 9.19L10.389 12.74C10.389 12.89 10.389 12.93 10.579 12.93L22.119 12.93C22.119 12.93 22.219 12.91 22.239 12.85L22.19 12.85ZM22.191 19.21C22.021 19.191 21.849 19.191 21.679 19.21L10.59 19.21C10.44 19.21 10.39 19.21 10.39 19.41L10.39 22.88C10.39 23.04 10.39 23.081 10.59 23.081L15.71 23.081C15.955 23.099 16.199 23.082 16.439 23.031 17.182 22.978 17.913 22.816 18.61 22.551 18.863 22.463 19.108 22.348 19.339 22.211L19.409 22.211C20.609 21.587 21.584 20.606 22.199 19.402 22.199 19.402 22.269 19.251 22.191 19.211ZM8.38 24.88L8.38 24.82 8.38 22.49 8.38 21.7 8.38 19.35C8.38 19.22 8.38 19.2 8.22 19.2L6.05 19.2C5.93 19.2 5.88 19.2 5.88 19.041L5.88 17.14 8.2 17.14C8.33 17.14 8.38 17.14 8.38 16.971L8.38 15.091C8.38 14.97 8.38 14.941 8.22 14.941L6.05 14.941C5.93 14.941 5.88 14.941 5.88 14.781L5.88 13.021C5.88 12.911 5.88 12.882 6.04 12.882L8.19 12.882C8.34 12.882 8.38 12.882 8.38 12.692L8.38 7.302C8.38 7.142 8.38 7.101 8.58 7.101L16.08 7.101C16.624 7.123 17.165 7.183 17.7 7.281 18.802 7.485 19.861 7.879 20.83 8.441 21.472 8.819 22.063 9.276 22.59 9.801 22.986 10.213 23.343 10.658 23.659 11.131 23.974 11.612 24.235 12.125 24.441 12.661 24.466 12.801 24.6 12.895 24.739 12.872L26.529 12.872C26.759 12.872 26.759 12.872 26.769 13.092L26.769 14.732C26.769 14.892 26.709 14.932 26.549 14.932L25.169 14.932C25.029 14.932 24.989 14.932 24.999 15.112 25.053 15.721 25.053 16.333 24.999 16.942 24.999 17.112 24.999 17.132 25.189 17.132L26.768 17.132C26.838 17.222 26.768 17.312 26.768 17.403 26.779 17.518 26.779 17.636 26.768 17.752L26.768 18.962C26.768 19.132 26.719 19.182 26.568 19.182L24.678 19.182C24.546 19.157 24.418 19.241 24.388 19.373 23.938 20.543 23.218 21.592 22.288 22.433 21.948 22.739 21.591 23.027 21.218 23.292 20.818 23.523 20.428 23.762 20.018 23.952 19.262 24.292 18.47 24.543 17.657 24.702 16.886 24.84 16.103 24.903 15.317 24.892L8.377 24.892 8.377 24.882Z"
        fill="#fefefd"
      />
    </g>
  );
}

function ltc_mark(): ReactElement {
  return (
    <g>
      <path
        d="M1.732 16A14.268 14.268 0 1 0 30.268 16 14.268 14.268 0 1 0 1.732 16Z"
        fill="#ffffff"
      />
      <path
        d="M16 0A16 16 0 1 0 32 16H32A15.954 15.954 0 0 0 16.093 0ZM16.271 16.542L14.605 22.16H23.516A0.449 0.449 0 0 1 23.981 22.594V22.741L23.206 25.414A0.577 0.577 0 0 1 22.625 25.84H8.988L11.274 18.053 8.717 18.828 9.298 17.046 11.855 16.271 15.07 5.346A0.585 0.585 0 0 1 15.651 4.92H19.099A0.449 0.449 0 0 1 19.564 5.354V5.501L16.852 14.722 19.409 13.947 18.867 15.806Z"
        fill="#345d9d"
      />
    </g>
  );
}

function bch_mark(): ReactElement {
  return (
    <g>
      <path d="M0 16A16 16 0 1 0 32 16 16 16 0 1 0 0 16Z" fill="#0ac18e" />
      <path
        d="M20.991 10.627C20.187 8.804 18.339 8.414 16.077 8.792L15.35 5.974 13.637 6.416 14.351 9.226C13.901 9.34 13.438 9.438 12.979 9.568L12.264 6.774 10.55 7.216 11.277 10.035C10.908 10.14 7.817 10.932 7.817 10.932L8.288 12.768C8.288 12.768 9.547 12.414 9.535 12.443 10.234 12.26 10.562 12.609 10.717 12.938L12.715 20.662C12.739 20.885 12.698 21.267 12.219 21.397 12.248 21.413 10.973 21.718 10.973 21.718L11.159 23.858C11.159 23.858 14.221 23.074 14.623 22.973L15.358 25.823 17.072 25.381 16.337 22.51C16.808 22.4 17.267 22.286 17.714 22.169L18.445 25.023 20.158 24.581 19.423 21.734C22.063 21.092 23.927 19.427 23.545 16.881 23.302 15.346 21.624 14.087 20.231 13.945 21.088 13.186 21.523 12.077 20.991 10.627L20.991 10.627ZM20.166 17.348C20.508 19.87 17.003 20.179 15.846 20.483L14.839 16.711C16 16.406 19.59 15.127 20.166 17.348ZM18.055 12.211C18.416 14.453 15.419 14.713 14.453 14.96L13.535 11.537C14.506 11.297 17.32 10.136 18.055 12.211Z"
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
          x1="8.353"
          x2="23.013"
          y1="24.398"
          y2="7.435"
        >
          <stop offset="0.08" stopColor="#9945ff" />
          <stop offset="0.3" stopColor="#8752f3" />
          <stop offset="0.5" stopColor="#5497d5" />
          <stop offset="0.6" stopColor="#43b4ca" />
          <stop offset="0.72" stopColor="#28e0b9" />
          <stop offset="0.97" stopColor="#19fb9b" />
        </linearGradient>
      </defs>
      <path d="M0 16A16 16 0 1 0 32 16 16 16 0 1 0 0 16Z" fill="#000000" />
      <path
        d="M25.105 20.624L22.068 23.798C22.002 23.866 21.922 23.921 21.833 23.959 21.744 23.997 21.649 24.016 21.552 24.016H7.153C7.084 24.016 7.017 23.996 6.959 23.96 6.902 23.923 6.857 23.871 6.829 23.809 6.802 23.748 6.793 23.68 6.805 23.614 6.817 23.548 6.848 23.487 6.895 23.438L9.935 20.264C10 20.196 10.08 20.141 10.169 20.103 10.257 20.066 10.353 20.046 10.449 20.046H24.847C24.916 20.046 24.983 20.066 25.041 20.102 25.098 20.139 25.143 20.191 25.171 20.253 25.198 20.314 25.207 20.382 25.195 20.448 25.183 20.514 25.152 20.575 25.105 20.624ZM22.068 14.233C22.002 14.165 21.922 14.11 21.833 14.072 21.744 14.034 21.649 14.015 21.552 14.015H7.153C7.084 14.015 7.017 14.035 6.959 14.071 6.902 14.108 6.857 14.16 6.829 14.222 6.802 14.283 6.793 14.351 6.805 14.417 6.817 14.483 6.848 14.544 6.895 14.593L9.935 17.767C10 17.835 10.08 17.89 10.169 17.928 10.257 17.965 10.353 17.985 10.449 17.985H24.847C24.916 17.985 24.983 17.965 25.041 17.929 25.098 17.892 25.143 17.84 25.171 17.778 25.198 17.717 25.207 17.649 25.195 17.583 25.183 17.517 25.152 17.456 25.105 17.407L22.068 14.233ZM7.153 11.954H21.552C21.649 11.954 21.744 11.935 21.833 11.897 21.922 11.859 22.002 11.805 22.068 11.736L25.105 8.562C25.152 8.513 25.183 8.452 25.195 8.386 25.207 8.32 25.198 8.252 25.171 8.191 25.143 8.129 25.098 8.077 25.041 8.04 24.983 8.004 24.916 7.984 24.847 7.984L10.449 7.984C10.353 7.984 10.257 8.004 10.169 8.041 10.08 8.079 10 8.134 9.935 8.202L6.896 11.376C6.849 11.425 6.818 11.486 6.806 11.552 6.794 11.618 6.803 11.686 6.83 11.747 6.857 11.808 6.902 11.861 6.96 11.897 7.017 11.934 7.084 11.954 7.153 11.954Z"
        fill={`url(#${gradient_id})`}
      />
    </g>
  );
}

function xmr_mark(): ReactElement {
  return (
    <g>
      <path
        d="M32 16C32 24.836 24.837 32 16 32S0 24.836 0 16 7.163 0 16 0 32 7.163 32 16Z"
        fill="#ffffff"
      />
      <path
        d="M16 0C7.166 0-0.009 7.174 0.002 15.999 0.004 17.765 0.286 19.464 0.814 21.053H5.601V7.593L16 17.992 26.398 7.593V21.053H31.186C31.716 19.464 31.996 17.766 31.999 16 32.014 7.165 24.835 0.002 16 0.002Z"
        fill="#f26822"
      />
      <path
        d="M13.609 20.382L9.07 15.844V24.313H5.601L2.327 24.314C5.135 28.921 10.21 32.003 16 32.003S26.865 28.921 29.674 24.313H22.929V15.844L18.39 20.382 15.999 22.773 13.609 20.382H13.609Z"
        fill="#4d4d4d"
      />
    </g>
  );
}

function stable_mark(): ReactElement {
  return (
    <g>
      <path d="M0 16A16 16 0 1 0 32 16 16 16 0 1 0 0 16Z" fill="#0d9488" />
      <path
        d="M3.4 16A12.6 12.6 0 1 0 28.6 16 12.6 12.6 0 1 0 3.4 16Z"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeOpacity="0.3"
        strokeWidth="1.3"
      />
      <path
        d="M16 6.9V25.1"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <path
        d="M19.6 11.9C19.6 10 17.9 9 16 9 13.9 9 12.3 10.2 12.3 12.1 12.3 14.3 14.2 15 16 15.5 18.2 16.1 19.8 17 19.8 19.2 19.8 21.1 18 22.3 16 22.3S12.3 21.3 12.3 19.4"
        fill="none"
        stroke="#ffffff"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </g>
  );
}

function generic_mark(): ReactElement {
  return (
    <g>
      <path d="M0 16A16 16 0 1 0 32 16 16 16 0 1 0 0 16Z" fill="#6b7280" />
      <path
        d="M16 8A8 8 0 1 0 16 24 8 8 0 1 0 16 8ZM16 11.2A1.2 1.2 0 1 1 16 13.6 1.2 1.2 0 1 1 16 11.2ZM17.4 20.8H14.6V15.2H17.4Z"
        fill="#ffffff"
        fillRule="evenodd"
      />
    </g>
  );
}

function base_mark(): ReactElement {
  return (
    <g>
      <path
        d="M5 6.738C5 6.143 5 5.845 5.112 5.616 5.22 5.397 5.397 5.219 5.616 5.112 5.845 5 6.143 5 6.738 5H25.262C25.857 5 26.155 5 26.384 5.112 26.603 5.22 26.78 5.397 26.888 5.616 27 5.845 27 6.143 27 6.738V25.262C27 25.857 27 26.155 26.888 26.384 26.78 26.603 26.603 26.781 26.384 26.888 26.155 27 25.857 27 25.262 27H6.738C6.143 27 5.845 27 5.616 26.888 5.397 26.781 5.219 26.603 5.112 26.384 5 26.155 5 25.857 5 25.262V6.738Z"
        fill="#0000ff"
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
  const trimmed = chain.trim();

  if (trimmed.toLowerCase() === "generic") return null;

  const first = trimmed.charAt(0).toUpperCase();

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
        height={VIEW_SIZE}
        mask={show_badge ? `url(#${cutout_id})` : undefined}
        overflow="visible"
        viewBox={MARK_BOX}
        width={VIEW_SIZE}
        x="0"
        y="0"
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
