class AuthMonitor {
  constructor() {
    this.events = [];
    this.suspiciousActivity = new Map();
    this.metrics = {
      totalSessions: 0,
      activeSessions: 0,
      failedAttempts: 0,
      successfulLogins: 0,
      tokenRefreshes: 0,
      suspiciousEvents: 0
    };
    
    this.limits = {
      loginAttempts: { window: 15 * 60 * 1000, max: 5 },
      tokenRefresh: { window: 60 * 1000, max: 10 }
    };
    
    this.userActivity = new Map();
  }

  logEvent(event) {
    const logEntry = {
      ...event,
      timestamp: new Date().toISOString(),
      id: `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.events.push(logEntry);
    this.updateMetrics(event);
    this.checkSuspiciousActivity(event);

    if (this.events.length > 1000) {
      this.events.shift();
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('🔐 Auth Event:', logEntry);
    }
  }

  updateMetrics(event) {
    const metricUpdates = {
      'signin_success': () => {
        this.metrics.successfulLogins++;
        this.metrics.activeSessions++;
        this.metrics.totalSessions++;
      },
      'signin_failure': () => this.metrics.failedAttempts++,
      'signout': () => this.metrics.activeSessions = Math.max(0, this.metrics.activeSessions - 1),
      'token_refresh': () => this.metrics.tokenRefreshes++,
      'suspicious_activity': () => this.metrics.suspiciousEvents++
    };

    metricUpdates[event.type]?.();
  }

  checkSuspiciousActivity(event) {
    const userId = event.userId || event.clientId || 'unknown';
    const now = Date.now();

    if (!this.userActivity.has(userId)) {
      this.userActivity.set(userId, {
        loginAttempts: [],
        tokenRefreshes: [],
        lastActivity: now,
        flagged: false
      });
    }

    const user = this.userActivity.get(userId);

    if (event.type === 'signin_failure') {
      user.loginAttempts.push(now);
      user.loginAttempts = user.loginAttempts.filter(time => 
        time > now - this.limits.loginAttempts.window
      );
      
      if (user.loginAttempts.length > this.limits.loginAttempts.max) {
        this.flagSuspiciousActivity(userId, 'excessive_login_attempts', {
          attempts: user.loginAttempts.length,
          timeWindow: this.limits.loginAttempts.window / 1000 / 60
        });
      }
    }

    if (event.type === 'token_refresh') {
      user.tokenRefreshes.push(now);
      user.tokenRefreshes = user.tokenRefreshes.filter(time => 
        time > now - this.limits.tokenRefresh.window
      );
      
      if (user.tokenRefreshes.length > this.limits.tokenRefresh.max) {
        this.flagSuspiciousActivity(userId, 'excessive_token_refresh', {
          refreshes: user.tokenRefreshes.length,
          timeWindow: this.limits.tokenRefresh.window / 1000
        });
      }
    }

    this.detectUnusualPatterns(userId, event);
    user.lastActivity = now;
  }

  detectUnusualPatterns(userId, event) {
    if (event.type === 'signin_success' && event.deviceInfo) {
      const recentSignins = this.events
        .filter(e => 
          e.userId === userId && 
          e.type === 'signin_success' && 
          Date.now() - new Date(e.timestamp).getTime() < 5 * 60 * 1000
        );

      if (recentSignins.length > 1) {
        this.flagSuspiciousActivity(userId, 'multiple_concurrent_sessions', {
          sessions: recentSignins.length,
          devices: recentSignins.map(s => s.deviceInfo)
        });
      }
    }

    if (event.location && event.type === 'signin_success') {
      const lastLocation = this.getLastKnownLocation(userId);
      if (lastLocation && this.calculateDistance(event.location, lastLocation) > 1000) {
        this.flagSuspiciousActivity(userId, 'geographic_anomaly', {
          currentLocation: event.location,
          lastKnownLocation: lastLocation
        });
      }
    }
  }

  flagSuspiciousActivity(userId, type, details) {
    const severity = {
      'excessive_login_attempts': 'medium',
      'excessive_token_refresh': 'low',
      'multiple_concurrent_sessions': 'medium',
      'geographic_anomaly': 'high',
      'token_manipulation': 'high',
      'session_hijacking': 'critical'
    }[type] || 'low';

    const suspiciousEvent = {
      userId,
      type,
      details,
      timestamp: new Date().toISOString(),
      severity
    };

    this.suspiciousActivity.set(`${userId}_${type}_${Date.now()}`, suspiciousEvent);

    this.logEvent({
      type: 'suspicious_activity',
      userId,
      subType: type,
      details,
      severity
    });

    if (severity === 'high') {
      console.warn('🚨 Security Alert:', suspiciousEvent);
    }
  }

  getMetrics() {
    return {
      ...this.metrics,
      activeUsers: this.userActivity.size,
      suspiciousActivityCount: this.suspiciousActivity.size,
      recentEvents: this.events.slice(-10)
    };
  }

  getUserActivity(userId) {
    const user = this.userActivity.get(userId);
    if (!user) return null;

    const userEvents = this.events.filter(event => event.userId === userId);
    
    return {
      ...user,
      eventHistory: userEvents.slice(-20),
      riskScore: this.calculateRiskScore(userId)
    };
  }

  calculateRiskScore(userId) {
    const user = this.userActivity.get(userId);
    if (!user) return 0;

    let score = user.loginAttempts.length * 10;

    const userSuspiciousEvents = Array.from(this.suspiciousActivity.values())
      .filter(event => event.userId === userId);
    
    const severityScores = { low: 5, medium: 15, high: 30, critical: 50 };
    userSuspiciousEvents.forEach(event => {
      score += severityScores[event.severity] || 0;
    });

    return Math.min(score, 100);
  }

  getLastKnownLocation(userId) {
    const userEvents = this.events
      .filter(e => e.userId === userId && e.location)
      .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    
    return userEvents[0]?.location || null;
  }

  calculateDistance(loc1, loc2) {
    return Math.abs(loc1.lat - loc2.lat) + Math.abs(loc1.lng - loc2.lng);
  }

  cleanup() {
    const oneWeekAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);

    this.events = this.events.filter(event => 
      new Date(event.timestamp).getTime() > oneWeekAgo
    );

    for (const [userId, user] of this.userActivity.entries()) {
      if (user.lastActivity < oneWeekAgo) {
        this.userActivity.delete(userId);
      }
    }

    for (const [key, event] of this.suspiciousActivity.entries()) {
      if (new Date(event.timestamp).getTime() < oneWeekAgo) {
        this.suspiciousActivity.delete(key);
      }
    }
  }

  exportData() {
    return {
      events: this.events,
      metrics: this.getMetrics(),
      suspiciousActivity: Array.from(this.suspiciousActivity.values()),
      userActivity: Array.from(this.userActivity.entries()).map(([userId, user]) => ({
        userId,
        ...user,
        riskScore: this.calculateRiskScore(userId)
      }))
    };
  }
}

export default new AuthMonitor(); 