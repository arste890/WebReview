/**
 * StevensIT WebReview - API Client & Authentication Module
 * Handles API communication and user authentication
 */

const API_BASE = '/api';

// ============================================
// Authentication State
// ============================================

let currentUser = null;
let authToken = null;

/**
 * Initialize authentication from stored credentials
 */
async function initAuth() {
    authToken = localStorage.getItem('webreview_token');
    const storedUser = localStorage.getItem('webreview_user');
    
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
        } catch (e) {
            console.error('Failed to parse stored user:', e);
        }
    }
    
    if (authToken) {
        // Verify token is still valid
        try {
            const user = await API.auth.me();
            if (user) {
                currentUser = user;
                localStorage.setItem('webreview_user', JSON.stringify(user));
                updateRoleBasedUI();
                addLogoutButton();
                return user;
            }
        } catch (error) {
            console.log('Token invalid or API unavailable - using local mode');
            // For local development without API, just use stored user
            if (currentUser) {
                updateRoleBasedUI();
                addLogoutButton();
                return currentUser;
            }
        }
    }
    
    // For local development without backend - create a demo user
    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        currentUser = {
            id: 'demo_user',
            name: 'Demo Developer',
            email: 'demo@stevensit.com',
            role: 'developer',
            organizationId: 'stevensit'
        };
        updateRoleBasedUI();
        addLogoutButton();
        return currentUser;
    }
    
    // Not authenticated - redirect to login (only in production)
    if (!window.location.pathname.includes('login') && !window.location.pathname.includes('signup')) {
        window.location.href = '/login.html';
    }
    
    return null;
}

/**
 * Get current authenticated user
 */
function getCurrentUser() {
    return currentUser;
}

/**
 * Check if user has a specific role
 */
function hasRole(role) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return currentUser.role === role;
}

/**
 * Check if user is a developer
 */
function isDeveloper() {
    return hasRole('developer') || hasRole('admin');
}

/**
 * Check if user is a client
 */
function isClient() {
    return currentUser?.role === 'client';
}

/**
 * Logout user
 */
function logout() {
    localStorage.removeItem('webreview_token');
    localStorage.removeItem('webreview_user');
    localStorage.removeItem('stevensit_webreview');
    currentUser = null;
    authToken = null;
    window.location.href = '/login.html';
}

/**
 * Update UI based on user role
 */
function updateRoleBasedUI() {
    if (!currentUser) return;
    
    // Update user display
    document.querySelectorAll('.user-name').forEach(el => {
        el.textContent = currentUser.name || 'User';
    });
    
    document.querySelectorAll('.user-avatar span').forEach(el => {
        el.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
    });
    
    document.querySelectorAll('.user-role').forEach(el => {
        el.textContent = currentUser.role === 'admin' ? 'Administrator' : 
                         currentUser.role === 'developer' ? 'Developer' : 'Client';
    });
    
    // Show/hide developer-only elements
    document.querySelectorAll('[data-role="developer"]').forEach(el => {
        el.style.display = isDeveloper() ? '' : 'none';
    });
    
    // Show/hide client-only elements
    document.querySelectorAll('[data-role="client"]').forEach(el => {
        el.style.display = isClient() ? '' : 'none';
    });
    
    // Hide certain nav items for clients
    if (isClient()) {
        // Clients don't see Team management
        const teamNav = document.querySelector('[data-view="team"]');
        if (teamNav) teamNav.style.display = 'none';
    }
}

/**
 * Add logout button to sidebar
 */
