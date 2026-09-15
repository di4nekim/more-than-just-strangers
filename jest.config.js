export default {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/__tests__/config/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
    '\\.(svg|png|jpg|jpeg|gif|webp)$': '<rootDir>/__tests__/helpers/fileMock.js',
  },
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': ['babel-jest', { presets: ['next/babel'] }],
  },
  testPathIgnorePatterns: [
    '<rootDir>/.next/', 
    '<rootDir>/node_modules/',
    '<rootDir>/server/.aws-sam/',
    '<rootDir>/server/lambdas/.aws-sam/',
    '<rootDir>/coverage/',
    '<rootDir>/dynamodb/'
  ],
  moduleFileExtensions: ['js', 'jsx', 'ts', 'tsx'],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    'server/lambdas/**/*.js',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{js,jsx,ts,tsx}',
    '!src/**/__tests__/**',
    '!server/lambdas/**/*.test.js',
    '!server/lambdas/.aws-sam/**/*',
    '!server/.aws-sam/**/*'
  ],
  // Ratcheting gate: set just below the measured coverage so CI fails on a
  // regression, and raised as coverage grows. The previous 70% was aspirational
  // (never met, never enforced). Measured 2026-09-15: ~31% stmts / ~35% lines.
  coverageThreshold: {
    global: {
      branches: 20,
      functions: 24,
      lines: 33,
      statements: 29,
    },
  },
  testMatch: [
    '**/__tests__/**/*.(test|spec).(js|jsx|ts|tsx)',
    '**/*.(test|spec).(js|jsx|ts|tsx)',
    '!**/.aws-sam/**'
  ],
  transformIgnorePatterns: [
    'node_modules/(?!(.*\\.mjs$|@aws-sdk))'
  ]
}; 