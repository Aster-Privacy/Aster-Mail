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
import { useEffect, useRef } from "react";
import QRCodeStyling from "qr-code-styling";

interface RoundedQrCodeProps {
  value: string;
  size?: number;
  logo_src?: string;
}

export function RoundedQrCode({ value, size = 148, logo_src }: RoundedQrCodeProps) {
  const container_ref = useRef<HTMLDivElement>(null);
  const qr_ref = useRef<QRCodeStyling | null>(null);

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
          margin: 6,
          imageSize: 0.32,
          hideBackgroundDots: true,
        },
        dotsOptions: {
          type: "rounded",
          color: "#ffffff",
        },
        cornersSquareOptions: {
          type: "extra-rounded",
          color: "#ffffff",
        },
        cornersDotOptions: {
          type: "dot",
          color: "#ffffff",
        },
        backgroundOptions: {
          color: "#0f172a",
        },
      });

      if (container_ref.current) {
        qr_ref.current.append(container_ref.current);
      }
    } else {
      qr_ref.current.update({ data: value, image: logo_src });
    }
  }, [value, logo_src, size]);

  return (
    <div
      ref={container_ref}
      className="rounded-3xl overflow-hidden [&>svg]:block"
      style={{ width: size, height: size }}
    />
  );
}
