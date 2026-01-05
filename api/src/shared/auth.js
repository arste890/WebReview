/**
 * Authentication Utilities
 * JWT token management and password hashing
 */

const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const JWT_SECRET = process.env.JWT_SECRET || 'development-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

/**
 * Hash a password
 */
async function hashPassword(password) {
    const salt = await bcrypt.genSalt(12);
    return bcrypt.hash(password, salt);
}

/**
 * Verify a password against its hash
 */
async function verifyPassword(password, hash) {
    return bcrypt.compare(password, hash);
}

/**
 * Generate JWT token for a user
 */
function generateToken(user) {
    const payload = {
        userId: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        organizationId: user.organizationId
    };
    
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}

/**
 * Verify and decode JWT token
 */
function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
}

/**
 * Extract token from request headers
 */
function extractToken(request) {
    const authHeader = request.headers.get('authorization') || request.headers.get('Authorization');
    
    if (!authHeader) {
        return null;
    }
    
    // Support both "Bearer token" and just "token"
    if (authHeader.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }
    
    return authHeader;
}

/**
 * Middleware to authenticate request
 * Returns user payload or null
 */
function authenticateRequest(request) {
    const token = extractToken(request);
    
    if (!token) {
        return null;
    }
    
    return verifyToken(token);
}

/**
 * Check if user has required role
 */
function hasRole(user, requiredRoles) {
    if (!user || !user.role) return false;
    
    if (typeof requiredRoles === 'string') {
        requiredRoles = [requiredRoles];
    }
    
    // Admin has access to everything
    if (user.role === 'admin') return true;
    
    return requiredRoles.includes(user.role);
}

/**
 * Generate a secure random token for invitations
 */
function generateInviteToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let token = '';
    for (let i = 0; i < 64; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return token;
}

/**
 * Create response helper
 */
function createResponse(statusCode, body, headers = {}) {
    return {
        status: statusCode,
        headers: {
            'Content-Type': 'application/json',
            ...headers
        },
        body: JSON.stringify(body)
    };
}

/**
 * Create error response
 */
function errorResponse(statusCode, message, details = null) {
    const body = { error: message };
    if (details) body.details = details;
    return createResponse(statusCode, body);
}

/**
 * Create success response
 */
function successResponse(data, statusCode = 200) {
    return createResponse(statusCode, data);
}

module.exports = {
    hashPassword,
    verifyPassword,
    generateToken,
    verifyToken,
    extractToken,
    authenticateRequest,
    hasRole,
    generateInviteToken,
    createResponse,
    errorResponse,
    successResponse
};
