/**
 * Project Functions
 * CRUD operations for projects
 */

const { app } = require('@azure/functions');
const { v4: uuidv4 } = require('uuid');
const db = require('../shared/database');
const auth = require('../shared/auth');

// GET /api/projects - List projects for current user
app.http('listProjects', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'projects',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            await db.initDatabase();
            
            const projects = await db.getProjectsForUser(
                user.userId,
                user.role,
                user.organizationId
            );
            
            return auth.successResponse({ projects });
            
        } catch (error) {
            context.error('List projects error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// GET /api/projects/:projectId - Get single project
app.http('getProject', {
    methods: ['GET'],
    authLevel: 'anonymous',
    route: 'projects/{projectId}',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            const { projectId } = request.params;
            
            await db.initDatabase();
            
            const project = await db.getProjectById(projectId, user.organizationId);
            
            if (!project) {
                return auth.errorResponse(404, 'Project not found');
            }
            
            // Check access - developers see all, clients only assigned
            if (user.role === 'client' && !project.assignedClients.includes(user.userId)) {
                return auth.errorResponse(403, 'Access denied to this project');
            }
            
            return auth.successResponse({ project });
            
        } catch (error) {
            context.error('Get project error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// POST /api/projects - Create new project (developers only)
app.http('createProject', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'projects',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            if (!auth.hasRole(user, ['developer', 'admin'])) {
                return auth.errorResponse(403, 'Only developers can create projects');
            }
            
            await db.initDatabase();
            
            const body = await request.json();
            const { name, client, url, description, thumbnail, assignedClients } = body;
            
            // Validation
            if (!name || !client || !url) {
                return auth.errorResponse(400, 'Name, client, and URL are required');
            }
            
            // Validate URL
            try {
                new URL(url.startsWith('http') ? url : `https://${url}`);
            } catch {
                return auth.errorResponse(400, 'Invalid URL format');
            }
            
            const project = await db.createProject({
                id: uuidv4(),
                name,
                client,
                url: url.startsWith('http') ? url : `https://${url}`,
                description: description || '',
                thumbnail: thumbnail || '',
                status: 'pending',
                organizationId: user.organizationId,
                createdBy: user.userId,
                assignedClients: assignedClients || [],
                assignedDevelopers: [user.userId]
            });
            
            return auth.successResponse({ project }, 201);
            
        } catch (error) {
            context.error('Create project error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// PATCH /api/projects/:projectId - Update project
app.http('updateProject', {
    methods: ['PATCH'],
    authLevel: 'anonymous',
    route: 'projects/{projectId}',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            const { projectId } = request.params;
            
            await db.initDatabase();
            
            const project = await db.getProjectById(projectId, user.organizationId);
            
            if (!project) {
                return auth.errorResponse(404, 'Project not found');
            }
            
            const body = await request.json();
            const updates = {};
            
            // Developers can update all fields
            if (auth.hasRole(user, ['developer', 'admin'])) {
                if (body.name) updates.name = body.name;
                if (body.client) updates.client = body.client;
                if (body.url) {
                    try {
                        new URL(body.url.startsWith('http') ? body.url : `https://${body.url}`);
                        updates.url = body.url.startsWith('http') ? body.url : `https://${body.url}`;
                    } catch {
                        return auth.errorResponse(400, 'Invalid URL format');
                    }
                }
                if (body.description !== undefined) updates.description = body.description;
                if (body.thumbnail !== undefined) updates.thumbnail = body.thumbnail;
                if (body.status) {
                    const validStatuses = ['pending', 'in-review', 'approved', 'archived'];
                    if (!validStatuses.includes(body.status)) {
                        return auth.errorResponse(400, 'Invalid status');
                    }
                    updates.status = body.status;
                }
                if (body.assignedClients) updates.assignedClients = body.assignedClients;
            }
            // Clients can only approve
            else if (user.role === 'client') {
                if (!project.assignedClients.includes(user.userId)) {
                    return auth.errorResponse(403, 'Access denied to this project');
                }
                
                if (body.status === 'approved') {
                    updates.status = 'approved';
                } else {
                    return auth.errorResponse(403, 'Clients can only approve projects');
                }
            }
            
            if (Object.keys(updates).length === 0) {
                return auth.errorResponse(400, 'No valid updates provided');
            }
            
            const updatedProject = await db.updateProject(projectId, user.organizationId, updates);
            
            return auth.successResponse({ project: updatedProject });
            
        } catch (error) {
            context.error('Update project error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// DELETE /api/projects/:projectId - Delete project (developers only)
app.http('deleteProject', {
    methods: ['DELETE'],
    authLevel: 'anonymous',
    route: 'projects/{projectId}',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            if (!auth.hasRole(user, ['developer', 'admin'])) {
                return auth.errorResponse(403, 'Only developers can delete projects');
            }
            
            const { projectId } = request.params;
            
            await db.initDatabase();
            
            const project = await db.getProjectById(projectId, user.organizationId);
            
            if (!project) {
                return auth.errorResponse(404, 'Project not found');
            }
            
            await db.deleteProject(projectId, user.organizationId);
            
            return auth.successResponse({ message: 'Project deleted successfully' });
            
        } catch (error) {
            context.error('Delete project error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});

// POST /api/projects/:projectId/assign - Assign clients to project
app.http('assignClients', {
    methods: ['POST'],
    authLevel: 'anonymous',
    route: 'projects/{projectId}/assign',
    handler: async (request, context) => {
        try {
            const user = auth.authenticateRequest(request);
            
            if (!user) {
                return auth.errorResponse(401, 'Authentication required');
            }
            
            if (!auth.hasRole(user, ['developer', 'admin'])) {
                return auth.errorResponse(403, 'Only developers can assign clients');
            }
            
            const { projectId } = request.params;
            const body = await request.json();
            const { clientIds } = body;
            
            if (!clientIds || !Array.isArray(clientIds)) {
                return auth.errorResponse(400, 'clientIds array is required');
            }
            
            await db.initDatabase();
            
            const project = await db.getProjectById(projectId, user.organizationId);
            
            if (!project) {
                return auth.errorResponse(404, 'Project not found');
            }
            
            const updatedProject = await db.updateProject(projectId, user.organizationId, {
                assignedClients: clientIds
            });
            
            return auth.successResponse({ project: updatedProject });
            
        } catch (error) {
            context.error('Assign clients error:', error);
            return auth.errorResponse(500, 'Internal server error');
        }
    }
});
