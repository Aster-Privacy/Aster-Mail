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

import type { CSSProperties } from "react";

interface FaviconOrInitialProps {
  src: string;
  initial: string;
  image_class_name?: string;
  initial_class_name?: string;
  initial_style?: CSSProperties;
}

export function FaviconOrInitial({
  src,
  initial,
  image_class_name = "w-4 h-4 object-contain",
  initial_class_name = "text-[11px] font-medium text-txt-muted",
  initial_style,
}: FaviconOrInitialProps) {
  const [failed, set_failed] = useState(false);

  useEffect(() => {
    set_failed(false);
  }, [src]);

  if (!src || failed) {
    return (
      <span className={initial_class_name} style={initial_style}>
        {initial}
      </span>
    );
  }

  return (
    <img
      alt=""
      className={image_class_name}
      src={src}
      onError={() => set_failed(true)}
    />
  );
}
