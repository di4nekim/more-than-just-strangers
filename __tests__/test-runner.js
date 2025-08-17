#!/usr/bin/env node

/**
 * Comprehensive Test Runner
 * 
 * Organizes and runs all tests systematically with proper categorization
 * and reporting
 */

const { spawn } = require('child_process');
const path = require('path');

// Test categories and their configurations
const testCategories = {
  unit: {
    description: 'Unit Tests',
    pattern: '--testPathIgnorePatterns=integration --testPathIgnorePatterns=e2e',
    coverage: true
  },
  frontend: {
    description: 'Frontend Component Tests',
    pattern: '__tests__/frontend',
    coverage: true
  },
  api: {
    description: 'API Endpoint Tests',
    pattern: '__tests__/api',
    coverage: true
  },
  websocket: {
    description: 'WebSocket Tests',
    pattern: '__tests__/websocket',
    coverage: true
  },
  auth: {
    description: 'Authentication Tests',
    pattern: '__tests__/auth',
    coverage: true
  },
  integration: {
    description: 'Integration Tests',
    pattern: '__tests__/integration',
    coverage: true
  },
  lambda: {
    description: 'Lambda Function Tests',
    pattern: 'server/lambdas',
    coverage: true
  }
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Utility functions
function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function logHeader(message) {
  log(`\n${'='.repeat(60)}`, colors.bright);
  log(`  ${message}`, colors.cyan);
  log(`${'='.repeat(60)}`, colors.bright);
}

function logSection(message) {
  log(`\n${'-'.repeat(40)}`, colors.yellow);
  log(`  ${message}`, colors.yellow);
  log(`${'-'.repeat(40)}`, colors.yellow);
}

function logSuccess(message) {
  log(`Success: ${message}`, colors.green);
}

function logError(message) {
  log(`Error: ${message}`, colors.red);
}

function logWarning(message) {
  log(`Warning: ${message}`, colors.yellow);
}

function logInfo(message) {
  log(`Info: ${message}`, colors.blue);
}

// Run Jest tests
function runJest(pattern, coverage = false) {
  return new Promise((resolve, reject) => {
    const args = ['jest'];
    
    if (pattern) {
      args.push(pattern);
    }
    
    if (coverage) {
      args.push('--coverage');
    }
    
    args.push('--verbose');
    
    logInfo(`Running: npx ${args.join(' ')}`);
    
    const jest = spawn('npx', args, {
      stdio: 'inherit',
      shell: true,
      cwd: process.cwd()
    });
    
    jest.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`Jest exited with code ${code}`));
      }
    });
    
    jest.on('error', (error) => {
      reject(error);
    });
  });
}

// Run tests for a specific category
async function runTestCategory(category, config) {
  try {
    logSection(`Running ${config.description}`);
    await runJest(config.pattern, config.coverage);
    logSuccess(`${config.description} completed successfully`);
    return true;
  } catch (error) {
    logError(`${config.description} failed: ${error.message}`);
    return false;
  }
}

// Run all tests
async function runAllTests() {
  const results = {};
  let totalPassed = 0;
  let totalFailed = 0;
  
  logHeader('Starting Comprehensive Test Suite');
  logInfo(`Test environment: ${process.env.NODE_ENV || 'development'}`);
  logInfo(`Working directory: ${process.cwd()}`);
  
  // Run each test category
  for (const [category, config] of Object.entries(testCategories)) {
    const success = await runTestCategory(category, config);
    results[category] = success;
    
    if (success) {
      totalPassed++;
    } else {
      totalFailed++;
    }
  }
  
  // Generate summary report
  logHeader('Test Summary Report');
  
  for (const [category, success] of Object.entries(results)) {
    const status = success ? 'PASSED' : 'FAILED';
    const color = success ? colors.green : colors.red;
    const icon = success ? 'PASS' : 'FAIL';
    
    log(`${icon} ${testCategories[category].description}: ${status}`, color);
  }
  
  logSection('Overall Results');
  log(`Total Categories: ${Object.keys(testCategories).length}`, colors.bright);
  log(`Passed: ${totalPassed}`, colors.green);
  log(`Failed: ${totalFailed}`, colors.red);
  
  if (totalFailed === 0) {
    logSuccess('All test categories passed!');
    process.exit(0);
  } else {
    logError(`${totalFailed} test category(ies) failed`);
    process.exit(1);
  }
}

// Run specific test category
async function runSpecificCategory(category) {
  if (!testCategories[category]) {
    logError(`Unknown test category: ${category}`);
    logInfo(`Available categories: ${Object.keys(testCategories).join(', ')}`);
    process.exit(1);
  }
  
  logHeader(`Running ${testCategories[category].description}`);
  
  try {
    await runTestCategory(category, testCategories[category]);
    logSuccess(`${testCategories[category].description} completed successfully`);
    process.exit(0);
  } catch (error) {
    logError(`${testCategories[category].description} failed: ${error.message}`);
    process.exit(1);
  }
}

// Show help information
function showHelp() {
  logHeader('Test Runner Help');
  log('Usage: node test-runner.js [category]');
  log('');
  log('Available categories:');
  
  for (const [category, config] of Object.entries(testCategories)) {
    log(`  ${category.padEnd(12)} - ${config.description}`);
  }
  
  log('');
  log('Examples:');
  log('  node test-runner.js              # Run all tests');
  log('  node test-runner.js frontend     # Run only frontend tests');
  log('  node test-runner.js unit         # Run only unit tests');
  log('');
  log('Environment variables:');
  log('  NODE_ENV=test                   # Set test environment');
  log('  CI=true                         # Enable CI mode');
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    return;
  }
  
  if (args.length === 0) {
    // Run all tests
    await runAllTests();
  } else if (args.length === 1) {
    // Run specific category
    await runSpecificCategory(args[0]);
  } else {
    logError('Invalid arguments. Use --help for usage information.');
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', () => {
  logWarning('\nTest execution interrupted by user');
  process.exit(1);
});

process.on('SIGTERM', () => {
  logWarning('\nTest execution terminated');
  process.exit(1);
});

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    logError(`Test runner failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = {
  testCategories,
  runTestCategory,
  runAllTests
};
