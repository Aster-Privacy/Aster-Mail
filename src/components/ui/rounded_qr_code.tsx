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
import { useEffect, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";
import { useTheme } from "@/contexts/theme_context";

interface RoundedQrCodeProps {
  value: string;
  size?: number;
  logo_src?: string;
}

const LOGO_CLIP_PATH_ID = "rounded-qr-logo-clip";

function round_logo_corners(container: HTMLDivElement | null) {
  if (!container) return;

  const svg = container.querySelector("svg");
  const image = svg?.querySelector("image");

  if (!svg || !image) return;

  const x = image.getAttribute("x") ?? "0";
  const y = image.getAttribute("y") ?? "0";
  const width = parseFloat(image.getAttribute("width") ?? "0");
  const height = parseFloat(image.getAttribute("height") ?? "0");
  const radius = Math.min(width, height) * 0.28;

  let defs = svg.querySelector("defs");

  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.insertBefore(defs, svg.firstChild);
  }

  let clip_path = defs.querySelector(`#${LOGO_CLIP_PATH_ID}`);

  if (!clip_path) {
    clip_path = document.createElementNS("http://www.w3.org/2000/svg", "clipPath");
    clip_path.setAttribute("id", LOGO_CLIP_PATH_ID);
    defs.appendChild(clip_path);
  }

  clip_path.innerHTML = "";

  const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");

  rect.setAttribute("x", x);
  rect.setAttribute("y", y);
  rect.setAttribute("width", String(width));
  rect.setAttribute("height", String(height));
  rect.setAttribute("rx", String(radius));
  rect.setAttribute("ry", String(radius));
  clip_path.appendChild(rect);

  image.setAttribute("clip-path", `url(#${LOGO_CLIP_PATH_ID})`);
}

export function RoundedQrCode({ value, size = 240, logo_src }: RoundedQrCodeProps) {
  const { theme } = useTheme();
  const container_ref = useRef<HTMLDivElement>(null);
  const qr_ref = useRef<QRCodeStyling | null>(null);
  const [is_ready, set_is_ready] = useState(false);
  const dot_color = theme === "dark" ? "#ffffff" : "#0f172a";

  useEffect(() => {
    if (!qr_ref.current) {
      qr_ref.current = new QRCodeStyling({
        width: size,
        height: size,
        type: "svg",
        data: value,
        image: logo_src,
        margin: 0,
        qrOptions: {
          errorCorrectionLevel: "H",
        },
        imageOptions: {
          crossOrigin: "anonymous",
          margin: 1,
          imageSize: 0.52,
          hideBackgroundDots: true,
        },
        dotsOptions: {
          type: "dots",
          color: dot_color,
        },
        cornersSquareOptions: {
          type: "extra-rounded",
          color: dot_color,
        },
        cornersDotOptions: {
          type: "dot",
          color: dot_color,
        },
        backgroundOptions: {
          color: "transparent",
        },
      });

      if (container_ref.current) {
        qr_ref.current.append(container_ref.current);
      }
      round_logo_corners(container_ref.current);
      set_is_ready(true);
    } else {
      qr_ref.current.update({
        data: value,
        image: logo_src,
        dotsOptions: { type: "dots", color: dot_color },
        cornersSquareOptions: { type: "extra-rounded", color: dot_color },
        cornersDotOptions: { type: "dot", color: dot_color },
      });
      round_logo_corners(container_ref.current);
    }
  }, [value, logo_src, size, dot_color]);

  return (
    <div
      className="relative rounded-3xl overflow-hidden"
      style={{ width: size, height: size }}
    >
      {!is_ready && (
        <div className="absolute inset-0 rounded-3xl bg-surf-tertiary animate-pulse" />
      )}
      <div
        ref={container_ref}
        className="[&>svg]:block"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
