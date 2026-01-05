/**
 * StevensIT WebReview Application
 * Client feedback and review platform for web development projects
 */

// ===================================
// Data Store
// ===================================

const APP_STORAGE_KEY = 'stevensit_webreview';

// App State
let state = {
    projects: [],
    feedback: [],
    users: [],
    invitations: [],
    currentView: 'dashboard',
    currentProject: null,
    currentUser: null,
    settings: {
        displayName: 'User',
        email: '',
        notifications: {
            feedback: true,
            updates: true
        }
    }
};

// ===================================
// Initialization
// ===================================

document.addEventListener('DOMContentLoaded', () => {
    initializeApp();
});

async function initializeApp() {
    // Simulate loading
    setTimeout(async () => {
        // Initialize authentication
        if (window.Auth) {
            const isAuthenticated = await window.Auth.init();
            
            if (!isAuthenticated) {
                // Redirect to login if not authenticated
                window.location.href = '/login.html';
                return;
            }
            
            // Get current user
            state.currentUser = window.Auth.getUser();
            if (state.currentUser) {
                state.settings.displayName = state.currentUser.name;
                state.settings.email = state.currentUser.email;
            }
        }
        
        document.getElementById('loading-screen').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        
        // Setup event listeners
        setupNavigation();
        setupModals();
        setupProjectCards();
        setupPreviewView();
        setupFeedbackPanel();
        setupFilters();
        setupSearch();
        setupTeamManagement();
        setupRoleBasedUI();
        
        // Load data from API
        await loadInitialData();
        
        // Initial render
        renderDashboard();
        renderProjects();
        renderFeedback();
        
        if (state.currentUser && (state.currentUser.role === 'developer' || state.currentUser.role === 'admin')) {
            await loadTeamData();
            renderTeam();
        }
        
    }, 1500);
}

// ===================================
// Data Loading
// ===================================

async function loadInitialData() {
    try {
        // Load projects
        if (window.API) {
            const projectsResponse = await window.API.getProjects();
            if (projectsResponse.success) {
                state.projects = projectsResponse.projects;
            }
            
            // Load feedback
            const feedbackResponse = await window.API.getAllFeedback();
            if (feedbackResponse.success) {
                state.feedback = feedbackResponse.feedback;
            }
        }
    } catch (error) {
        console.error('Failed to load data:', error);
        showToast('error', 'Failed to load data. Using cached data.');
        loadCachedState();
    }
}

async function loadTeamData() {
    try {
        if (window.API) {
            // Load team members
            const usersResponse = await window.API.getUsers();
            if (usersResponse.success) {
                state.users = usersResponse.users;
            }
            
            // Load invitations
            const invitationsResponse = await window.API.getInvitations();
            if (invitationsResponse.success) {
                state.invitations = invitationsResponse.invitations;
            }
        }
    } catch (error) {
        console.error('Failed to load team data:', error);
    }
}

function loadCachedState() {
    const saved = localStorage.getItem(APP_STORAGE_KEY);
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            state.projects = parsed.projects || [];
            state.feedback = parsed.feedback || [];
        } catch (e) {
            console.error('Failed to load cached state:', e);
        }
    }
}

function saveState() {
    localStorage.setItem(APP_STORAGE_KEY, JSON.stringify({
        projects: state.projects,
        feedback: state.feedback
    }));
}

// ===================================
// Role-Based UI
// ===================================

function setupRoleBasedUI() {
    const user = state.currentUser;
    if (!user) return;
    
    const role = user.role;
    
    // Hide elements that don't match user's role
    document.querySelectorAll('[data-role]').forEach(el => {
        const allowedRoles = el.dataset.role.split(',').map(r => r.trim());
        if (!allowedRoles.includes(role) && !allowedRoles.includes('all')) {
            el.style.display = 'none';
        }
    });
    
    // Update user info in sidebar
    const userNameEl = document.querySelector('.user-name');
    const userProviderEl = document.querySelector('.user-provider span');
    const userAvatarEl = document.querySelector('.user-avatar span');
    
    if (userNameEl) userNameEl.textContent = user.name;
    if (userProviderEl) userProviderEl.textContent = role.toUpperCase();
    if (userAvatarEl) userAvatarEl.textContent = user.name.charAt(0).toUpperCase();
}

