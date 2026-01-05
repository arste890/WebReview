/**
 * User Management Functions
 * Invite users, manage roles, list users
 */

const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const db = require('../shared/database');
const auth = require('../shared/auth');
const email = require('../shared/email');

// POST /api/users/invite - Invite a new user (developers only)
app.http('inviteUser', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'users/invite',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            if (!auth.hasRole(user, ['developer', 'admin'])) {
                return auth.errorResponse(403, 'Only developers can invite users');
            }
            
            await db.initDatabase();
            
            const body = await request.json();
            const { email: inviteEmail, role, projectIds } = body;
            
            if (!inviteEmail) {
                return auth.errorResponse(400, 'Email is required');
            }
            
            // Validate email format
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(inviteEmail)) {
                return auth.errorResponse(400, 'Invalid email format');
            }
            
            // Check if user already exists
            const existingUser = await db.getUserByEmail(inviteEmail);
            if (existingUser) {
                return auth.errorResponse(400, 'A user with this email already exists');
            }
            
            // Check for existing pending invitation
            const existingInvite = await db.getInvitationByEmail(inviteEmail);
            if (existingInvite && !existingInvite.isUsed && new Date(existingInvite.expiresAt) > new Date()) {
                return auth.errorResponse(400, 'An active invitation already exists for this email');
            }
            
            // Validate role
            const allowedRoles = ['client', 'developer'];
            const userRole = role || 'client';
            if (!allowedRoles.includes(userRole)) {
                return auth.errorResponse(400, 'Invalid role');
            }
            
            // Only admins can invite developers
            if (userRole === 'developer' && user.role !== 'admin') {
                return auth.errorResponse(403, 'Only admins can invite developers');
            }
            
            // Create invitation
            const invitation = await db.createInvitation({
                id: uuidv4(),
                email: inviteEmail,
                token: auth.generateInviteToken(),
                role: userRole,
                projectIds: projectIds || [],
                invitedBy: user.userId,
                invitedByName: user.name,
                organizationId: user.organizationId,
                expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
            });
            
            // Send invitation email
            const emailResult = await email.sendInvitationEmail(invitation, user.name);
            
            return auth.successResponse({
                invitation: {
                    id: invitation.id,
                    email: invitation.email,
                    role: invitation.role,
                    expiresAt: invitation.expiresAt
                },
                emailSent: emailResult.success
            }, 201);
            
        } catch (error) {
            context.error('Invite user error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// GET /api/users - List all users (developers only)
app.http('listUsers', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            if (!auth.hasRole(user, ['developer', 'admin'])) {
                return auth.errorResponse(403, 'Access denied');
            }
            
            await db.initDatabase();
            
            const users = await db.getAllUsers(user.organizationId);
            
            return auth.successResponse({ users });
            
        } catch (error) {
            context.error('List users error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// GET /api/users/clients - List client users (for assignment dropdown)
app.http('listClients', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/clients',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            if (!auth.hasRole(user, ['developer', 'admin'])) {
                return auth.errorResponse(403, 'Access denied');
            }
            
            await db.initDatabase();
            
            const clients = await db.getClientUsers(user.organizationId);
            
            return auth.successResponse({ clients });
            
        } catch (error) {
            context.error('List clients error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// GET /api/users/invitations - List pending invitations
app.http('listInvitations', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'users/invitations',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            if (!auth.hasRole(user, ['developer', 'admin'])) {
                return auth.errorResponse(403, 'Access denied');
            }
            
            await db.initDatabase();
            
            const invitations = await db.getPendingInvitations(user.organizationId);
            
            // Filter out sensitive data
            const safeInvitations = invitations.map(inv => ({
                id: inv.id,
                email: inv.email,
                role: inv.role,
                invitedByName: inv.invitedByName,
                createdAt: inv.createdAt,
                expiresAt: inv.expiresAt
            }));
            
            return auth.successResponse({ invitations: safeInvitations });
            
        } catch (error) {
            context.error('List invitations error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// PATCH /api/users/:userId - Update user (admin only for role changes)
app.http('updateUser', {
    methods: ['PATCH'],
    authLevel: 'anonymous',
    route: 'users/{userId}',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            const { userId } = request.params;
            const body = await request.json();
            
            await db.initDatabase();
            
            // Get target user
            const targetUser = await db.getUserById(userId);
            if (!targetUser) {
                return auth.errorResponse(404, 'User not found');
            }
            
            // Users can update their own name
            // Only admins can change roles or deactivate users
            const isSelf = user.userId === userId;
            const isAdmin = user.role === 'admin';
            
            const allowedUpdates = {};
            
            if (body.name && (isSelf || isAdmin)) {
                allowedUpdates.name = body.name;
            }
            
            if (body.role && isAdmin && body.role !== targetUser.role) {
                const validRoles = ['client', 'developer', 'admin'];
                if (!validRoles.includes(body.role)) {
                    return auth.errorResponse(400, 'Invalid role');
                }
                allowedUpdates.role = body.role;
            }
            
            if (typeof body.isActive === 'boolean' && isAdmin) {
                allowedUpdates.isActive = body.isActive;
            }
            
            if (Object.keys(allowedUpdates).length === 0) {
                return auth.errorResponse(400, 'No valid updates provided');
            }
            
            const updatedUser = await db.updateUser(userId, targetUser.email, allowedUpdates);
            
            return auth.successResponse({ user: updatedUser });
            
        } catch (error) {
            context.error('Update user error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});
