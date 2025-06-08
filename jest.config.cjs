module.exports = {
    testEnvironment: 'node',
    // setupFilesAfterEnv: ['<rootDir>/server/lambdas/__tests__/setup.js'],
    testMatch: ['**/server/lambdas/__tests__/**/*.test.js'],
    collectCoverage: true,
    collectCoverageFrom: [
        'server/lambdas/*.js',
        '!server/lambdas/__tests__/**'
    ],
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/__tests__/'
    ],
    verbose: true,
    testTimeout: 30000,
    transform: {
        '^.+\\.jsx?$': 'babel-jest',
    },
    testEnvironment: 'node',
    moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1'
  }
}; 