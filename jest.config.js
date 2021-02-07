module.exports = {
  preset: 'ts-jest',
  testTimeout: 30000,
  testEnvironment: 'node',
  collectCoverage: true,
  coveragePathIgnorePatterns: ["/node_modules", "external_modules"]
};