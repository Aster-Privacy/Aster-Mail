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
// Domain lists hold registrable root domains only. Matching is suffix-aware

export const PROMOTIONS_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\b\d{1,3}\s*%\s*off\b/i,
  /\b\d{1,3}\s*%\s*(?:back|cash\s*back)\b/i,
  /\bsale\b/i,
  /\bdeal(s)?\b/i,
  /\bdiscount(s)?\b/i,
  /\bcoupon(s)?\b/i,
  /\bpromo(?:\s*code)?\b/i,
  /\boffer(s)?\b/i,
  /\bsave\s+(?:up\s+to\s+)?\$?\d/i,
  /\blimited\s+time\b/i,
  /\bblack\s+friday\b/i,
  /\bcyber\s+monday\b/i,
  /\bflash\s+sale\b/i,
  /\bfree\s+shipping\b/i,
  /\bnew\s+arrivals?\b/i,
  /\bexclusive\b/i,
  /\bclearance\b/i,
  /\bdon'?t\s+miss\b/i,
  /\blast\s+chance\b/i,
  /\bact\s+now\b/i,
  /\bshop\s+now\b/i,
  /\bbuy\s+(?:now|one)\b/i,
  /\bbogo\b/i,
  /\bmembers?\s+only\b/i,
  /\bearly\s+access\b/i,
  /\bgiveaway\b/i,
  /\bbest\s+(?:price|deal)\b/i,
  /\blowest\s+price\b/i,
  /\bhot\s+deal\b/i,
  /\btoday\s+only\b/i,
  /\bends\s+(?:tonight|soon|today)\b/i,
  /\bweekend\s+sale\b/i,
  /\bsubscribe\s+and\s+save\b/i,
  /\bfinal\s+hours\b/i,
  /\bdoorbuster\b/i,
  /\bhurry\b/i,
  /\bwhile\s+supplies\s+last\b/i,
  /\bonly\s+\$\d/i,
  /\bfree\s+gift\b/i,
  /\brewards?\s+(?:points|await)\b/i,
  /\bvip\s+(?:access|sale)\b/i,
  /[\u{1F300}-\u{1FAFF}]/u,
];

export const UPDATES_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\border(?:\s*#|\s+(?:confirm|number|placed|update))/i,
  /\byour\s+order\b/i,
  /\breceipt\b/i,
  /\binvoice\b/i,
  /\bpayment\b/i,
  /\bshipped\b/i,
  /\bshipping\b/i,
  /\bout\s+for\s+delivery\b/i,
  /\bdelivered\b/i,
  /\bdelivery\b/i,
  /\btracking\b/i,
  /\bconfirm(ation|ed)?\b/i,
  /\bbooking\b/i,
  /\breservation\b/i,
  /\bitinerary\b/i,
  /\bboarding\s+pass\b/i,
  /\bcheck[\s-]?in\b/i,
  /\bappointment\b/i,
  /\bstatement\b/i,
  /\brenewal\b/i,
  /\bsecurity\s+(?:alert|code|notification)\b/i,
  /\bnew\s+(?:sign[\s-]?in|login|device)\b/i,
  /\bverif(?:y|ication)\b/i,
  /\bone[\s-]?time\s+(?:code|password|passcode)\b/i,
  /\botp\b/i,
  /\byour\s+code\s+is\b/i,
  /\bpassword\s+(?:reset|changed)\b/i,
  /\b2fa\b/i,
  /\bsign[\s-]?in\b/i,
  /\bsubscription\s+(?:renew|expir)/i,
  /\baccount\s+(?:update|notice|alert)\b/i,
  /\bterms\s+of\s+service\b/i,
  /\bprivacy\s+policy\b/i,
];

export const FINANCE_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\byour\s+statement\b/i,
  /\baccount\s+balance\b/i,
  /\btransaction\s+(?:alert|declined|approved)\b/i,
  /\bpayment\s+(?:received|sent|due|failed)\b/i,
  /\bautopay\b/i,
  /\bdirect\s+deposit\b/i,
  /\bwire\s+transfer\b/i,
  /\btax\s+(?:document|form|refund)\b/i,
  /\bcredit\s+score\b/i,
  /\bfraud\s+alert\b/i,
  /\bsuspicious\s+(?:activity|charge)\b/i,
  /\blow\s+balance\b/i,
  /\bportfolio\b/i,
  /\bdividend\b/i,
  /\bmortgage\b/i,
  /\bloan\s+(?:payment|approved)\b/i,
];

export const TRAVEL_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\bflight\s+(?:confirmation|itinerary|change|delay|cancell?ed)\b/i,
  /\bcheck[\s-]?in\s+(?:now|open|reminder)\b/i,
  /\bboarding\s+pass\b/i,
  /\byour\s+trip\b/i,
  /\byour\s+reservation\b/i,
  /\byour\s+stay\b/i,
  /\brental\s+car\b/i,
  /\bgate\s+change\b/i,
  /\bdeparture\b/i,
  /\barrival\b/i,
  /\byour\s+ride\b/i,
  /\bdriver\s+(?:is\s+on\s+the\s+way|assigned)\b/i,
  /\byour\s+order\s+is\s+on\s+its\s+way\b/i,
  /\bfood\s+delivery\b/i,
];

export const SHOPPING_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\brefund\s+(?:issued|processed)\b/i,
  /\breturn\s+(?:label|confirmation)\b/i,
  /\bprice\s+drop\b/i,
  /\bback\s+in\s+stock\b/i,
  /\bstill\s+in\s+your\s+cart\b/i,
  /\bcart\s+is\s+waiting\b/i,
  /\bwishlist\b/i,
  /\bcoupon\b/i,
  /\bpromo\s+code\b/i,
];
