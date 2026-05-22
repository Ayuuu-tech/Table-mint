const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * JWT Secret Rotation Service
 * Manages JWT secret versioning and rotation for security
 */

class JWTSecretManager {
  constructor() {
    this.secretsFile = path.join(__dirname, '../../.secrets.json');
    this.secrets = this.loadSecrets();
    this.currentVersion = this.secrets.currentVersion || 0;
    this.validateSecrets();
  }

  /**
   * Load secrets from secure file
   */
  loadSecrets() {
    try {
      if (fs.existsSync(this.secretsFile)) {
        const data = fs.readFileSync(this.secretsFile, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error('Error loading secrets:', error.message);
    }
    
    return {
      currentVersion: 0,
      secrets: {},
      rotationHistory: []
    };
  }

  /**
   * Save secrets to file (should be restricted to root/secure permissions)
   */
  saveSecrets() {
    try {
      fs.writeFileSync(this.secretsFile, JSON.stringify(this.secrets, null, 2));
      // Set restrictive permissions (read/write for owner only)
      fs.chmodSync(this.secretsFile, 0o600);
      console.log('✅ Secrets saved securely');
    } catch (error) {
      console.error('❌ Error saving secrets:', error.message);
    }
  }

  /**
   * Validate JWT secrets exist and are properly configured
   */
  validateSecrets() {
    // Fallback to environment variable if no secrets file
    if (Object.keys(this.secrets.secrets || {}).length === 0) {
      const envSecret = process.env.JWT_SECRET;
      if (!envSecret) {
        throw new Error('JWT_SECRET environment variable not set and no secrets file found');
      }

      this.secrets = {
        currentVersion: 0,
        secrets: {
          0: {
            secret: envSecret,
            createdAt: new Date().toISOString(),
            source: 'environment'
          }
        },
        rotationHistory: []
      };
      this.currentVersion = 0;
    }
  }

  /**
   * Generate new JWT secret
   */
  generateNewSecret() {
    return crypto.randomBytes(64).toString('hex');
  }

  /**
   * Rotate JWT secret
   * Creates new secret while keeping old ones for verification of existing tokens
   */
  rotateSecret() {
    const newVersion = this.currentVersion + 1;
    const newSecret = this.generateNewSecret();

    this.secrets.secrets[newVersion] = {
      secret: newSecret,
      createdAt: new Date().toISOString(),
      version: newVersion
    };

    this.secrets.rotationHistory.push({
      version: newVersion,
      timestamp: new Date().toISOString(),
      action: 'rotation'
    });

    // Keep only last 5 versions for backward compatibility
    const versions = Object.keys(this.secrets.secrets)
      .map(Number)
      .sort((a, b) => b - a);

    if (versions.length > 5) {
      const oldestToKeep = versions[4];
      Object.keys(this.secrets.secrets).forEach(v => {
        if (Number(v) < oldestToKeep) {
          delete this.secrets.secrets[v];
        }
      });
    }

    this.currentVersion = newVersion;
    this.saveSecrets();

    return {
      version: newVersion,
      secret: newSecret,
      expiresAt: this.getRotationSchedule()
    };
  }

  /**
   * Get current active secret
   */
  getActiveSecret() {
    return this.secrets.secrets[this.currentVersion]?.secret;
  }

  /**
   * Get all valid secrets for verification (current + recent past versions)
   */
  getValidSecrets() {
    return Object.values(this.secrets.secrets).map(v => v.secret);
  }

  /**
   * Verify JWT with fallback to older secrets
   */
  verifyJWT(token, options = {}) {
    const validSecrets = this.getValidSecrets();

    for (const secret of validSecrets) {
      try {
        const decoded = jwt.verify(token, secret, options);
        return decoded;
      } catch (error) {
        // Continue to next secret
      }
    }

    throw new Error('Invalid or expired token');
  }

  /**
   * Sign JWT with current secret
   */
  signJWT(payload, options = {}) {
    const activeSecret = this.getActiveSecret();
    if (!activeSecret) {
      throw new Error('No active JWT secret configured');
    }

    const defaultOptions = {
      expiresIn: '7d',
      ...options
    };

    return jwt.sign(payload, activeSecret, defaultOptions);
  }

  /**
   * Get rotation schedule (when to rotate next)
   */
  getRotationSchedule() {
    // Rotate every 30 days
    const lastRotation = new Date(this.secrets.secrets[this.currentVersion].createdAt);
    const nextRotation = new Date(lastRotation.getTime() + 30 * 24 * 60 * 60 * 1000);
    return nextRotation.toISOString();
  }

  /**
   * Get secret metadata for monitoring
   */
  getMetadata() {
    return {
      currentVersion: this.currentVersion,
      secretsCount: Object.keys(this.secrets.secrets).length,
      activeSecretAge: this.getSecretAge(this.currentVersion),
      nextRotation: this.getRotationSchedule(),
      rotationHistory: this.secrets.rotationHistory.slice(-10) // Last 10 rotations
    };
  }

  /**
   * Get age of secret in days
   */
  getSecretAge(version) {
    const createdAt = new Date(this.secrets.secrets[version].createdAt);
    const now = new Date();
    const ageDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
    return ageDays;
  }

  /**
   * Check if rotation is needed (30 days old)
   */
  shouldRotate() {
    return this.getSecretAge(this.currentVersion) >= 30;
  }
}

// Singleton instance
let secretManager = null;

/**
 * Get or initialize the secret manager
 */
function getSecretManager() {
  if (!secretManager) {
    secretManager = new JWTSecretManager();
  }
  return secretManager;
}

/**
 * Middleware to check and auto-rotate secrets if needed
 */
const autoRotateSecrets = (req, res, next) => {
  try {
    const manager = getSecretManager();
    
    if (manager.shouldRotate()) {
      console.log('🔄 Auto-rotating JWT secret (30+ days old)');
      manager.rotateSecret();
    }
    
    next();
  } catch (error) {
    console.error('Error in secret rotation middleware:', error);
    next();
  }
};

module.exports = {
  JWTSecretManager,
  getSecretManager,
  autoRotateSecrets
};
