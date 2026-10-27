import * as migration_20261026_233245_initial_backend from './20261026_233245_initial_backend';
import * as migration_20261026_233703_intake_limits from './20261026_233703_intake_limits';
import * as migration_20261027_000251_content_center from './20261027_000251_content_center';
import * as migration_20261027_003459_content_sections from './20261027_003459_content_sections';
import * as migration_20261027_052934_service_catalog from './20261027_052934_service_catalog';

export const migrations = [
  {
    up: migration_20261026_233245_initial_backend.up,
    down: migration_20261026_233245_initial_backend.down,
    name: '20261026_233245_initial_backend',
  },
  {
    up: migration_20261026_233703_intake_limits.up,
    down: migration_20261026_233703_intake_limits.down,
    name: '20261026_233703_intake_limits',
  },
  {
    up: migration_20261027_000251_content_center.up,
    down: migration_20261027_000251_content_center.down,
    name: '20261027_000251_content_center',
  },
  {
    up: migration_20261027_003459_content_sections.up,
    down: migration_20261027_003459_content_sections.down,
    name: '20261027_003459_content_sections',
  },
  {
    up: migration_20261027_052934_service_catalog.up,
    down: migration_20261027_052934_service_catalog.down,
    name: '20261027_052934_service_catalog'
  },
];
