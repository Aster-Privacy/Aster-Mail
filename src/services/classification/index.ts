export type {
  ClassificationResult,
  ClassificationSignal,
  ClassificationInput,
  ClassificationConfig,
  ClassificationCache,
  ClassificationState,
  CategoryToken,
  UserCategoryPreference,
  SignalType,
  DomainRule,
  KeywordRule,
  EmailHeaders,
} from "./types";

export { DEFAULT_CLASSIFICATION_CONFIG } from "./types";

export {
  EmailClassifier,
  get_classifier,
  reset_classifier,
  classify_email,
  classify_emails,
  CLASSIFIER_VERSION,
} from "./classifier";

export {
  generate_category_token,
  generate_all_category_tokens,
  get_category_tokens,
  get_token_for_category,
  clear_category_token_cache,
  validate_category_key,
} from "./tokens";

export {
  get_domain_rule,
  extract_domain,
  is_automated_sender,
  match_subject_keywords,
  match_body_keywords,
  get_category_by_weight,
  SOCIAL_DOMAINS,
  PROMOTIONS_DOMAINS,
  UPDATES_DOMAINS,
  FORUMS_DOMAINS,
  ALL_DOMAIN_RULES,
} from "./rules";
