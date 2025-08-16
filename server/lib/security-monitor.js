import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, QueryCommand, ScanCommand } from "@aws-sdk/lib-dynamodb";

const dynamoClient = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const SECURITY_TABLE = process.env.SECURITY_AUDIT_TABLE || 'SecurityAuditLog';
const USER_ACTIVITY_TABLE = process.env.USER_ACTIVITY_TABLE || 'UserActivityLog';

class SecurityMonitor {
  /**
   * Get security events by type and time range
   */
  async getSecurityEvents(eventType, startTime, endTime, limit = 50) {
    const params = {
      TableName: SECURITY_TABLE,
      KeyConditionExpression: 'pk = :pk AND sk BETWEEN :start AND :end',
      ExpressionAttributeValues: {
        ':pk': `EVENT#${eventType}`,
        ':start': startTime || 0,
        ':end': endTime || Date.now()
      },
      Limit: limit,
      ScanIndexForward: false
    };
    
    const result = await dynamoClient.send(new QueryCommand(params));
    return result.Items || [];
  }
  
  /**
   * Get security metrics for dashboard
   */
  async getSecurityMetrics(timeRange = 24 * 60 * 60 * 1000) { // 24 hours default
    const now = Date.now();
    const startTime = now - timeRange;
    
    const [signupEvents, authEvents, blockedEvents] = await Promise.all([
      this.getSecurityEvents('SIGNUP_SUCCESS', startTime, now, 1000),
      this.getSecurityEvents('AUTH_SUCCESS', startTime, now, 1000),
      this.getSecurityEvents('SIGNUP_BLOCKED', startTime, now, 1000)
    ]);
    
    const metrics = {
      totalSignups: signupEvents.length,
      totalLogins: authEvents.length,
      blockedAttempts: blockedEvents.length,
      securityScore: this.calculateSecurityScore(signupEvents, authEvents, blockedEvents),
      threatAnalysis: this.analyzeThreatPatterns(blockedEvents),
      anomalies: this.detectAnomalousActivity(authEvents)
    };
    
    return metrics;
  }
  
  /**
   * Calculate overall security score (0-100)
   */
  calculateSecurityScore(signupEvents, authEvents, blockedEvents) {
    const totalEvents = signupEvents.length + authEvents.length;
    if (totalEvents === 0) return 100;
    
    const blockRate = blockedEvents.length / totalEvents;
    const baseScore = 100;
    
    // Deduct points for high block rates (indicates attacks)
    let score = baseScore - (blockRate * 500); // 50 points per 10% block rate
    
    // Deduct for anomalies in auth events
    const anomalyCount = authEvents.filter(event => 
      event.data?.anomalies && event.data.anomalies.length > 0
    ).length;
    
    const anomalyRate = anomalyCount / (authEvents.length || 1);
    score -= (anomalyRate * 200); // 20 points per 10% anomaly rate
    
    return Math.max(0, Math.min(100, Math.round(score)));
  }
  
  /**
   * Analyze threat patterns from blocked events
   */
  analyzeThreatPatterns(blockedEvents) {
    const patterns = {
      rateLimitViolations: 0,
      fraudAttempts: 0,
      blockedEmails: 0,
      topThreatIPs: {},
      threatTypes: {}
    };
    
    blockedEvents.forEach(event => {
      const reason = event.data?.reason;
      const ip = event.data?.clientIP;
      
      if (reason === 'RATE_LIMIT_EXCEEDED') {
        patterns.rateLimitViolations++;
      } else if (reason === 'MANUAL_REVIEW_REQUIRED') {
        patterns.fraudAttempts++;
      } else if (reason === 'EMAIL_PROVIDER_BLOCKED') {
        patterns.blockedEmails++;
      }
      
      if (ip) {
        patterns.topThreatIPs[ip] = (patterns.topThreatIPs[ip] || 0) + 1;
      }
      
      if (reason) {
        patterns.threatTypes[reason] = (patterns.threatTypes[reason] || 0) + 1;
      }
    });
    
    return patterns;
  }
  
