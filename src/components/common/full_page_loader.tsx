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

let active_count = 0;

function dismiss_loader() {
  const el = document.getElementById("initial-loader");

  if (!el) return;

  el.style.transition = "opacity 0.15s ease-out";
  el.style.opacity = "0";
  setTimeout(() => el.remove(), 150);
}

export function FullPageLoader() {
  const [has_static] = useState(
    () => !!document.getElementById("initial-loader"),
  );

  useEffect(() => {
    active_count++;

    return () => {
      active_count--;
      requestAnimationFrame(() => {
        if (active_count === 0) {
          dismiss_loader();
        }
      });
    };
  }, []);

  if (has_static) return null;

  return (
    <div className="full-page-loader bg-surf-secondary">
      <div className="full-page-loader-content">
        <img
          alt="Aster"
          className="h-7"
          draggable={false}
          src="/text_logo.png"
        />
        <div className="loader-spinner" />
      </div>
    </div>
  );
}
