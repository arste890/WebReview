/**
 * Database Module - Azure Cosmos DB Integration
 * Handles all database operations for WebReview
 */

const { CosmosClient } = require('@azure/cosmos');

let client = null;
let database = null;
let containers = {};

const CONTAINERS = {
    USERS: 'users',
    PROJECTS: 'projects',
    FEEDBACK: 'feedback',
    INVITATIONS: 'invitations',
    SESSIONS: 'sessions'
};

/**
 * Initialize Cosmos DB connection
 */
async function initDatabase() {
    if (database) return database;

    const connectionString = process.env.COSMOS_CONNECTION_STRING;
    const databaseId = process.env.COSMOS_DATABASE || 'webreview';

    if (!connectionString) {
        throw new Error('COSMOS_CONNECTION_STRING environment variable is required');
    }

    client = new CosmosClient(connectionString);
    
    // Create database if not exists
    const { database: db } = await client.databases.createIfNotExists({ id: databaseId });
    database = db;

    // Create containers if not exist
    for (const containerName of Object.values(CONTAINERS)) {
        const partitionKey = getPartitionKey(containerName);
        const { container } = await database.containers.createIfNotExists({
            id: containerName,
            partitionKey: { paths: [partitionKey] }
        });
        containers[containerName] = container;
    }

    console.log('Database initialized successfully');
    return database;
}

/**
 * Get partition key for container
 */
function getPartitionKey(containerName) {
    const keys = {
        [CONTAINERS.USERS]: '/email',
        [CONTAINERS.PROJECTS]: '/organizationId',
        [CONTAINERS.FEEDBACK]: '/projectId',
        [CONTAINERS.INVITATIONS]: '/email',
        [CONTAINERS.SESSIONS]: '/userId'
    };
    return keys[containerName] || '/id';
}

/**
 * Get container by name
 */
async function getContainer(containerName) {
    if (!containers[containerName]) {
        await initDatabase();
    }
    return containers[containerName];
}

// ============================================
// USER OPERATIONS
// ============================================

async function createUser(userData) {
    const container = await getContainer(CONTAINERS.USERS);
    const user = {
        id: userData.id,
        email: userData.email.toLowerCase(),
        name: userData.name,
        passwordHash: userData.passwordHash,
        role: userData.role || 'client', // 'developer', 'client', 'admin'
        organizationId: userData.organizationId || 'stevensit',
        assignedProjects: userData.assignedProjects || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isActive: true,
        lastLogin: null
    };
    
    const { resource } = await container.items.create(user);
    return sanitizeUser(resource);
}

async function getUserByEmail(email) {
    const container = await getContainer(CONTAINERS.USERS);
    const query = {
        query: 'SELECT * FROM c WHERE c.email = @email',
        parameters: [{ name: '@email', value: email.toLowerCase() }]
    };
    
    const { resources } = await container.items.query(query).fetchAll();
    return resources[0] || null;
}

async function getUserById(id) {
    const container = await getContainer(CONTAINERS.USERS);
    const query = {
        query: 'SELECT * FROM c WHERE c.id = @id',
        parameters: [{ name: '@id', value: id }]
    };
    
    const { resources } = await container.items.query(query).fetchAll();
    return resources[0] || null;
}

async function updateUser(id, email, updates) {
    const container = await getContainer(CONTAINERS.USERS);
    const user = await getUserByEmail(email);
    
    if (!user) return null;
    
    const updatedUser = {
        ...user,
        ...updates,
        updatedAt: new Date().toISOString()
    };
    
    const { resource } = await container.item(id, email.toLowerCase()).replace(updatedUser);
    return sanitizeUser(resource);
}

async function getAllUsers(organizationId = 'stevensit') {
    const container = await getContainer(CONTAINERS.USERS);
    const query = {
        query: 'SELECT * FROM c WHERE c.organizationId = @orgId ORDER BY c.createdAt DESC',
        parameters: [{ name: '@orgId', value: organizationId }]
    };
    
    const { resources } = await container.items.query(query).fetchAll();
    return resources.map(sanitizeUser);
}

