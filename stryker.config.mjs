export default {
  testRunner: 'vitest',
  reporters: ['clear-text', 'progress', 'html'],
  coverageAnalysis: 'perTest',
  mutate: ['src/game/**/*.ts', 'src/platform/**/*.ts'],
  testFiles: ['tests/unit/**/*.test.ts'],
  thresholds: { high: 90, low: 80, break: 80 },
  vitest: {
    configFile: 'vitest.config.ts',
  },
};
