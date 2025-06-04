module.exports = {
    testEnvironment: 'node',
    testMatch: [
        '**/__test__/**/*.test.js',
        '**/__tests__/**/*.test.js'
    ],
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    verbose: true,
    setupFiles: ['<rootDir>/server/lambdas/__tests__/setup.js'],
    testTimeout: 10000,
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1'
    },
    roots: ['<rootDir>/server/lambdas']
}; 