// ===================================
// Navigation
// ===================================

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item, [data-view]');
    
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.dataset.view;
            if (view) {
                navigateTo(view);
            }
        });
    });
}

function navigateTo(viewName) {
    // Update nav active state
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.view === viewName);
    });
    
    // Update views
    document.querySelectorAll('.view').forEach(view => {
        view.classList.remove('active');
    });
    
    const targetView = document.getElementById(`${viewName}-view`);
    if (targetView) {
        targetView.classList.add('active');
        state.currentView = viewName;
    }
}

// ===================================
// Dashboard
// ===================================

function renderDashboard() {
    // Stats
    const totalProjects = state.projects.length;
    const pendingReviews = state.projects.filter(p => p.status === 'pending' || p.status === 'in-review').length;
    const approved = state.projects.filter(p => p.status === 'approved').length;
    const totalFeedback = state.feedback.length;
    
    animateCounter('total-projects', totalProjects);
    animateCounter('pending-reviews', pendingReviews);
    animateCounter('approved-projects', approved);
    animateCounter('total-feedback', totalFeedback);
    
    // Recent Projects (last 3)
    const recentProjects = [...state.projects]
        .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
        .slice(0, 3);
    
    const recentProjectsContainer = document.getElementById('recent-projects');
    if (recentProjects.length > 0) {
        recentProjectsContainer.innerHTML = recentProjects.map(p => createProjectCard(p)).join('');
        attachProjectCardListeners(recentProjectsContainer);
    } else {
        recentProjectsContainer.innerHTML = createEmptyState('No projects yet', 'Create your first project to get started');
    }
    
    // Recent Feedback (last 4)
    const recentFeedback = [...state.feedback]
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, 4);
    
    const recentFeedbackContainer = document.getElementById('recent-feedback');
    if (recentFeedback.length > 0) {
        recentFeedbackContainer.innerHTML = recentFeedback.map(f => createFeedbackItem(f)).join('');
    } else {
        recentFeedbackContainer.innerHTML = createEmptyState('No feedback yet', 'Feedback will appear here when added to projects');
    }
}

function animateCounter(elementId, target) {
    const element = document.getElementById(elementId);
    const duration = 1000;
    const start = 0;
    const startTime = performance.now();
    
    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        
        // Ease out
        const eased = 1 - Math.pow(1 - progress, 3);
        const current = Math.round(start + (target - start) * eased);
        
        element.textContent = current;
        
        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }
    
    requestAnimationFrame(update);
}

// ===================================
// Projects
// ===================================

function renderProjects(filter = 'all') {
    const container = document.getElementById('all-projects');
    let projects = [...state.projects];
    
    if (filter !== 'all') {
        projects = projects.filter(p => p.status === filter);
    }
    
    if (projects.length > 0) {
        container.innerHTML = projects.map(p => createProjectCard(p)).join('');
        attachProjectCardListeners(container);
    } else {
        container.innerHTML = createEmptyState(
            'No projects found',
            filter === 'all' ? 'Create a new project to get started' : `No ${filter} projects at the moment`
        );
    }
}

function createProjectCard(project) {
    const feedbackCount = state.feedback.filter(f => f.projectId === project.id).length;
    const updatedDate = formatDate(project.updatedAt);
    
    return `
        <div class="project-card" data-project-id="${project.id}">
            <div class="project-thumbnail">
                ${project.thumbnail 
                    ? `<img src="${project.thumbnail}" alt="${project.name}" onerror="this.parentElement.innerHTML='<div class=\\'placeholder\\'><svg viewBox=\\'0 0 24 24\\' fill=\\'none\\' stroke=\\'currentColor\\' stroke-width=\\'2\\'><rect x=\\'3\\' y=\\'3\\' width=\\'18\\' height=\\'18\\' rx=\\'2\\'/><circle cx=\\'8.5\\' cy=\\'8.5\\' r=\\'1.5\\'/><polyline points=\\'21 15 16 10 5 21\\'/></svg></div>'">`
                    : `<div class="placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <rect x="3" y="3" width="18" height="18" rx="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                        </svg>
                    </div>`
                }
                <span class="project-status-badge ${project.status}">${formatStatus(project.status)}</span>
            </div>
            <div class="project-info">
                <h3 class="project-name">${escapeHtml(project.name)}</h3>
                <p class="project-client">${escapeHtml(project.client)}</p>
                <div class="project-meta">
                    <span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                        </svg>
                        ${feedbackCount} feedback
                    </span>
                    <span>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        ${updatedDate}
                    </span>
                </div>
            </div>
        </div>
    `;
}

