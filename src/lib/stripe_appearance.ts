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
import { useEffect, useState } from "react";

export interface StripeThemeTokens {
  font_family: string;
  font_size: string;
  text_primary: string;
  text_secondary: string;
  text_placeholder: string;
  bg_surface: string;
  border_rest: string;
  accent: string;
  danger: string;
  success: string;
  is_dark: boolean;
}

const FONT_FALLBACK = "'Google Sans Flex', system-ui, sans-serif";

function read_var(
  style: CSSStyleDeclaration,
  name: string,
  fallback: string,
): string {
  const raw = style.getPropertyValue(name).trim();

  return raw.length > 0 ? raw : fallback;
}

function detect_is_dark(): boolean {
  if (typeof document === "undefined") return false;
  const cls = document.documentElement.classList;

  if (cls.contains("dark")) return true;
  if (cls.contains("light")) return false;
  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches;
  }

  return false;
}

export function read_stripe_theme_tokens(): StripeThemeTokens {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return {
      font_family: FONT_FALLBACK,
      font_size: "15px",
      text_primary: "#111827",
      text_secondary: "#374151",
      text_placeholder: "#9ca3af",
      bg_surface: "#ffffff",
      border_rest: "#e5e7eb",
      accent: "#3b82f6",
      danger: "#ef4444",
      success: "#22c55e",
      is_dark: false,
    };
  }

  const style = getComputedStyle(document.documentElement);
  const is_dark = detect_is_dark();
  const font_sans = read_var(style, "--font-sans", "").replace(/['"]/g, "");
  const font_family =
    font_sans.length > 0
      ? `'${font_sans}', system-ui, sans-serif`
      : FONT_FALLBACK;

  return {
    font_family,
    font_size: "15px",
    text_primary: read_var(
      style,
      "--color-txt-primary",
      read_var(style, "--text-primary", is_dark ? "#ffffff" : "#111827"),
    ),
    text_secondary: read_var(
      style,
      "--color-txt-secondary",
      read_var(style, "--text-secondary", is_dark ? "#cbd5e1" : "#374151"),
    ),
    text_placeholder: read_var(
      style,
      "--color-txt-muted",
      read_var(
        style,
        "--color-txt-tertiary",
        read_var(style, "--text-tertiary", is_dark ? "#888888" : "#9ca3af"),
      ),
    ),
    bg_surface: read_var(
      style,
      "--color-surf-tertiary",
      read_var(style, "--bg-tertiary", is_dark ? "#121212" : "#f3f4f6"),
    ),
    border_rest: read_var(
      style,
      "--color-edge-secondary",
      read_var(style, "--border-secondary", is_dark ? "#2a2a2a" : "#e5e7eb"),
    ),
    accent: read_var(style, "--color-accent", "#3b82f6"),
    danger: read_var(style, "--color-danger", "#ef4444"),
    success: read_var(style, "--color-success", "#22c55e"),
    is_dark,
  };
}

export function build_stripe_element_style(tokens: StripeThemeTokens) {
  return {
    base: {
      color: tokens.text_primary,
      fontFamily: tokens.font_family,
      fontSize: tokens.font_size,
      fontWeight: "400",
      fontSmoothing: "antialiased",
      iconColor: tokens.text_placeholder,
      "::placeholder": { color: tokens.text_placeholder },
      ":-webkit-autofill": { color: tokens.text_primary },
    },
    invalid: {
      color: tokens.danger,
      iconColor: tokens.danger,
    },
    complete: {
      iconColor: tokens.success,
    },
  };
}

export function build_stripe_appearance(tokens: StripeThemeTokens) {
  return {
    theme: (tokens.is_dark ? "night" : "stripe") as "night" | "stripe",
    variables: {
      colorPrimary: tokens.accent,
      colorBackground: tokens.bg_surface,
      colorText: tokens.text_primary,
      colorTextSecondary: tokens.text_secondary,
      colorTextPlaceholder: tokens.text_placeholder,
      colorDanger: tokens.danger,
      colorIcon: tokens.text_placeholder,
      borderRadius: "12px",
      fontFamily: tokens.font_family,
      fontSizeBase: tokens.font_size,
      spacingUnit: "4px",
    },
    rules: {
      ".Input": {
        border: `1px solid ${tokens.border_rest}`,
        backgroundColor: tokens.bg_surface,
        color: tokens.text_primary,
        boxShadow: "none",
      },
      ".Input::placeholder": {
        color: tokens.text_placeholder,
      },
      ".Input:focus": {
        border: `1px solid ${tokens.accent}`,
        boxShadow: `0 0 0 2px ${tokens.accent}33`,
      },
      ".Input--invalid": {
        border: `1px solid ${tokens.danger}`,
        color: tokens.danger,
      },
      ".Label": {
        color: tokens.text_secondary,
        fontSize: "13px",
      },
    },
  };
}

export function use_stripe_theme_tokens(): StripeThemeTokens {
  const [tokens, set_tokens] = useState<StripeThemeTokens>(() =>
    read_stripe_theme_tokens(),
  );

  useEffect(() => {
    if (typeof document === "undefined") return;

    const refresh = () => set_tokens(read_stripe_theme_tokens());

    const observer = new MutationObserver(refresh);

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "data-theme", "style"],
    });

    const media =
      typeof window !== "undefined" && window.matchMedia
        ? window.matchMedia("(prefers-color-scheme: dark)")
        : null;

    media?.addEventListener?.("change", refresh);
    window.addEventListener("themechange", refresh);

    return () => {
      observer.disconnect();
      media?.removeEventListener?.("change", refresh);
      window.removeEventListener("themechange", refresh);
    };
  }, []);

  return tokens;
}
