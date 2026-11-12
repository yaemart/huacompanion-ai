import * as migration_20261109_120000_intake_followups from "./20261109_120000_intake_followups";
import * as migration_20261111_100000_quote_templates from "./20261111_100000_quote_templates";
import * as migration_20261113_100000_quote_line_foundation from "./20261113_100000_quote_line_foundation";
import * as migration_20261109_080000_inquiry_reply from "./20261109_080000_inquiry_reply";
import * as migration_20261108_220000_public_company from "./20261108_220000_public_company";
import * as migration_20261108_160000_policy_note_tasks from "./20261108_160000_policy_note_tasks";
import * as migration_20261108_140000_policy_shared_foundation from "./20261108_140000_policy_shared_foundation";
import * as migration_20261108_120000_policy_stay_hours from "./20261108_120000_policy_stay_hours";
import * as migration_20261026_233245_initial_backend from "./20261026_233245_initial_backend";
import * as migration_20261026_233703_intake_limits from "./20261026_233703_intake_limits";
import * as migration_20261027_000251_content_center from "./20261027_000251_content_center";
import * as migration_20261027_003459_content_sections from "./20261027_003459_content_sections";
import * as migration_20261027_052934_service_catalog from "./20261027_052934_service_catalog";
import * as migration_20261028_000000_seven_locales from "./20261028_000000_seven_locales";
import * as migration_20261029_000000_coordination_stage from "./20261029_000000_coordination_stage";
import * as migration_20261029_013605_staff_permissions from "./20261029_013605_staff_permissions";
import * as migration_20261029_014325_content_contributors from "./20261029_014325_content_contributors";
import * as migration_20261029_024218_city_life_permissions from "./20261029_024218_city_life_permissions";
import * as migration_20261030_000212_housekeeping from "./20261030_000212_housekeeping";
import * as migration_20261030_005114_customer_support from "./20261030_005114_customer_support";
import * as migration_20261030_005604_support_request_draft from "./20261030_005604_support_request_draft";
import * as migration_20261030_005946_support_ai_revision from "./20261030_005946_support_ai_revision";
import * as migration_20261030_010427_support_translation from "./20261030_010427_support_translation";
import * as migration_20261030_095004_support_feature_settings from "./20261030_095004_support_feature_settings";
import * as migration_20261030_233618_support_multimodal from "./20261030_233618_support_multimodal";
import * as migration_20261031_033746_business_platform from "./20261031_033746_business_platform";
import * as migration_20261031_034016_customer_notifications from "./20261031_034016_customer_notifications";
import * as migration_20261031_054202_business_ai from "./20261031_054202_business_ai";
import * as migration_20261101_022501_page_seo from "./20261101_022501_page_seo";
import * as migration_20261101_025904_intake_client_limits from "./20261101_025904_intake_client_limits";
import * as migration_20261101_030726_trial_feature_defaults from "./20261101_030726_trial_feature_defaults";
import * as migration_20261101_082855_immigration_policies from "./20261101_082855_immigration_policies";
import * as migration_20261101_091015_immigration_policy_workflow from "./20261101_091015_immigration_policy_workflow";
import * as migration_20261102_050750_visa_search from "./20261102_050750_visa_search";