function addLogoutButton() {
    const sidebarFooter = document.querySelector('.sidebar-footer');
    if (!sidebarFooter || document.getElementById('logout-btn')) return;
    
    const logoutBtn = document.createElement('button');
    logoutBtn.id = 'logout-btn';
    logoutBtn.className = 'logout-btn';
    logoutBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/>
            <polyline points="16 17 21 12 16 7"/>
            <line x1="21" y1="12" x2="9" y2="12"/>
        </svg>
        <span>Sign Out</span>
    `;
    logoutBtn.addEventListener('click', logout);
    sidebarFooter.appendChild(logoutBtn);
}

// ============================================
// API Client
// ============================================

async function apiRequest(endpoint, options = {}) {
    const url = `${API_BASE}${endpoint}`;
    
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const response = await fetch(url, {
        ...options,
        headers
    });
    
    // Handle 401 - redirect to login
    if (response.status === 401) {
        logout();
        throw new Error('Authentication required');
    }
    
    const data = await response.json();
    
    if (!response.ok) {
        throw new Error(data.error || 'API request failed');
    }
    
    return data;
}

const API = {
    auth: {
        async login(email, password) {
            const data = await apiRequest('/auth/login', {
                method: 'POST',
                body: JSON.stringify({ email, password })
            });
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('webreview_token', data.token);
            localStorage.setItem('webreview_user', JSON.stringify(data.user));
            return data.user;
        },
        
        async register(token, name, password) {
            const data = await apiRequest('/auth/register', {
                method: 'POST',
                body: JSON.stringify({ token, name, password })
            });
            authToken = data.token;
            currentUser = data.user;
            localStorage.setItem('webreview_token', data.token);
            localStorage.setItem('webreview_user', JSON.stringify(data.user));
            return data.user;
        },
        
        async me() {
            const data = await apiRequest('/auth/me');
            return data.user;
        },
        
        async validateInvite(token) {
            return apiRequest('/auth/validate-invite', {
                method: 'POST',
                body: JSON.stringify({ token })
            });
        }
    },
    
    users: {
        async list() {
            const data = await apiRequest('/users');
            return data.users;
        },
        
        async listClients() {
            const data = await apiRequest('/users/clients');
            return data.clients;
        },
        
        async invite(email, role, projectIds = []) {
            const data = await apiRequest('/users/invite', {
                method: 'POST',
                body: JSON.stringify({ email, role, projectIds })
            });
            return data;
        },
        
        async listInvitations() {
            const data = await apiRequest('/users/invitations');
            return data.invitations;
        },
        
        async update(userId, updates) {
            const data = await apiRequest(`/users/${userId}`, {
                method: 'PATCH',
                body: JSON.stringify(updates)
            });
            return data.user;
        }
    },
    
    projects: {
        async list() {
            const data = await apiRequest('/projects');
            return data.projects;
        },
        
        async get(projectId) {
            const data = await apiRequest(`/projects/${projectId}`);
            return data.project;
        },
        
        async create(projectData) {
            const data = await apiRequest('/projects', {
                method: 'POST',
                body: JSON.stringify(projectData)
            });
            return data.project;
        },
        
        async update(projectId, updates) {
            const data = await apiRequest(`/projects/${projectId}`, {
                method: 'PATCH',
                body: JSON.stringify(updates)
            });
            return data.project;
        },
        
        async delete(projectId) {
            return apiRequest(`/projects/${projectId}`, {
                method: 'DELETE'
            });
        },
        
        async assignClients(projectId, clientIds) {
            const data = await apiRequest(`/projects/${projectId}/assign`, {
                method: 'POST',
                body: JSON.stringify({ clientIds })
            });
            return data.project;
        }
    },
    
    feedback: {
        async list() {
            const data = await apiRequest('/feedback');
            return data.feedback;
        },
        
        async getByProject(projectId) {
            const data = await apiRequest(`/projects/${projectId}/feedback`);
            return data.feedback;
        },
        
        async create(projectId, feedbackData) {
            const data = await apiRequest(`/projects/${projectId}/feedback`, {
                method: 'POST',
                body: JSON.stringify(feedbackData)
            });
            return data.feedback;
        },
        
        async update(feedbackId, projectId, updates) {
            const data = await apiRequest(`/feedback/${feedbackId}`, {
                method: 'PATCH',
                body: JSON.stringify({ ...updates, projectId })
            });
            return data.feedback;
        }
    },
    
    stats: {
        async get() {
            const data = await apiRequest('/stats');
            return data.stats;
        }
    }
};

// ============================================
// Export
// ============================================

window.Auth = {
    init: initAuth,
    getCurrentUser,
    hasRole,
    isDeveloper,
    isClient,
    logout,
    updateRoleBasedUI
};

window.API = API;