  /**
   * Detect anomalous activity patterns
   */
  detectAnomalousActivity(authEvents) {
    const anomalies = {
      newIPs: 0,
      newDevices: 0,
      rapidLogins: 0,
      geographicAnomalies: 0
    };
    
    authEvents.forEach(event => {
      const eventAnomalies = event.data?.anomalies || [];
      
      eventAnomalies.forEach(anomaly => {
        switch (anomaly.type) {
          case 'NEW_IP_ADDRESS':
            anomalies.newIPs++;
            break;
          case 'NEW_DEVICE':
            anomalies.newDevices++;
            break;
          case 'RAPID_LOGINS':
            anomalies.rapidLogins++;
            break;
          case 'GEOGRAPHIC_ANOMALY':
            anomalies.geographicAnomalies++;
            break;
        }
      });
    });
    
    return anomalies;
  }
  
  /**
   * Get user risk profile
   */
  async getUserRiskProfile(userId) {
    const now = Date.now();
    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
    
    const params = {
      TableName: USER_ACTIVITY_TABLE,
      KeyConditionExpression: 'userId = :userId AND sk > :startTime',
      ExpressionAttributeValues: {
        ':userId': userId,
        ':startTime': thirtyDaysAgo
      },
      Limit: 100
    };
    
    const result = await dynamoClient.send(new QueryCommand(params));
    const activities = result.Items || [];
    
    const riskFactors = [];
    
    // Check for multiple IP addresses
    const uniqueIPs = new Set(activities.map(a => a.clientIP).filter(Boolean));
    if (uniqueIPs.size > 10) {
      riskFactors.push({
        type: 'MULTIPLE_IPS',
        value: uniqueIPs.size,
        severity: 'MEDIUM'
      });
    }
    
    // Check for rapid location changes
    const recentActivities = activities.slice(0, 10);
    const recentIPs = recentActivities.map(a => a.clientIP).filter(Boolean);
    const uniqueRecentIPs = new Set(recentIPs);
    
    if (uniqueRecentIPs.size > 3) {
      riskFactors.push({
        type: 'RAPID_LOCATION_CHANGES',
        value: uniqueRecentIPs.size,
        severity: 'HIGH'
      });
    }
    
    // Calculate risk score
    const riskScore = Math.min(100, riskFactors.reduce((score, factor) => {
      return score + (factor.severity === 'HIGH' ? 30 : factor.severity === 'MEDIUM' ? 15 : 5);
    }, 0));
    
    return {
      userId,
      riskScore,
      riskFactors,
      totalActivities: activities.length,
      uniqueIPs: uniqueIPs.size,
      lastActivity: activities[0]?.timestamp
    };
  }
  
  /**
   * Generate security report
   */
  async generateSecurityReport(timeRange = 7 * 24 * 60 * 60 * 1000) { // 7 days default
    const metrics = await this.getSecurityMetrics(timeRange);
    const now = new Date();
    const startDate = new Date(now.getTime() - timeRange);
    
    return {
      reportGenerated: now.toISOString(),
      timeRange: {
        start: startDate.toISOString(),
        end: now.toISOString(),
        durationHours: timeRange / (60 * 60 * 1000)
      },
      summary: {
        securityScore: metrics.securityScore,
        totalEvents: metrics.totalSignups + metrics.totalLogins,
        threatEvents: metrics.blockedAttempts,
        anomalies: Object.values(metrics.anomalies).reduce((sum, count) => sum + count, 0)
      },
      metrics,
      recommendations: this.generateSecurityRecommendations(metrics)
    };
  }
  
  /**
   * Generate security recommendations based on metrics
   */
  generateSecurityRecommendations(metrics) {
    const recommendations = [];
    
    if (metrics.securityScore < 70) {
      recommendations.push({
        priority: 'HIGH',
        category: 'OVERALL_SECURITY',
        message: 'Security score is below acceptable threshold. Immediate review required.'
      });
    }
    
    if (metrics.blockedAttempts > metrics.totalLogins * 0.1) {
      recommendations.push({
        priority: 'HIGH',
        category: 'ATTACK_DETECTION',
        message: 'High number of blocked attempts detected. Consider implementing additional security measures.'
      });
    }
    
    if (metrics.anomalies.rapidLogins > 0) {
      recommendations.push({
        priority: 'MEDIUM',
        category: 'CREDENTIAL_STUFFING',
        message: 'Rapid login attempts detected. Consider implementing CAPTCHA or additional rate limiting.'
      });
    }
    
    if (metrics.anomalies.newIPs > metrics.totalLogins * 0.5) {
      recommendations.push({
        priority: 'LOW',
        category: 'USER_BEHAVIOR',
        message: 'High number of new IP addresses. Consider implementing email notifications for new device logins.'
      });
    }
    
    return recommendations;
  }
}

export default new SecurityMonitor(); 