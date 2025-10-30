/**
 * Browser I/O Error Handler
 * 
 * Handles and suppresses Chrome's internal I/O errors that are beyond the application's control.
 * These errors typically occur with .ldb files (LevelDB) and other browser-internal operations.
 */

class BrowserIOHandler {
  constructor() {
    this.originalConsoleError = console.error;
    this.errorPatterns = [
      /Unable to create writable file.*\.ldb/,
      /IO error.*\.ldb/,
      /ChromeMethodBFE.*NewWritableFile/,
      /Failed to open.*\.ldb/,
      /LevelDB.*IO error/,
      /Database.*writable file/,
      /IndexedDB.*IO error/,
      /QuotaExceededError.*storage/
    ];
    this.suppressedErrorCount = 0;
    this.maxSuppressedErrors = 50; // Prevent infinite suppression
    this.lastErrorTime = 0;
    this.errorThrottleMs = 1000; // Throttle similar errors
  }

  /**
   * Initialize the I/O error handler
   */
  init() {
    if (typeof window === 'undefined') return;

    // Override console.error to filter out browser-internal I/O errors
    console.error = (...args) => {
      const errorMessage = args.join(' ');
      
      if (this.shouldSuppressError(errorMessage)) {
        this.suppressedErrorCount++;
        
        // Log suppressed errors to a different level for debugging
        if (process.env.NODE_ENV === 'development') {
          console.debug('🔇 Suppressed browser I/O error:', errorMessage);
        }
        
        // Show periodic summary instead of flooding console
        if (this.suppressedErrorCount % 10 === 0) {
//           // console.warn(`🔇 Suppressed ${this.suppressedErrorCount} browser I/O errors. These are Chrome internal errors and don't affect app functionality.`);
        }
        return;
      }

      // Call original console.error for non-suppressed errors
      this.originalConsoleError.apply(console, args);
    };

    // Add window error handlers
    window.addEventListener('error', this.handleWindowError.bind(this));
    window.addEventListener('unhandledrejection', this.handleUnhandledRejection.bind(this));

//     // console.log('🛡️ Browser I/O error handler initialized');
  }

  /**
   * Check if an error should be suppressed
   */
  shouldSuppressError(errorMessage) {
    // Prevent infinite suppression
    if (this.suppressedErrorCount >= this.maxSuppressedErrors) {
      return false;
    }

    // Throttle similar errors
    const now = Date.now();
    if (now - this.lastErrorTime < this.errorThrottleMs) {
      return true; // Suppress during throttle period
    }

    // Check against known patterns
    const shouldSuppress = this.errorPatterns.some(pattern => 
      pattern.test(errorMessage)
    );

    if (shouldSuppress) {
      this.lastErrorTime = now;
    }

    return shouldSuppress;
  }

  /**
   * Handle window error events
   */
  handleWindowError(event) {
    const errorMessage = event.error?.message || event.message || '';
    
    if (this.shouldSuppressError(errorMessage)) {
      event.preventDefault();
      event.stopPropagation();
      return false;
    }
  }

  /**
   * Handle unhandled promise rejections
   */
  handleUnhandledRejection(event) {
    const errorMessage = event.reason?.message || event.reason?.toString() || '';
    
    if (this.shouldSuppressError(errorMessage)) {
      event.preventDefault();
      return false;
    }
  }

  /**
   * Restore original console.error (for cleanup)
   */
  destroy() {
    if (typeof window === 'undefined') return;
    
    console.error = this.originalConsoleError;
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleUnhandledRejection);
    
    if (this.suppressedErrorCount > 0) {
//       // console.log(`🛡️ Browser I/O error handler removed. Suppressed ${this.suppressedErrorCount} total errors.`);
    }
  }

  /**
   * Get statistics about suppressed errors
   */
  getStats() {
    return {
      suppressedErrorCount: this.suppressedErrorCount,
      maxSuppressedErrors: this.maxSuppressedErrors,
      isActive: console.error !== this.originalConsoleError
    };
  }
}

// Create singleton instance
const browserIOHandler = new BrowserIOHandler();

// Auto-initialize in browser environment
if (typeof window !== 'undefined') {
  // Initialize after DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => browserIOHandler.init());
  } else {
    browserIOHandler.init();
  }
}

export default browserIOHandler;
