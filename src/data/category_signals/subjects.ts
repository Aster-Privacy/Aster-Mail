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

// Periodical editorial mail. These are shape signals (an issue number, a
// digest cadence, a "read online" masthead) rather than topic words, so they
// stay reliable across languages that borrow the English framing.
export const NEWSLETTER_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\bnewsletter\b/i,
  /\bissue\s*#?\s*\d+/i,
  /\bvol(?:ume)?\.?\s*\d+\b/i,
  /\bedition\b/i,
  /\bdigest\b/i,
  /\bround[\s-]?up\b/i,
  /\brecap\b/i,
  /\bbulletin\b/i,
  /\bbriefing\b/i,
  /\bdispatch\b/i,
  /\bthis\s+(?:week|month|morning)\s+in\b/i,
  /\b(?:weekly|monthly|daily)\s+(?:digest|update|roundup|read|edition|newsletter)\b/i,
  /\byour\s+(?:weekly|monthly|daily)\b/i,
  /\bnew\s+(?:post|story|article|episode)\s+(?:from|by)\b/i,
  /\bnew\s+from\b/i,
  /\bread\s+(?:online|in\s+(?:browser|app))\b/i,
  /\bfrom\s+the\s+(?:editor|desk\s+of)\b/i,
];

// The purchase and payment lifecycle. Kept separate from UPDATES so a receipt
// or a delivery notice never competes with a security alert for attention.
export const TRANSACTIONS_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\border(?:\s*#|\s+(?:confirm|number|placed|update|received))/i,
  /\byour\s+order\b/i,
  /\breceipt\b/i,
  /\binvoice\b/i,
  /\bbill(?:ing)?\s+(?:statement|summary)\b/i,
  /\bpayment\s+(?:received|sent|due|failed|confirm)/i,
  /\bpaid\b/i,
  /\bcharged\b/i,
  /\brefund(?:ed)?\b/i,
  /\bshipped\b/i,
  /\bshipping\s+(?:confirm|update|notice)/i,
  /\bout\s+for\s+delivery\b/i,
  /\bdelivered\b/i,
  /\btracking\s+(?:number|info|update)\b/i,
  /\bpurchase\b/i,
  /\bthanks?\s+for\s+your\s+(?:order|purchase|payment)\b/i,
  /\bsubscription\s+(?:renew|charge|payment)/i,
  /\breturn\s+(?:label|confirmation|received)\b/i,
  /\bpre[\s-]?order\b/i,
];

export const ACCOUNT_ACCESS_SUBJECT_PATTERNS: readonly RegExp[] = [
  /\b(?:verification|verify|security|confirmation|confirm|login|log[\s-]?in|sign[\s-]?in|one[\s-]?time|access|authentication|auth|activation|passcode)\s+(?:code|pin|link)\b/i,
  /\bone[\s-]?time\s+(?:password|passcode)\b/i,
  /\botp\b/i,
  /\b(?:your\s+)?code\s+is\s*:?\s*\d{4,8}\b/i,
  /\b\d{4,8}\s+is\s+your\b/i,
  /\buse\s+\d{4,8}\s+to\b/i,
  /\b(?:confirm|verify|activate)\s+(?:your\s+|this\s+)?(?:new\s+)?(?:email|e-mail|account|address|email\s+address|sign[\s-]?in|log[\s-]?in|login|identity|device)\b/i,
  /\b(?:reset|recover)\s+your\s+password\b/i,
  /\bpassword\s+(?:reset|recovery)\b/i,
  /\b(?:magic|sign[\s-]?in|log[\s-]?in|login)\s+link\b/i,
  /验证码|驗證碼|校验码|校驗碼|动态码|動態碼|确认码|確認碼|安全码|安全碼|登录码|登入碼/,
  /(?:验证|驗證|确认|確認|激活|啟用)(?:您|你)的(?:帐户|账户|帐号|账号|帳戶|帳號|电子邮件|電子郵件|邮箱|郵箱|邮件地址|郵件地址|登录|登入)/,
  /验证此次登录|驗證此次登入|验证登录|驗證登入|确认登录|確認登入|登录验证|登入驗證|重置密码|重設密碼|密码重置|密碼重設/,
  /認証コード|確認コード|ワンタイムパスワード|パスワードの再設定|パスワードをリセット|メールアドレスの確認/,
  /인증\s*(?:코드|번호)|확인\s*코드|비밀번호\s*재설정/,
  /\bc[oó]digo\s+de\s+(?:verificaci[oó]n|verifica[cç][aã]o|seguridad|seguran[cç]a|acceso|acesso|confirmaci[oó]n|confirma[cç][aã]o|inicio\s+de\s+sesi[oó]n)\b/i,
  /\b(?:restablecer|recuperar)\s+(?:tu\s+|su\s+)?contrase[nñ]a\b|\bredefinir\s+(?:a\s+|sua\s+)?senha\b/i,
  /\bcode\s+de\s+(?:v[ée]rification|s[ée]curit[ée]|confirmation|connexion)/i,
  /\br[ée]initialis(?:er|ation)\s+(?:de\s+)?(?:votre\s+)?mot\s+de\s+passe\b/i,
  /\b(?:best[äa]tigungs|verifizierungs|sicherheits|anmelde)code\b|\bpasswort\s+zur[üu]cksetzen\b/i,
  /\bcodice\s+di\s+(?:verifica|sicurezza|accesso|conferma)\b/i,
  /код\s+(?:подтверждения|проверки|безопасности|доступа|для\s+входа)|сброс\s+пароля|подтвердите\s+(?:ваш|свой|вашу|свою|адрес)/i,
];

export const ACCOUNT_ACCESS_HEADER_NAMES: readonly string[] = [
  "x-verify-code",
  "x-verify-short-code",
  "x-signin-verify-code",
  "x-unblock-code",
];
