/* eslint-disable */

// Pin the test run to UTC so the date-based portfolio-calculator specs are
// deterministic regardless of the host timezone (they otherwise fail by one
// day in non-UTC zones, e.g. GMT-3). This config is evaluated in the main Jest
// process before the worker processes are forked, so the workers inherit
// TZ=UTC and initialise their timezone accordingly.
process.env.TZ = 'UTC';

export default {
  displayName: 'api',

  globals: {},
  transform: {
    '^.+\\.[tj]s$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.spec.json'
      }
    ]
  },
  moduleFileExtensions: ['ts', 'js', 'html'],
  coverageDirectory: '../../coverage/apps/api',
  testEnvironment: 'node',
  preset: '../../jest.preset.js'
};
