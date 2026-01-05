/**
 * Authentication Functions
 * Login, Register (via invitation), Token refresh
 */

const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const db = require('../shared/database');
const auth = require('../shared/auth');

// POST /api/auth/login
app.http('login', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/login',
    handler: async (request, context) => {
        try {
            const body = await request.json();
            const { email, password } = body;
            
            if (!email || !password) {
                return { status: 400, jsonBody: { error: 'Email and password are required' } };
            }
            
            // Test basic response first
            context.log('Attempting login for:', email);
            
            // Initialize database
            await db.initDatabase();
            context.log('Database initialized');
            
            // Find user
            const user = await db.getUserByEmail(email);
            context.log('User lookup result:', user ? 'found' : 'not found');
            
            if (!user) {
                return { status: 401, jsonBody: { error: 'Invalid email or password' } };
            }
            
            if (user.status !== 'active') {
                return { status: 403, jsonBody: { error: 'Account is disabled' } };
            }
            
            // Verify password using bcrypt directly
            const bcrypt = require('bcryptjs');
            const isValid = await bcrypt.compare(password, user.passwordHash);
            context.log('Password valid:', isValid);
            
            if (!isValid) {
                return { status: 401, jsonBody: { error: 'Invalid email or password' } };
            }
            
            // Generate token using jwt directly
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = (process.env.JWT_SECRET || 'development-secret-change-me').trim();
            context.log('JWT_SECRET first 8 chars:', JWT_SECRET.substring(0, 8));
            context.log('JWT_SECRET length:', JWT_SECRET.length);
            const token = jwt.sign({
                userId: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }, JWT_SECRET, { expiresIn: '7d' });
            
            // Return user info (without password) and token
            const { passwordHash, ...safeUser } = user;
            
            return {
                status: 200,
                jsonBody: {
                    success: true,
                    user: safeUser,
                    token,
                    debugSecretPrefix: JWT_SECRET.substring(0, 8),
                    debugSecretLen: JWT_SECRET.length
                }
            };
            
        } catch (error) {
            context.error('Login error:', error.message, error.stack);
            return {
                status: 500,
                jsonBody: { error: 'Internal server error', details: error.message, stack: error.stack }
            };
        }
    }
});

// POST /api/auth/register - Register via invitation token
app.http('register', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/register',
    handler: async (request, context) => {
        try {
            await db.initDatabase();
            
            const body = await request.json();
            const { token, name, password } = body;
            
            if (!token || !name || !password) {
                return auth.errorResponse(400, 'Token, name, and password are required');
            }
            
            if (password.length < 8) {
                return auth.errorResponse(400, 'Password must be at least 8 characters');
            }
            
            // Find invitation
            const invitation = await db.getInvitationByToken(token);
            
            if (!invitation) {
                return auth.errorResponse(400, 'Invalid or expired invitation token');
            }
            
            // Check expiration
            if (new Date(invitation.expiresAt) < new Date()) {
                return auth.errorResponse(400, 'Invitation has expired');
            }
            
            // Check if user already exists
            const existingUser = await db.getUserByEmail(invitation.email);
            if (existingUser) {
                return auth.errorResponse(400, 'An account with this email already exists');
            }
            
            // Create user
            const passwordHash = await auth.hashPassword(password);
            
            const user = await db.createUser({
                id: uuidv4(),
                email: invitation.email,
                name,
                passwordHash,
                role: invitation.role,
                organizationId: invitation.organizationId,
                assignedProjects: invitation.projectIds || []
            });
            
            // Mark invitation as used
            await db.markInvitationUsed(invitation.id, invitation.email);
            
            // If projects were assigned, update them
            if (invitation.projectIds && invitation.projectIds.length > 0) {
                for (const projectId of invitation.projectIds) {
                    const project = await db.getProjectById(projectId, invitation.organizationId);
                    if (project) {
                        const assignedClients = [...(project.assignedClients || []), user.id];
                        await db.updateProject(projectId, invitation.organizationId, { assignedClients });
                    }
                }
            }
            
            // Generate token
            const authToken = auth.generateToken(user);
            
            return auth.successResponse({
                user,
                token: authToken
            }, 201);
            
        } catch (error) {
            context.error('Registration error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// GET /api/auth/me - Get current user info
app.http('me', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'auth/me',
    handler: async (request, context) => {
        try {
            // Debug: Check headers directly
            let authHeader = null;
            const headers = {};
            for (const [key, value] of request.headers.entries()) {
                headers[key] = value;
                if (key.toLowerCase() === 'authorization') {
                    authHeader = value;
                }
            }
            
            if (!authHeader) {
                return { status: 401, jsonBody: { error: 'No Authorization header', headers } };
            }
            
            // Extract token from "Bearer <token>"
            const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : authHeader;
            
            // Verify token directly
            const jwt = require('jsonwebtoken');
            const JWT_SECRET = (process.env.JWT_SECRET || 'development-secret-change-me').trim();
            context.log('ME - JWT_SECRET first 8 chars:', JWT_SECRET.substring(0, 8));
            context.log('ME - JWT_SECRET length:', JWT_SECRET.length);
            
            let userPayload;
            try {
                userPayload = jwt.verify(token, JWT_SECRET);
            } catch (jwtError) {
                return { status: 401, jsonBody: { error: 'Invalid token', details: jwtError.message, debugSecretPrefix: JWT_SECRET.substring(0, 8), debugSecretLen: JWT_SECRET.length } };
            }
            
            await db.initDatabase();
            
            const user = await db.getUserById(userPayload.userId);
            
            if (!user) {
                return { status: 404, jsonBody: { error: 'User not found' } };
            }
            
            const { passwordHash, ...safeUser } = user;
            
            return { status: 200, jsonBody: { user: safeUser, debugSecretPrefix: JWT_SECRET.substring(0, 8) } };
            
        } catch (error) {
            context.error('Get user error:', error);
            return { status: 500, jsonBody: { error: 'Internal server error', details: error.message } };
        }
    }
});

// POST /api/auth/refresh - Refresh token
app.http('refreshToken', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/refresh',
    handler: async (request, context) => {
        try {
            const userPayload = auth.authenticateRequest(request);
            
            if (!userPayload) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            await db.initDatabase();
            
            const user = await db.getUserById(userPayload.userId);
            
            if (!user || !user.isActive) {
                return auth.errorResponse(401, 'Invalid user');
            }
            
            // Generate new token
            const token = auth.generateToken(user);
            
            const { passwordHash, ...safeUser } = user;
            
            return auth.successResponse({
                user: safeUser,
                token
            });
            
        } catch (error) {
            context.error('Token refresh error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// POST /api/auth/validate-invite - Validate invitation token (for signup page)
app.http('validateInvite', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'auth/validate-invite',
    handler: async (request, context) => {
        try {
            await db.initDatabase();
            
            const body = await request.json();
            const { token } = body;
            
            if (!token) {
                return auth.errorResponse(400, 'Token is required');
            }
            
            const invitation = await db.getInvitationByToken(token);
            
            if (!invitation) {
                return auth.errorResponse(400, 'Invalid invitation token');
            }
            
            if (new Date(invitation.expiresAt) < new Date()) {
                return auth.errorResponse(400, 'Invitation has expired');
            }
            
            // Return invitation info (without sensitive data)
            return auth.successResponse({
                valid: true,
                email: invitation.email,
                role: invitation.role,
                invitedBy: invitation.invitedByName,
                expiresAt: invitation.expiresAt
            });
            
        } catch (error) {
            context.error('Validate invite error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});
