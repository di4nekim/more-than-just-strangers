/**
 * AWS Parameter Store utility for secure credential management
 * 
 * Provides cached retrieval of Firebase credentials from Parameter Store
 * with environment-based hierarchy and proper error handling.
 */

const { SSMClient, GetParametersCommand } = require('@aws-sdk/client-ssm');

class ParameterStore {
    constructor() {
        this.client = new SSMClient({ region: process.env.AWS_REGION || 'us-east-1' });
        this.cache = new Map();
        this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
    }

    /**
     * Get Firebase credentials for the current environment
     * @param {string} environment - Environment name (development, staging, production)
     * @returns {Promise<Object>} Firebase credentials object
     */
    async getFirebaseCredentials(environment = 'development') {
        const cacheKey = `firebase-${environment}`;
        
        // Check cache first
        const cached = this.cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.data;
        }

        try {
            const parameterNames = [
                `/mtjs/${environment}/firebase/project-id`,
                `/mtjs/${environment}/firebase/private-key`,
                `/mtjs/${environment}/firebase/client-email`
            ];

            const command = new GetParametersCommand({
                Names: parameterNames,
                WithDecryption: true
            });

            const response = await this.client.send(command);
            
            if (!response.Parameters || response.Parameters.length === 0) {
                throw new Error(`No Firebase parameters found for environment: ${environment}`);
            }

            // Check for missing parameters
            if (response.InvalidParameters && response.InvalidParameters.length > 0) {
                throw new Error(`Missing Firebase parameters: ${response.InvalidParameters.join(', ')}`);
            }

            // Transform parameters into credentials object
            const credentials = {};
            response.Parameters.forEach(param => {
                const key = param.Name.split('/').pop(); // Get last part of parameter name
                switch (key) {
                    case 'project-id':
                        credentials.projectId = param.Value;
                        break;
                    case 'private-key':
                        credentials.privateKey = param.Value;
                        break;
                    case 'client-email':
                        credentials.clientEmail = param.Value;
                        break;
                }
            });

            // Validate all required credentials are present
            const requiredFields = ['projectId', 'privateKey', 'clientEmail'];
            const missingFields = requiredFields.filter(field => !credentials[field]);
            
            if (missingFields.length > 0) {
                throw new Error(`Missing Firebase credential fields: ${missingFields.join(', ')}`);
            }

            // Cache the result
            this.cache.set(cacheKey, {
                data: credentials,
                timestamp: Date.now()
            });

            console.log(`Firebase credentials loaded successfully for environment: ${environment}`);
            return credentials;

        } catch (error) {
            console.error('Failed to retrieve Firebase credentials from Parameter Store:', error);
            throw new Error(`Parameter Store retrieval failed: ${error.message}`);
        }
    }

    /**
     * Clear cached credentials (useful for testing or forced refresh)
     * @param {string} environment - Optional environment to clear, clears all if not specified
     */
    clearCache(environment = null) {
        if (environment) {
            this.cache.delete(`firebase-${environment}`);
        } else {
            this.cache.clear();
        }
    }

    /**
     * Get a single parameter value
     * @param {string} parameterName - Full parameter path
     * @param {boolean} decrypt - Whether to decrypt SecureString parameters
     * @returns {Promise<string>} Parameter value
     */
    async getParameter(parameterName, decrypt = true) {
        try {
            const command = new GetParametersCommand({
                Names: [parameterName],
                WithDecryption: decrypt
            });

            const response = await this.client.send(command);
            
            if (!response.Parameters || response.Parameters.length === 0) {
                throw new Error(`Parameter not found: ${parameterName}`);
            }

            return response.Parameters[0].Value;
        } catch (error) {
            console.error(`Failed to retrieve parameter ${parameterName}:`, error);
            throw error;
        }
    }
}

// Export singleton instance
module.exports = new ParameterStore();