export const migrations = [
  {
    up: migration_20261026_233245_initial_backend.up,
    down: migration_20261026_233245_initial_backend.down,
    name: "20261026_233245_initial_backend",
  },
  {
    up: migration_20261026_233703_intake_limits.up,
    down: migration_20261026_233703_intake_limits.down,
    name: "20261026_233703_intake_limits",
  },
  {
    up: migration_20261027_000251_content_center.up,
    down: migration_20261027_000251_content_center.down,
    name: "20261027_000251_content_center",
  },
  {
    up: migration_20261027_003459_content_sections.up,
    down: migration_20261027_003459_content_sections.down,
    name: "20261027_003459_content_sections",
  },
  {
    up: migration_20261027_052934_service_catalog.up,
    down: migration_20261027_052934_service_catalog.down,
    name: "20261027_052934_service_catalog",
  },
  {
    up: migration_20261028_000000_seven_locales.up,
    down: migration_20261028_000000_seven_locales.down,
    name: "20261028_000000_seven_locales",
  },
  {
    up: migration_20261029_000000_coordination_stage.up,
    down: migration_20261029_000000_coordination_stage.down,
    name: "20261029_000000_coordination_stage",
  },
  {
    up: migration_20261029_013605_staff_permissions.up,
    down: migration_20261029_013605_staff_permissions.down,
    name: "20261029_013605_staff_permissions",
  },
  {
    up: migration_20261029_014325_content_contributors.up,
    down: migration_20261029_014325_content_contributors.down,
    name: "20261029_014325_content_contributors",
  },
  {
    up: migration_20261029_024218_city_life_permissions.up,
    down: migration_20261029_024218_city_life_permissions.down,
    name: "20261029_024218_city_life_permissions",
  },
  {
    up: migration_20261030_000212_housekeeping.up,
    down: migration_20261030_000212_housekeeping.down,
    name: "20261030_000212_housekeeping",
  },
  {
    up: migration_20261030_005114_customer_support.up,
    down: migration_20261030_005114_customer_support.down,
    name: "20261030_005114_customer_support",
  },
  {
    up: migration_20261030_005604_support_request_draft.up,
    down: migration_20261030_005604_support_request_draft.down,
    name: "20261030_005604_support_request_draft",
  },
  {
    up: migration_20261030_005946_support_ai_revision.up,
    down: migration_20261030_005946_support_ai_revision.down,
    name: "20261030_005946_support_ai_revision",
  },
  {
    up: migration_20261030_010427_support_translation.up,
    down: migration_20261030_010427_support_translation.down,
    name: "20261030_010427_support_translation",
  },
  {
    up: migration_20261030_095004_support_feature_settings.up,
    down: migration_20261030_095004_support_feature_settings.down,
    name: "20261030_095004_support_feature_settings",
  },
  {
    up: migration_20261030_233618_support_multimodal.up,
    down: migration_20261030_233618_support_multimodal.down,
    name: "20261030_233618_support_multimodal",
  },
  {
    up: migration_20261031_033746_business_platform.up,
    down: migration_20261031_033746_business_platform.down,
    name: "20261031_033746_business_platform",
  },
  {
    up: migration_20261031_034016_customer_notifications.up,
    down: migration_20261031_034016_customer_notifications.down,
    name: "20261031_034016_customer_notifications",
  },
  {
    up: migration_20261031_054202_business_ai.up,
    down: migration_20261031_054202_business_ai.down,
    name: "20261031_054202_business_ai",
  },
  {
    up: migration_20261101_022501_page_seo.up,
    down: migration_20261101_022501_page_seo.down,
    name: "20261101_022501_page_seo",
  },
  {
    up: migration_20261101_025904_intake_client_limits.up,
    down: migration_20261101_025904_intake_client_limits.down,
    name: "20261101_025904_intake_client_limits",
  },
  {
    up: migration_20261101_030726_trial_feature_defaults.up,
    down: migration_20261101_030726_trial_feature_defaults.down,
    name: "20261101_030726_trial_feature_defaults",
  },
  {
    up: migration_20261101_082855_immigration_policies.up,
    down: migration_20261101_082855_immigration_policies.down,
    name: "20261101_082855_immigration_policies",
  },
  {
    up: migration_20261101_091015_immigration_policy_workflow.up,
    down: migration_20261101_091015_immigration_policy_workflow.down,
    name: "20261101_091015_immigration_policy_workflow",
  },
  {
    up: migration_20261102_050750_visa_search.up,
    down: migration_20261102_050750_visa_search.down,
    name: "20261102_050750_visa_search",
  },
  {
    up: migration_20261108_120000_policy_stay_hours.up,
    down: migration_20261108_120000_policy_stay_hours.down,
    name: "20261108_120000_policy_stay_hours",
  },
  {
    up: migration_20261108_140000_policy_shared_foundation.up,
    down: migration_20261108_140000_policy_shared_foundation.down,
    name: "20261108_140000_policy_shared_foundation",
  },
  {
    up: migration_20261108_160000_policy_note_tasks.up,
    down: migration_20261108_160000_policy_note_tasks.down,
    name: "20261108_160000_policy_note_tasks",
  },
  {
    up: migration_20261108_220000_public_company.up,
    down: migration_20261108_220000_public_company.down,
    name: "20261108_220000_public_company",
  },
  {
    up: migration_20261109_080000_inquiry_reply.up,
    down: migration_20261109_080000_inquiry_reply.down,
    name: "20261109_080000_inquiry_reply",
  },
  {
    up: migration_20261109_120000_intake_followups.up,
    down: migration_20261109_120000_intake_followups.down,
    name: "20261109_120000_intake_followups",
  },
  {
    up: migration_20261111_100000_quote_templates.up,
    down: migration_20261111_100000_quote_templates.down,
    name: "20261111_100000_quote_templates",
  },
  {
    up: migration_20261113_100000_quote_line_foundation.up,
    down: migration_20261113_100000_quote_line_foundation.down,
    name: "20261113_100000_quote_line_foundation",
  },
];