function attachProjectCardListeners(container) {
    container.querySelectorAll('.project-card').forEach(card => {
        card.addEventListener('click', () => {
            const projectId = card.dataset.projectId;
            openProjectPreview(projectId);
        });
    });
}

function setupProjectCards() {
    // New project buttons
    document.getElementById('new-project-btn').addEventListener('click', openNewProjectModal);
    document.getElementById('new-project-btn-2').addEventListener('click', openNewProjectModal);
}

// ===================================
// Project Preview
// ===================================

function openProjectPreview(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) return;
    
    state.currentProject = project;
    
    // Update preview UI
    document.getElementById('preview-project-name').textContent = project.name;
    const statusEl = document.getElementById('preview-project-status');
    statusEl.textContent = formatStatus(project.status);
    statusEl.className = `preview-status ${project.status === 'approved' ? 'approved' : ''}`;
    
    // Setup iframe
    const iframe = document.getElementById('website-preview');
    const loading = document.querySelector('.iframe-loading');
    
    loading.classList.remove('hidden');
    iframe.src = project.url;
    
    iframe.onload = () => {
        loading.classList.add('hidden');
    };
    
    iframe.onerror = () => {
        loading.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 48px; height: 48px; color: var(--warning);">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <span>Unable to load preview. The website may not allow embedding.</span>
        `;
    };
    
    // Render project feedback
    renderProjectFeedback(projectId);
    
    // Navigate to preview
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('preview-view').classList.add('active');
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
}

function setupPreviewView() {
    // Back button
    document.getElementById('back-to-projects').addEventListener('click', () => {
        state.currentProject = null;
        navigateTo('projects');
    });
    
    // Device toggle
    const deviceBtns = document.querySelectorAll('.device-btn');
    deviceBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            deviceBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const device = btn.dataset.device;
            const wrapper = document.getElementById('iframe-wrapper');
            wrapper.className = `iframe-wrapper ${device}`;
        });
    });
    
    // Toggle feedback panel
    document.getElementById('toggle-feedback-panel').addEventListener('click', () => {
        document.getElementById('feedback-panel').classList.toggle('open');
    });
    
    document.getElementById('close-feedback-panel').addEventListener('click', () => {
        document.getElementById('feedback-panel').classList.remove('open');
    });
    
    // Approve project
    document.getElementById('approve-project').addEventListener('click', () => {
        if (state.currentProject) {
            state.currentProject.status = 'approved';
            state.currentProject.updatedAt = new Date().toISOString();
            saveState();
            
            const statusEl = document.getElementById('preview-project-status');
            statusEl.textContent = 'Approved';
            statusEl.classList.add('approved');
            
            showToast('success', 'Project approved successfully!');
            
            // Add approval feedback
            addFeedback({
                projectId: state.currentProject.id,
                type: 'approval',
                priority: 'medium',
                text: 'This project has been approved!',
                status: 'resolved'
            });
            
            renderProjectFeedback(state.currentProject.id);
            renderDashboard();
            renderProjects();
        }
    });
}

// ===================================
// Feedback
// ===================================

function renderFeedback(filter = 'all') {
    const container = document.getElementById('all-feedback');
    let feedback = [...state.feedback];
    
    if (filter !== 'all') {
        feedback = feedback.filter(f => f.status === filter);
    }
    
    // Sort by date
    feedback.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (feedback.length > 0) {
        container.innerHTML = feedback.map(f => createFeedbackItem(f)).join('');
    } else {
        container.innerHTML = createEmptyState(
            'No feedback found',
            'Feedback items will appear here as they are added'
        );
    }
}

function renderProjectFeedback(projectId) {
    const container = document.getElementById('project-feedback-list');
    const feedback = state.feedback
        .filter(f => f.projectId === projectId)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    
    if (feedback.length > 0) {
        container.innerHTML = feedback.map(f => createFeedbackItem(f, true)).join('');
    } else {
        container.innerHTML = `
            <div class="empty-state" style="padding: 30px 10px;">
                <p style="font-size: 0.9rem;">No feedback yet for this project</p>
            </div>
        `;
    }
}

function createFeedbackItem(feedback, compact = false) {
    const project = state.projects.find(p => p.id === feedback.projectId);
    const projectName = project ? project.name : 'Unknown Project';
    const date = formatDate(feedback.createdAt);
    
    const typeIcons = {
        general: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>',
        bug: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
        change: '<polygon points="14 2 18 6 7 17 3 17 3 13 14 2"/><line x1="3" y1="22" x2="21" y2="22"/>',
        approval: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>'
    };
    
    return `
        <div class="feedback-item">
            <div class="feedback-type-icon ${feedback.type}">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    ${typeIcons[feedback.type] || typeIcons.general}
                </svg>
            </div>
            <div class="feedback-content">
                <div class="feedback-header">
                    <span class="feedback-title">${capitalize(feedback.type)} ${feedback.type === 'approval' ? '' : 'Feedback'}</span>
                    ${!compact ? `<span class="feedback-project">${escapeHtml(projectName)}</span>` : ''}
                </div>
                <p class="feedback-text">${escapeHtml(feedback.text)}</p>
                <div class="feedback-meta">
                    <span class="priority-tag ${feedback.priority}">${feedback.priority}</span>
                    <span class="status-tag ${feedback.status}">${feedback.status}</span>
                    <span>${date}</span>
                </div>
            </div>
        </div>
    `;
}

function setupFeedbackPanel() {
    // Priority buttons
    const priorityBtns = document.querySelectorAll('.priority-btn');
    priorityBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            priorityBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
    
    // Submit feedback
    document.getElementById('submit-feedback').addEventListener('click', () => {
        if (!state.currentProject) return;
        
        const type = document.getElementById('feedback-type').value;
        const priority = document.querySelector('.priority-btn.active')?.dataset.priority || 'medium';
        const text = document.getElementById('feedback-text').value.trim();
        
        if (!text) {
            showToast('error', 'Please enter your feedback');
            return;
        }
        
        addFeedback({
            projectId: state.currentProject.id,
            type,
            priority,
            text,
            status: 'open'
        });
        
        // Clear form
        document.getElementById('feedback-text').value = '';
        
        // Re-render
        renderProjectFeedback(state.currentProject.id);
        renderFeedback();
        renderDashboard();
        
        showToast('success', 'Feedback submitted successfully!');
    });
}

function addFeedback(feedbackData) {
    const newFeedback = {
        id: `fb_${Date.now()}`,
        author: state.settings.displayName,
        createdAt: new Date().toISOString(),
        ...feedbackData
    };
    
    // Try API first
    if (window.API) {
        window.API.createFeedback(feedbackData.projectId, {
            type: feedbackData.type,
            priority: feedbackData.priority,
            text: feedbackData.text,
            status: feedbackData.status
        }).then(response => {
            if (response.success) {
                state.feedback.unshift(response.feedback);
            } else {
                // Fall back to local
                state.feedback.unshift(newFeedback);
            }
            saveState();
        }).catch(() => {
            state.feedback.unshift(newFeedback);
            saveState();
        });
    } else {
        state.feedback.unshift(newFeedback);
        saveState();
    }
    
    // Update project
    const project = state.projects.find(p => p.id === feedbackData.projectId);
    if (project) {
        project.updatedAt = new Date().toISOString();
        if (project.status === 'pending') {
            project.status = 'in-review';
        }
    }
}

// ===================================
// Filters & Search
// ===================================

function setupFilters() {
    // Project filters
    document.querySelectorAll('.projects-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.projects-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderProjects(btn.dataset.filter);
        });
    });
    
    // Feedback filters
    document.querySelectorAll('.feedback-filters .filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.feedback-filters .filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderFeedback(btn.dataset.filter);
        });
    });
}

function setupSearch() {
    const searchInput = document.getElementById('project-search');
    let debounceTimer;
    
    searchInput.addEventListener('input', (e) => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            const query = e.target.value.toLowerCase().trim();
            filterProjectsBySearch(query);
        }, 300);
    });
}

function filterProjectsBySearch(query) {
    const container = document.getElementById('all-projects');
    
    if (!query) {
        renderProjects();
        return;
    }
    
    const filtered = state.projects.filter(p => 
        p.name.toLowerCase().includes(query) || 
        p.client.toLowerCase().includes(query) ||
        (p.description && p.description.toLowerCase().includes(query))
    );
    
    if (filtered.length > 0) {
        container.innerHTML = filtered.map(p => createProjectCard(p)).join('');
        attachProjectCardListeners(container);
    } else {
        container.innerHTML = createEmptyState(
            'No matching projects',
            `No projects found matching "${query}"`
        );
    }
}

// ===================================
// Modals
// ===================================

function setupModals() {
    const modal = document.getElementById('new-project-modal');
    
    // Close modal on backdrop click
    modal.querySelector('.modal-backdrop').addEventListener('click', closeNewProjectModal);
    modal.querySelector('.close-modal').addEventListener('click', closeNewProjectModal);
    document.getElementById('cancel-new-project').addEventListener('click', closeNewProjectModal);
    
    // Save new project
    document.getElementById('save-new-project').addEventListener('click', saveNewProject);
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && modal.classList.contains('open')) {
            closeNewProjectModal();
        }
    });
}

function openNewProjectModal() {
    document.getElementById('new-project-modal').classList.add('open');
    document.getElementById('project-name').focus();
    
    // Populate clients dropdown for developers
    populateClientsDropdown();
}

function populateClientsDropdown() {
    const clientSelect = document.getElementById('assign-client');
    if (!clientSelect) return;
    
    const clients = state.users.filter(u => u.role === 'client' && u.status === 'active');
    
    clientSelect.innerHTML = '<option value="">Select a client (optional)</option>' +
        clients.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.email)})</option>`).join('');
}

