import * as migration_20261026_233245_initial_backend from './20261026_233245_initial_backend';
import * as migration_20261026_233703_intake_limits from './20261026_233703_intake_limits';

export const migrations = [
  {
    up: migration_20261026_233245_initial_backend.up,
    down: migration_20261026_233245_initial_backend.down,
    name: '20261026_233245_initial_backend',
  },
  {
    up: migration_20261026_233703_intake_limits.up,
    down: migration_20261026_233703_intake_limits.down,
    name: '20261026_233703_intake_limits'
  },
];