async function getClientUsers(organizationId = 'stevensit') {
    const container = await getContainer(CONTAINERS.USERS);
    const query = {
        query: 'SELECT * FROM c WHERE c.organizationId = @orgId AND c.role = "client" ORDER BY c.name',
        parameters: [{ name: '@orgId', value: organizationId }]
    };
    
    const { resources } = await container.items.query(query).fetchAll();
    return resources.map(sanitizeUser);
}

function sanitizeUser(user) {
    if (!user) return null;
    const { passwordHash, ...safeUser } = user;
    return safeUser;
}

// ============================================
// PROJECT OPERATIONS
// ============================================

async function createProject(projectData) {
    const container = await getContainer(CONTAINERS.PROJECTS);
    const project = {
        id: projectData.id,
        name: projectData.name,
        client: projectData.client,
        url: projectData.url,
        description: projectData.description || '',
        thumbnail: projectData.thumbnail || '',
        status: projectData.status || 'pending',
        organizationId: projectData.organizationId || 'stevensit',
        createdBy: projectData.createdBy,
        assignedClients: projectData.assignedClients || [],
        assignedDevelopers: projectData.assignedDevelopers || [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    const { resource } = await container.items.create(project);
    return resource;
}

async function getProjectById(id, organizationId = 'stevensit') {
    const container = await getContainer(CONTAINERS.PROJECTS);
    try {
        const { resource } = await container.item(id, organizationId).read();
        return resource;
    } catch (error) {
        if (error.code === 404) return null;
        throw error;
    }
}

async function getProjectsForUser(userId, role, organizationId = 'stevensit') {
    const container = await getContainer(CONTAINERS.PROJECTS);
    let query;
    
    if (role === 'admin' || role === 'developer') {
        // Developers see all projects in their org
        query = {
            query: 'SELECT * FROM c WHERE c.organizationId = @orgId ORDER BY c.updatedAt DESC',
            parameters: [{ name: '@orgId', value: organizationId }]
        };
    } else {
        // Clients only see assigned projects
        query = {
            query: 'SELECT * FROM c WHERE c.organizationId = @orgId AND ARRAY_CONTAINS(c.assignedClients, @userId) ORDER BY c.updatedAt DESC',
            parameters: [
                { name: '@orgId', value: organizationId },
                { name: '@userId', value: userId }
            ]
        };
    }
    
    const { resources } = await container.items.query(query).fetchAll();
    return resources;
}

async function updateProject(id, organizationId, updates) {
    const container = await getContainer(CONTAINERS.PROJECTS);
    const project = await getProjectById(id, organizationId);
    
    if (!project) return null;
    
    const updatedProject = {
        ...project,
        ...updates,
        updatedAt: new Date().toISOString()
    };
    
    const { resource } = await container.item(id, organizationId).replace(updatedProject);
    return resource;
}

async function deleteProject(id, organizationId) {
    const container = await getContainer(CONTAINERS.PROJECTS);
    await container.item(id, organizationId).delete();
    return true;
}

// ============================================
// FEEDBACK OPERATIONS
// ============================================

async function createFeedback(feedbackData) {
    const container = await getContainer(CONTAINERS.FEEDBACK);
    const feedback = {
        id: feedbackData.id,
        projectId: feedbackData.projectId,
        type: feedbackData.type || 'general',
        priority: feedbackData.priority || 'medium',
        text: feedbackData.text,
        status: feedbackData.status || 'open',
        authorId: feedbackData.authorId,
        authorName: feedbackData.authorName,
        authorRole: feedbackData.authorRole,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        resolvedAt: null,
        resolvedBy: null
    };
    
    const { resource } = await container.items.create(feedback);
    return resource;
}

async function getFeedbackByProject(projectId) {
    const container = await getContainer(CONTAINERS.FEEDBACK);
    const query = {
        query: 'SELECT * FROM c WHERE c.projectId = @projectId ORDER BY c.createdAt DESC',
        parameters: [{ name: '@projectId', value: projectId }]
    };
    
    const { resources } = await container.items.query(query).fetchAll();
    return resources;
}

async function getAllFeedback(organizationId = 'stevensit') {
    const container = await getContainer(CONTAINERS.FEEDBACK);
    const projectContainer = await getContainer(CONTAINERS.PROJECTS);
    
    // Get all project IDs for the organization
    const projectQuery = {
        query: 'SELECT c.id FROM c WHERE c.organizationId = @orgId',
        parameters: [{ name: '@orgId', value: organizationId }]
    };
    const { resources: projects } = await projectContainer.items.query(projectQuery).fetchAll();
    const projectIds = projects.map(p => p.id);
    
    if (projectIds.length === 0) return [];
    
    // Get all feedback for these projects
    const feedbackQuery = {
        query: `SELECT * FROM c WHERE ARRAY_CONTAINS(@projectIds, c.projectId) ORDER BY c.createdAt DESC`,
        parameters: [{ name: '@projectIds', value: projectIds }]
    };
    
    const { resources } = await container.items.query(feedbackQuery).fetchAll();
    return resources;
}

async function updateFeedback(id, projectId, updates) {
    const container = await getContainer(CONTAINERS.FEEDBACK);
    
    const query = {
        query: 'SELECT * FROM c WHERE c.id = @id AND c.projectId = @projectId',
        parameters: [
            { name: '@id', value: id },
            { name: '@projectId', value: projectId }
        ]
    };
    const { resources } = await container.items.query(query).fetchAll();
    const feedback = resources[0];
    
    if (!feedback) return null;
    
    const updatedFeedback = {
        ...feedback,
        ...updates,
        updatedAt: new Date().toISOString()
    };
    
    const { resource } = await container.item(id, projectId).replace(updatedFeedback);
    return resource;
}

// ============================================
// INVITATION OPERATIONS
// ============================================

async function createInvitation(invitationData) {
    const container = await getContainer(CONTAINERS.INVITATIONS);
    const invitation = {
        id: invitationData.id,
        email: invitationData.email.toLowerCase(),
        token: invitationData.token,
        role: invitationData.role || 'client',
        projectIds: invitationData.projectIds || [],
        invitedBy: invitationData.invitedBy,
        invitedByName: invitationData.invitedByName,
        organizationId: invitationData.organizationId || 'stevensit',
        expiresAt: invitationData.expiresAt,
        createdAt: new Date().toISOString(),
        acceptedAt: null,
        isUsed: false
    };
    
    const { resource } = await container.items.create(invitation);
    return resource;
}

async function getInvitationByToken(token) {
    const container = await getContainer(CONTAINERS.INVITATIONS);
    const query = {
        query: 'SELECT * FROM c WHERE c.token = @token AND c.isUsed = false',
        parameters: [{ name: '@token', value: token }]
    };
    
    const { resources } = await container.items.query(query).fetchAll();
    return resources[0] || null;
}

async function getInvitationByEmail(email) {
    const container = await getContainer(CONTAINERS.INVITATIONS);
    const query = {
        query: 'SELECT * FROM c WHERE c.email = @email ORDER BY c.createdAt DESC',
        parameters: [{ name: '@email', value: email.toLowerCase() }]
    };
    
    const { resources } = await container.items.query(query).fetchAll();
    return resources[0] || null;
}

async function markInvitationUsed(id, email) {
    const container = await getContainer(CONTAINERS.INVITATIONS);
    const invitation = await getInvitationByEmail(email);
    
    if (!invitation) return null;
    
    const updated = {
        ...invitation,
        isUsed: true,
        acceptedAt: new Date().toISOString()
    };
    
    const { resource } = await container.item(id, email.toLowerCase()).replace(updated);
    return resource;
}

async function getPendingInvitations(organizationId = 'stevensit') {
    const container = await getContainer(CONTAINERS.INVITATIONS);
    const query = {
        query: 'SELECT * FROM c WHERE c.organizationId = @orgId AND c.isUsed = false ORDER BY c.createdAt DESC',
        parameters: [{ name: '@orgId', value: organizationId }]
    };
    
    const { resources } = await container.items.query(query).fetchAll();
    return resources;
}

module.exports = {
    initDatabase,
    CONTAINERS,
    // Users
    createUser,
    getUserByEmail,
    getUserById,
    updateUser,
    getAllUsers,
    getClientUsers,
    // Projects
    createProject,
    getProjectById,
    getProjectsForUser,
    updateProject,
    deleteProject,
    // Feedback
    createFeedback,
    getFeedbackByProject,
    getAllFeedback,
    updateFeedback,
    // Invitations
    createInvitation,
    getInvitationByToken,
    getInvitationByEmail,
    markInvitationUsed,
    getPendingInvitations
};