function closeNewProjectModal() {
    document.getElementById('new-project-modal').classList.remove('open');
    
    // Clear form
    document.getElementById('project-name').value = '';
    document.getElementById('client-name').value = '';
    document.getElementById('project-url').value = '';
    document.getElementById('project-description').value = '';
    document.getElementById('project-thumbnail').value = '';
}

function saveNewProject() {
    const name = document.getElementById('project-name').value.trim();
    const client = document.getElementById('client-name').value.trim();
    const url = document.getElementById('project-url').value.trim();
    const description = document.getElementById('project-description').value.trim();
    const thumbnail = document.getElementById('project-thumbnail').value.trim();
    const assignedClient = document.getElementById('assign-client')?.value || '';
    
    // Validation
    if (!name) {
        showToast('error', 'Please enter a project name');
        return;
    }
    
    if (!client) {
        showToast('error', 'Please enter a client name');
        return;
    }
    
    if (!url) {
        showToast('error', 'Please enter a website URL');
        return;
    }
    
    // Create project via API if available
    const projectData = {
        name,
        client,
        url: url.startsWith('http') ? url : `https://${url}`,
        description,
        thumbnail: thumbnail || '',
        status: 'pending',
        assignedClients: assignedClient ? [assignedClient] : []
    };
    
    if (window.API) {
        window.API.createProject(projectData)
            .then(response => {
                if (response.success) {
                    state.projects.unshift(response.project);
                    saveState();
                    closeNewProjectModal();
                    renderDashboard();
                    renderProjects();
                    showToast('success', 'Project created successfully!');
                } else {
                    showToast('error', response.error || 'Failed to create project');
                }
            })
            .catch(error => {
                console.error('Failed to create project:', error);
                // Fall back to local storage
                createProjectLocally(projectData);
            });
    } else {
        createProjectLocally(projectData);
    }
}

