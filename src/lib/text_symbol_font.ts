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
export const TEXT_SYMBOL_UNICODE_RANGE = "U+00A9";

export const TEXT_SYMBOL_FONT_FILE = "/fonts/Inter-symbols.woff2";

export const TEXT_SYMBOL_FONT_SRC =
  "data:font/woff2;base64,d09GMgABAAAAAATQABMAAAAACZwAAARmAAQAQgAAAAAAAAAAAAAAAAAAAAAAAAAAGyAcKj9IVkFSLz9NVkFSXgZgP1NUQVSBTicmADQvbBEICoFYgW0wgU4BNgIkAwgLBgAEIAWGLgcgG10IERWkvVH8TOBNss4JKQQQVxjYDnxTvX/Ig4pwZtWz0oHOUQAYrAD7QgzPAHYALM65/8pEnkEBgC6k7RDj3+d/v5kR8QgX09KI6aGS8SweRectrtH+qMSpNg4hb3222XK0vY2wQ44lQ8KCXo2AgGKUQO06dOtHBh5ACgAoYwUqYZcJp42OZlCITfAbIB9QBWc+hoBciKyBLq7IwKdePJozM6Uh4xsHmDtj3EyaaPEmCyZNjKjFW2nFDPYQD/1IK1qBAQboxLCXa3jeJ9qGD35d73ngQLOx59lkR8fxHWB4wwTAL+/Tt3tfHuI859MfSuaBjPdtFyAAb4T/ClCKGEJk4IB8ZAHVsJmz4ovUCOZPnBRJaHI0eppaYRSgDDVoQgcGMIYZLGINOxBgakwICIFqMg5oavGUrLaq0dy8YdoGdh9Rr6vfRFPPBp2tT2oauFKyhm5VxsXdpTUAAgSASK91Z+z5rNWFDxQMKkwos7Vu3Vqnas4wog8vO2RkHqVo3piA8ylGQGqQALblwhD5yCSjoDHGgbZBnlEk1QTncLWAp0C1QdVAdUDbQHVBv6F6YINA9cHuAzUAVwrUMPD9QilyAmAAeIADOgHzQB4A4Erlyzc1+803sza+/nr/4I03gg2vvUYCENh4c2DWa0KEOBSTN3zyxjvKfvfNTz2qj19/m8Rbr300YOObSlrmjblof+jrqS+z+KOPxedPujJozt4co66FnVeN7NdpfoeO8zt36jjPPLBTv2hE2OVabNTU/WcGTZr/WBR/9Ozao/nnvfrqvPxHj56IEHDRUUh15PLiN4aePDn0jcWLT8QQcNFieBGvWC2CmbsDDEkYuWia4CHodoxWFC3ipBnrTBUL+bKngmH437svfzCkbcXw1q5dt8KKfaf88NGn/4W0IpEgsSJ30XbDhk1btGhI2Q/Orlmz68SJe7/IVoIZKVRQMosWmSuZCu+fXKZQ8tuP3ztwLLkf0zH5zrUL3/30Z/KrTYWign98/t6Hn3311VOH7ireZdy4xgUKFK1QIfJfhQCPNtti/5YdmbPZ7xkuA4BP5q3dZm56OOklS+W7kPEm4DAABH+2mD9ieP8NuQg9pPmt1Cm9F+cQYAwhYAg+AgAAwCGggEIc8jKBbQAgArbBCDkARy3OwaMIb8GnAb8gjSKqZAppoDYuEjEtQE0ytAq1yKdNqE2gY6hDyAHUJaYLqEcu3YH6ZOgJNCCPXkBDAn2ERhTSN2hMhhlaEbPgc1oTWAHaQl0vD3SpIuh3e2P4YBru/+hEGMAjcA1kESzjSLlBCFUVRV4473Skzm2PaZu5dmdmzg47+oqztXXXeaGMLRIM2910f1283tf3YruoNZXwg0HmJ5tD3XUgPpq33BofvsMJ69KjrVv95HCpo+gId7Jl6Qy3QmyX1ZN/rD1cta3ubLNeQC5Ewr7rilyP7Tfa+sq1+EjELPrhrOPMvHtRot3EgrdeYG/YFMcozGVeH/VvxKkAJE9tUgA=";

export function build_text_symbol_font_face_css(
  family: string,
  weight: number,
  src: string = TEXT_SYMBOL_FONT_SRC,
): string {
  return `@font-face {
  font-family: '${family}';
  font-style: normal;
  font-weight: ${weight};
  font-display: block;
  src: url('${src}') format('woff2');
  unicode-range: ${TEXT_SYMBOL_UNICODE_RANGE};
}`;
}
