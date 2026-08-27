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
import { useEffect, useId, useRef, useState } from "react";
import QRCodeStyling from "qr-code-styling";

import { use_i18n } from "@/lib/i18n/context";

interface RoundedQrCodeProps {
  value: string;
  size?: number;
  logo_src?: string;
  aria_label?: string;
  quiet_zone?: number;
}

const QR_MODULE_COLOR = "#0f172a";
const QR_SURFACE_COLOR = "#ffffff";
const QR_QUIET_ZONE = 6;
const QR_LOGO_TIMEOUT_MS = 4000;
const QR_FRAME_GAP_CAP_MS = 200;

function build_qr_options(
  value: string,
  size: number,
  quiet_zone: number,
  logo_src?: string,
) {
  return {
    width: size,
    height: size,
    type: "svg" as const,
    data: value,
    image: logo_src ?? "",
    margin: quiet_zone,
    qrOptions: {
      errorCorrectionLevel: "H" as const,
    },
    imageOptions: {
      crossOrigin: "anonymous",
      margin: 1,
      imageSize: 0.52,
      hideBackgroundDots: true,
    },
    dotsOptions: {
      type: "dots" as const,
      color: QR_MODULE_COLOR,
    },
    cornersSquareOptions: {
      type: "extra-rounded" as const,
      color: QR_MODULE_COLOR,
    },
    cornersDotOptions: {
      type: "dot" as const,
      color: QR_MODULE_COLOR,
    },
    backgroundOptions: {
      color: QR_SURFACE_COLOR,
    },
  };
}

function has_drawn_content(container: HTMLDivElement | null): boolean {
  const svg = container?.querySelector("svg");

  if (!svg) return false;

  return Array.from(svg.children).some(
    (child) => child.tagName.toLowerCase() !== "defs",
  );
}

function round_logo_corners(
  container: HTMLDivElement | null,
  clip_id: string,
): boolean {
  const svg = container?.querySelector("svg");
  const image = svg?.querySelector("image");

  if (!svg || !image) return false;

  const x = image.getAttribute("x") ?? "0";
  const y = image.getAttribute("y") ?? "0";
  const width = parseFloat(image.getAttribute("width") ?? "0");
  const height = parseFloat(image.getAttribute("height") ?? "0");

  if (!(width > 0) || !(height > 0)) return false;

  const radius = Math.min(width, height) * 0.28;

  let defs = svg.querySelector("defs");

  if (!defs) {
    defs = document.createElementNS("http://www.w3.org/2000/svg", "defs");
    svg.insertBefore(defs, svg.firstChild);
  }

  let clip_path = defs.querySelector(`#${clip_id}`);

  if (!clip_path) {
    clip_path = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "clipPath",
    );
    clip_path.setAttribute("id", clip_id);
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

  image.setAttribute("clip-path", `url(#${clip_id})`);

  return true;
}

export function RoundedQrCode({
  value,
  size = 240,
  logo_src,
  aria_label,
  quiet_zone = QR_QUIET_ZONE,
}: RoundedQrCodeProps) {
  const { t } = use_i18n();
  const container_ref = useRef<HTMLDivElement>(null);
  const qr_ref = useRef<QRCodeStyling | null>(null);
  const [is_ready, set_is_ready] = useState(false);
  const instance_id = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const clip_id = `rounded_qr_logo_clip_${instance_id}`;

  useEffect(() => {
    const container = container_ref.current;

    if (!container) return;

    set_is_ready(false);

    if (!qr_ref.current) {
      qr_ref.current = new QRCodeStyling(
        build_qr_options(value, size, quiet_zone, logo_src),
      );
      qr_ref.current.append(container);
    } else {
      qr_ref.current.update(
        build_qr_options(value, size, quiet_zone, logo_src),
      );
    }

    let observer: MutationObserver | null = null;
    let frame = 0;
    let visible_ms = 0;
    let last_timestamp = 0;
    let is_stopped = false;
    let is_logo_dropped = false;

    const stop_watching = () => {
      is_stopped = true;

      if (observer) {
        observer.disconnect();
        observer = null;
      }

      if (frame) {
        cancelAnimationFrame(frame);
        frame = 0;
      }
    };

    const settle = (): boolean => {
      if (!has_drawn_content(container)) return false;

      set_is_ready(true);

      if (!logo_src || is_logo_dropped) return true;

      return round_logo_corners(container, clip_id);
    };

    if (settle()) return;

    observer = new MutationObserver(() => {
      if (is_stopped) return;
      if (settle()) stop_watching();
    });

    observer.observe(container, { childList: true, subtree: true });

    const poll = (timestamp: number) => {
      frame = 0;

      if (is_stopped) return;

      if (last_timestamp > 0) {
        visible_ms += Math.min(timestamp - last_timestamp, QR_FRAME_GAP_CAP_MS);
      }

      last_timestamp = timestamp;

      if (settle()) {
        stop_watching();

        return;
      }

      if (visible_ms >= QR_LOGO_TIMEOUT_MS) {
        if (!logo_src || is_logo_dropped) return;

        is_logo_dropped = true;
        visible_ms = 0;
        qr_ref.current?.update(build_qr_options(value, size, quiet_zone));
      }

      frame = requestAnimationFrame(poll);
    };

    frame = requestAnimationFrame(poll);

    return stop_watching;
  }, [value, logo_src, size, quiet_zone, clip_id]);

  return (
    <div
      aria-label={aria_label ?? t("common.qr_code")}
      className="relative rounded-2xl overflow-hidden"
      role="img"
      style={{ width: size, height: size, backgroundColor: QR_SURFACE_COLOR }}
    >
      {!is_ready && (
        <div className="absolute inset-0 rounded-2xl bg-surf-tertiary animate-pulse" />
      )}
      <div
        ref={container_ref}
        className="[&>svg]:block"
        style={{ width: size, height: size }}
      />
    </div>
  );
}