function createProjectLocally(projectData) {
    const newProject = {
        id: `proj_${Date.now()}`,
        ...projectData,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    
    state.projects.unshift(newProject);
    saveState();
    
    closeNewProjectModal();
    renderDashboard();
    renderProjects();
    
    showToast('success', 'Project created successfully!');
}

// ===================================
// Team Management
// ===================================

function setupTeamManagement() {
    const inviteModal = document.getElementById('invite-user-modal');
    if (!inviteModal) return;
    
    // Setup invite modal
    const inviteBtn = document.getElementById('invite-user-btn');
    if (inviteBtn) {
        inviteBtn.addEventListener('click', openInviteModal);
    }
    
    // Close modal handlers
    inviteModal.querySelector('.modal-backdrop')?.addEventListener('click', closeInviteModal);
    inviteModal.querySelector('.close-modal')?.addEventListener('click', closeInviteModal);
    document.getElementById('cancel-invite')?.addEventListener('click', closeInviteModal);
    
    // Send invitation
    document.getElementById('send-invite')?.addEventListener('click', sendInvitation);
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && inviteModal.classList.contains('open')) {
            closeInviteModal();
        }
    });
}

function openInviteModal() {
    const modal = document.getElementById('invite-user-modal');
    if (modal) {
        modal.classList.add('open');
        document.getElementById('invite-email')?.focus();
        
        // Populate projects dropdown
        populateProjectsForInvite();
    }
}

