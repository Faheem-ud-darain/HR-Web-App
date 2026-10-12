// Pin the runner's timezone: leave durations are parsed as local-midnight dates,
// so results would otherwise differ by machine (see src/lib/core/core.test.ts).
process.env.TZ = process.env.TZ || 'America/New_York';

import { defineConfig } from 'vitest/config';

// Deliberately scoped to src/lib/**/*.test.ts only (plan 015, step 1) —
// this repo's first test framework introduction targets the highest-risk
// pure business logic (payroll math, absence detection, leave-day math,
// NY timezone utilities), not React component rendering or end-to-end
// coverage. See plans/015-add-test-coverage.md for the full scope/boundaries.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/lib/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/lib/**/*.ts'],
      exclude: ['src/lib/**/*.test.ts'],
    },
  },
});
