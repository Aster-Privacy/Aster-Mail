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
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

export function render_hook<P, T>(
  hook: (props: P) => T,
  options: { initialProps: P },
) {
  const result = { current: undefined as unknown as T };
  const container = document.createElement("div");
  const root = createRoot(container);

  function Probe({ props }: { props: P }) {
    result.current = hook(props);

    return null;
  }

  const render = (props: P) => {
    act(() => {
      root.render(createElement(Probe, { props }));
    });
  };

  render(options.initialProps);

  return {
    result,
    rerender: render,
    unmount: () => act(() => root.unmount()),
  };
}

export { act };