function closeInviteModal() {
    const modal = document.getElementById('invite-user-modal');
    if (modal) {
        modal.classList.remove('open');
        
        // Clear form
        const emailInput = document.getElementById('invite-email');
        const roleSelect = document.getElementById('invite-role');
        const projectsSelect = document.getElementById('invite-projects');
        
        if (emailInput) emailInput.value = '';
        if (roleSelect) roleSelect.value = 'client';
        if (projectsSelect) {
            Array.from(projectsSelect.options).forEach(opt => opt.selected = false);
        }
    }
}

function populateProjectsForInvite() {
    const projectsSelect = document.getElementById('invite-projects');
    if (!projectsSelect) return;
    
    projectsSelect.innerHTML = state.projects.map(p => 
        `<option value="${p.id}">${escapeHtml(p.name)}</option>`
    ).join('');
}

async function sendInvitation() {
    const email = document.getElementById('invite-email')?.value.trim();
    const role = document.getElementById('invite-role')?.value || 'client';
    const projectsSelect = document.getElementById('invite-projects');
    const selectedProjects = projectsSelect ? 
        Array.from(projectsSelect.selectedOptions).map(opt => opt.value) : [];
    
    if (!email) {
        showToast('error', 'Please enter an email address');
        return;
    }
    
    if (!email.includes('@')) {
        showToast('error', 'Please enter a valid email address');
        return;
    }
    
    try {
        if (window.API) {
            const response = await window.API.inviteUser(email, role, selectedProjects);
            if (response.success) {
                showToast('success', `Invitation sent to ${email}`);
                closeInviteModal();
                await loadTeamData();
                renderTeam();
            } else {
                showToast('error', response.error || 'Failed to send invitation');
            }
        } else {
            // Mock success for demo
            showToast('success', `Invitation would be sent to ${email}`);
            closeInviteModal();
        }
    } catch (error) {
        console.error('Failed to send invitation:', error);
        showToast('error', 'Failed to send invitation');
    }
}

function renderTeam() {
    const membersContainer = document.getElementById('team-members-list');
    const invitationsContainer = document.getElementById('invitations-list');
    
    // Render team members
    if (membersContainer) {
        const members = state.users.filter(u => u.status === 'active');
        
        if (members.length > 0) {
            membersContainer.innerHTML = members.map(u => createTeamMemberCard(u)).join('');
        } else {
            membersContainer.innerHTML = `
                <div class="team-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
                        <circle cx="9" cy="7" r="4"/>
                        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
                        <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
                    </svg>
                    <p>No team members yet</p>
                </div>
            `;
        }
    }
    
    // Render invitations
    if (invitationsContainer) {
        const pending = state.invitations.filter(i => i.status === 'pending');
        
        if (pending.length > 0) {
            invitationsContainer.innerHTML = pending.map(i => createInvitationCard(i)).join('');
        } else {
            invitationsContainer.innerHTML = `
                <div class="team-empty">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>
                    </svg>
                    <p>No pending invitations</p>
                </div>
            `;
        }
    }
}

