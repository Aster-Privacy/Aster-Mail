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
import type { ReactNode } from "react";

import { useEffect, useLayoutEffect, useRef } from "react";
import { animate } from "framer-motion";

import { use_should_reduce_motion } from "@/provider";

const HEIGHT_EASE = [0.32, 0.72, 0, 1] as const;

interface AnimatedHeightProps {
  animate_key: string | number | boolean;
  children: ReactNode;
  className?: string;
}

export function AnimatedHeight({
  animate_key,
  children,
  className,
}: AnimatedHeightProps) {
  const reduce_motion = use_should_reduce_motion();
  const outer_ref = useRef<HTMLDivElement>(null);
  const inner_ref = useRef<HTMLDivElement>(null);
  const last_height_ref = useRef<number | null>(null);
  const first_key_ref = useRef(animate_key);

  useEffect(() => {
    const inner = inner_ref.current;

    if (!inner || typeof ResizeObserver === "undefined") return;

    last_height_ref.current = inner.offsetHeight;
    const observer = new ResizeObserver(() => {
      last_height_ref.current = inner.offsetHeight;
    });

    observer.observe(inner);

    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const outer = outer_ref.current;
    const inner = inner_ref.current;
    const from = last_height_ref.current;

    if (first_key_ref.current === animate_key) return;
    first_key_ref.current = animate_key;

    if (!outer || !inner || from === null || reduce_motion) return;

    const to = inner.offsetHeight;

    if (Math.abs(to - from) < 2) return;

    outer.style.overflow = "hidden";
    const controls = animate(outer, { height: [from, to] }, {
      duration: 0.24,
      ease: HEIGHT_EASE,
    });

    controls.then(() => {
      outer.style.height = "";
      outer.style.overflow = "";
    });

    return () => {
      controls.stop();
      outer.style.height = "";
      outer.style.overflow = "";
    };
  }, [animate_key, reduce_motion]);

  return (
    <div ref={outer_ref} className={className}>
      <div ref={inner_ref}>{children}</div>
    </div>
  );
}
