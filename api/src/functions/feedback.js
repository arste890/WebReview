/**
 * Feedback Functions
 * Create and manage feedback on projects
 */

const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const db = require('../shared/database');
const auth = require('../shared/auth');
const emailService = require('../shared/email');

// GET /api/feedback - List all feedback (filtered by role)
app.http('listFeedback', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'feedback',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            await db.initDatabase();
            
            let feedback;
            
            if (auth.hasRole(user, ['developer', 'admin'])) {
                // Developers see all feedback
                feedback = await db.getAllFeedback(user.organizationId);
            } else {
                // Clients see feedback on their assigned projects
                const projects = await db.getProjectsForUser(user.userId, user.role, user.organizationId);
                const projectIds = projects.map(p => p.id);
                
                feedback = [];
                for (const projectId of projectIds) {
                    const projectFeedback = await db.getFeedbackByProject(projectId);
                    feedback.push(...projectFeedback);
                }
                
                // Sort by date
                feedback.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }
            
            return auth.successResponse({ feedback });
            
        } catch (error) {
            context.error('List feedback error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// GET /api/projects/:projectId/feedback - Get feedback for specific project
app.http('getProjectFeedback', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'projects/{projectId}/feedback',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            const { projectId } = request.params;
            
            await db.initDatabase();
            
            // Check access
            const project = await db.getProjectById(projectId, user.organizationId);
            
            if (!project) {
                return auth.errorResponse(404, 'Project not found');
            }
            
            if (user.role === 'client' && !project.assignedClients.includes(user.userId)) {
                return auth.errorResponse(403, 'Access denied');
            }
            
            const feedback = await db.getFeedbackByProject(projectId);
            
            return auth.successResponse({ feedback });
            
        } catch (error) {
            context.error('Get project feedback error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// POST /api/projects/:projectId/feedback - Create feedback
app.http('createFeedback', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'projects/{projectId}/feedback',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            const { projectId } = request.params;
            
            await db.initDatabase();
            
            // Check access
            const project = await db.getProjectById(projectId, user.organizationId);
            
            if (!project) {
                return auth.errorResponse(404, 'Project not found');
            }
            
            // Clients must be assigned, developers can comment on any
            if (user.role === 'client' && !project.assignedClients.includes(user.userId)) {
                return auth.errorResponse(403, 'Access denied');
            }
            
            const body = await request.json();
            const { type, priority, text } = body;
            
            if (!text || !text.trim()) {
                return auth.errorResponse(400, 'Feedback text is required');
            }
            
            // Validate type
            const validTypes = ['general', 'bug', 'change', 'approval'];
            if (type && !validTypes.includes(type)) {
                return auth.errorResponse(400, 'Invalid feedback type');
            }
            
            // Validate priority
            const validPriorities = ['low', 'medium', 'high'];
            if (priority && !validPriorities.includes(priority)) {
                return auth.errorResponse(400, 'Invalid priority');
            }
            
            const feedback = await db.createFeedback({
                id: uuidv4(),
                projectId,
                type: type || 'general',
                priority: priority || 'medium',
                text: text.trim(),
                status: type === 'approval' ? 'resolved' : 'open',
                authorId: user.userId,
                authorName: user.name,
                authorRole: user.role
            });
            
            // Update project status if needed
            if (project.status === 'pending') {
                await db.updateProject(projectId, user.organizationId, { status: 'in-review' });
            }
            
            // If it's an approval, update project status
            if (type === 'approval' && user.role === 'client') {
                await db.updateProject(projectId, user.organizationId, { status: 'approved' });
            }
            
            // Notify developers of new feedback from clients
            if (user.role === 'client' && project.assignedDevelopers?.length > 0) {
                // Get developer emails
                const developerEmails = [];
                for (const devId of project.assignedDevelopers) {
                    const dev = await db.getUserById(devId);
                    if (dev?.email) developerEmails.push(dev.email);
                }
                
                if (developerEmails.length > 0) {
                    await emailService.sendFeedbackNotification(feedback, project, developerEmails);
                }
            }
            
            return auth.successResponse({ feedback }, 201);
            
        } catch (error) {
            context.error('Create feedback error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// PATCH /api/feedback/:feedbackId - Update feedback status (developers only)
app.http('updateFeedback', {
    methods: ['PATCH'],
    authLevel: 'anonymous',
    route: 'feedback/{feedbackId}',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            if (!auth.hasRole(user, ['developer', 'admin'])) {
                return auth.errorResponse(403, 'Only developers can update feedback status');
            }
            
            const { feedbackId } = request.params;
            const body = await request.json();
            
            await db.initDatabase();
            
            const { status, projectId } = body;
            
            if (!projectId) {
                return auth.errorResponse(400, 'projectId is required');
            }
            
            const validStatuses = ['open', 'in-progress', 'resolved'];
            if (status && !validStatuses.includes(status)) {
                return auth.errorResponse(400, 'Invalid status');
            }
            
            const updates = {};
            if (status) {
                updates.status = status;
                if (status === 'resolved') {
                    updates.resolvedAt = new Date().toISOString();
                    updates.resolvedBy = user.userId;
                }
            }
            
            const feedback = await db.updateFeedback(feedbackId, projectId, updates);
            
            if (!feedback) {
                return auth.errorResponse(404, 'Feedback not found');
            }
            
            return auth.successResponse({ feedback });
            
        } catch (error) {
            context.error('Update feedback error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// GET /api/stats - Get dashboard statistics
app.http('getStats', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'stats',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            await db.initDatabase();
            
            const projects = await db.getProjectsForUser(user.userId, user.role, user.organizationId);
            
            let feedback = [];
            for (const project of projects) {
                const projectFeedback = await db.getFeedbackByProject(project.id);
                feedback.push(...projectFeedback);
            }
            
            const stats = {
                totalProjects: projects.length,
                pendingReviews: projects.filter(p => p.status === 'pending' || p.status === 'in-review').length,
                approved: projects.filter(p => p.status === 'approved').length,
                totalFeedback: feedback.length,
                openFeedback: feedback.filter(f => f.status === 'open').length
            };
            
            // Developer-specific stats
            if (auth.hasRole(user, ['developer', 'admin'])) {
                const clients = await db.getClientUsers(user.organizationId);
                const invitations = await db.getPendingInvitations(user.organizationId);
                stats.totalClients = clients.length;
                stats.pendingInvitations = invitations.length;
            }
            
            return auth.successResponse({ stats });
            
        } catch (error) {
            context.error('Get stats error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});