function createTeamMemberCard(user) {
    const initials = user.name.split(' ').map(n => n[0]).join('').toUpperCase();
    const joinDate = formatDate(user.createdAt);
    
    return `
        <div class="team-member-card">
            <div class="member-avatar ${user.role}">${initials}</div>
            <div class="member-info">
                <div class="member-name">${escapeHtml(user.name)}</div>
                <div class="member-email">${escapeHtml(user.email)}</div>
                <div class="member-meta">
                    <span class="role-tag ${user.role}">${user.role}</span>
                    <span class="member-date">Joined ${joinDate}</span>
                </div>
            </div>
            <div class="member-actions">
                <button onclick="viewUserDetails('${user.id}')" title="View Details">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                        <circle cx="12" cy="12" r="3"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function createInvitationCard(invitation) {
    const sentDate = formatDate(invitation.createdAt);
    const expiresDate = new Date(invitation.expiresAt);
    const isExpired = expiresDate < new Date();
    
    return `
        <div class="invitation-card">
            <div class="member-avatar client">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width: 20px; height: 20px;">
                    <path d="M22 17H2a3 3 0 0 0 3-3V9a7 7 0 0 1 14 0v5a3 3 0 0 0 3 3zm-8.27 4a2 2 0 0 1-3.46 0"/>
                </svg>
            </div>
            <div class="member-info">
                <div class="member-email">${escapeHtml(invitation.email)}</div>
                <div class="member-meta">
                    <span class="role-tag ${invitation.role}">${invitation.role}</span>
                    <span class="invitation-status ${isExpired ? 'expired' : ''}">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/>
                            <polyline points="12 6 12 12 16 14"/>
                        </svg>
                        ${isExpired ? 'Expired' : 'Pending'}
                    </span>
                    <span class="invitation-expires">Sent ${sentDate}</span>
                </div>
            </div>
            <div class="member-actions">
                <button onclick="resendInvitation('${invitation.id}')" title="Resend">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polyline points="23 4 23 10 17 10"/>
                        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
                    </svg>
                </button>
                <button onclick="cancelInvitation('${invitation.id}')" title="Cancel">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
    `;
}

function viewUserDetails(userId) {
    const user = state.users.find(u => u.id === userId);
    if (user) {
        showToast('info', `Viewing ${user.name}'s profile`);
        // Could open a detail modal here
    }
}

async function resendInvitation(invitationId) {
    showToast('info', 'Resending invitation...');
    // API call would go here
}

async function cancelInvitation(invitationId) {
    showToast('info', 'Cancelling invitation...');
    // API call would go here
}

// ===================================
// Toast Notifications
// ===================================

function showToast(type, message) {
    const container = document.getElementById('toast-container');
    
    const icons = {
        success: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
        error: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
        info: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>'
    };
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg class="toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            ${icons[type] || icons.info}
        </svg>
        <span class="toast-message">${escapeHtml(message)}</span>
    `;
    
    container.appendChild(toast);
    
    // Remove after animation
    setTimeout(() => {
        toast.remove();
    }, 3000);
}

// ===================================
// Utilities
// ===================================

function createEmptyState(title, description) {
    return `
        <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            </svg>
            <h3>${title}</h3>
            <p>${description}</p>
        </div>
    `;
}

function formatStatus(status) {
    const statusMap = {
        'pending': 'Pending',
        'in-review': 'In Review',
        'approved': 'Approved'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    
    if (minutes < 60) {
        return minutes <= 1 ? 'Just now' : `${minutes}m ago`;
    } else if (hours < 24) {
        return `${hours}h ago`;
    } else if (days < 7) {
        return `${days}d ago`;
    } else {
        return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }
}

function capitalize(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ===================================
// Settings (Basic)
// ===================================

// Settings can be extended as needed
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        const displayNameInput = document.getElementById('display-name');
        const emailInput = document.getElementById('user-email');
        
        if (displayNameInput) {
            displayNameInput.value = state.settings.displayName;
            displayNameInput.addEventListener('change', (e) => {
                state.settings.displayName = e.target.value;
                saveState();
                document.querySelector('.user-name').textContent = e.target.value;
                document.querySelector('.user-avatar span').textContent = e.target.value.charAt(0).toUpperCase();
            });
        }
        
        if (emailInput) {
            emailInput.value = state.settings.email;
            emailInput.addEventListener('change', (e) => {
                state.settings.email = e.target.value;
                saveState();
            });
        }
    }, 2000);
});

