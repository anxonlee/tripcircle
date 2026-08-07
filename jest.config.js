/** Unit tests cover pure TS (services, lib, optimizer) — no RN renderer needed. */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // src/_legacy is off the compile path (see its README and tsconfig.json).
  testPathIgnorePatterns: ['<rootDir>/src/_legacy/'],
};
