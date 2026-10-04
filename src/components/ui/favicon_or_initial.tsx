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
import type { ImgHTMLAttributes } from "react";

import {
  FaviconOrInitial as BaseFaviconOrInitial,
  type FaviconOrInitialProps,
} from "@aster/ui";

import { use_favicon_src } from "@/hooks/use_favicon_src";
import { same_origin_favicon_domain } from "@/lib/favicon_url";

export function FaviconOrInitial(props: FaviconOrInitialProps) {
  const domain = same_origin_favicon_domain(props.src);
  const loaded = use_favicon_src(domain ?? "", domain !== null);
  const src = domain === null ? props.src : loaded.startsWith("data:") ? "" : loaded;

  return <BaseFaviconOrInitial {...props} src={src} />;
}

type FaviconImgProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "src"> & {
  domain: string;
};

export function FaviconImg({ domain, alt = "", ...rest }: FaviconImgProps) {
  const src = use_favicon_src(domain);

  return <img alt={alt} {...rest} src={src} />;
}
