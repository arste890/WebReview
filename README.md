# StevensIT WebReview

A modern web application for showcasing developed websites to clients for review and feedback. Built with StevensIT branding and designed for deployment on Azure Static Web Apps with custom JWT authentication and invitation-based user management.

## Features

- **Dashboard Overview**: Quick stats and recent activity at a glance
- **Project Management**: Create, organize, and track web development projects
- **Website Preview**: Embedded iframe viewer with desktop, tablet, and mobile views
- **Client Feedback System**: Collect and organize feedback with priority levels
- **Invitation-Based Authentication**: Secure JWT-based authentication without requiring Azure AD membership
- **Team Management**: Developers can invite clients and manage team access
- **Role-Based Access**: Separate permissions and views for developers and clients
- **Responsive Design**: Works on all screen sizes
- **API Backend**: Azure Functions with Cosmos DB for persistent data storage

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Azure Static Web Apps                     │
├─────────────────────┬───────────────────────────────────────┤
│    Static Files     │           Azure Functions API          │
│  (HTML, CSS, JS)    │         (Node.js 18 Runtime)          │
│                     │                                        │
│  - index.html       │  /api/auth/* - Authentication         │
│  - login.html       │  /api/users/* - User management       │
│  - signup.html      │  /api/projects/* - Projects CRUD      │
│  - styles.css       │  /api/feedback/* - Feedback system    │
│  - app.js           │                                        │
│  - auth.js          │                                        │
└─────────────────────┴───────────────────────────────────────┘
                                  │
                                  ▼
                     ┌────────────────────────┐
                     │    Azure Cosmos DB     │
                     │                        │
                     │  Collections:          │
                     │  - users               │
                     │  - projects            │
                     │  - feedback            │
                     │  - invitations         │
                     │  - sessions            │
                     └────────────────────────┘
```

## Getting Started

### Option 1: Local Development (Frontend Only)
Simply open `index.html` in a modern web browser. The app will use sample data.

### Option 2: Local Development with API

1. **Install Azure Functions Core Tools**:
   ```bash
   npm install -g azure-functions-core-tools@4
   ```

2. **Setup the API**:
   ```bash
   cd api
   npm install
   ```

3. **Configure environment variables** - Create `api/local.settings.json`:
   ```json
   {
     "IsEncrypted": false,
     "Values": {
       "FUNCTIONS_WORKER_RUNTIME": "node",
       "AzureWebJobsStorage": "",
       "COSMOS_CONNECTION_STRING": "your-cosmos-connection-string",
       "COSMOS_DATABASE": "webreview",
       "JWT_SECRET": "your-secure-secret-key-min-32-chars",
       "SMTP_HOST": "smtp.example.com",
       "SMTP_PORT": "587",
       "SMTP_USER": "your-email",
       "SMTP_PASS": "your-password",
       "APP_URL": "http://localhost:4280"
     }
   }
   ```

4. **Run the Static Web App locally**:
   ```bash
   npm install -g @azure/static-web-apps-cli
   swa start . --api-location ./api
   ```

5. Navigate to `http://localhost:4280`

### Option 3: Deploy to Azure (Production)
See [Azure Deployment](#azure-deployment) section below.

## Project Structure

```
WebReview/
├── index.html                    # Main application
├── login.html                    # Login page
├── signup.html                   # Invitation-based registration
├── styles.css                    # All styles (StevensIT branding)
├── app.js                        # Application logic
├── auth.js                       # Authentication API client
├── staticwebapp.config.json      # Azure Static Web Apps config
├── api/                          # Azure Functions backend
│   ├── package.json
│   ├── host.json
│   ├── local.settings.json       # Local environment (not committed)
│   └── src/
│       ├── shared/
│       │   ├── database.js       # Cosmos DB operations
│       │   ├── auth.js           # JWT & password utilities
│       │   └── email.js          # Invitation emails
│       └── functions/
│           ├── auth.js           # Auth endpoints
│           ├── users.js          # User management
│           ├── projects.js       # Projects CRUD
│           └── feedback.js       # Feedback system
├── .github/
│   └── workflows/
│       └── azure-static-web-apps.yml
└── README.md
```

## User Roles

| Role | Permissions |
|------|-------------|
| **Admin** | Full access, manage all users, projects, and settings |
| **Developer** | Create projects, invite clients, view all feedback, manage assigned projects |
| **Client** | View assigned projects, submit and view feedback on assigned projects |

## Authentication Flow

1. **Developers** are added by admins or sign up with an admin invite
2. **Clients** receive an email invitation from a developer
3. Invitation link directs to signup page with pre-filled email
4. Users set their name and password to complete registration
5. JWT tokens are issued on login and stored in localStorage
6. Tokens expire after 7 days and can be refreshed

## Azure Deployment

### Prerequisites

- Azure subscription
- GitHub account
- Azure CLI installed (optional but recommended)

### Step 1: Create Azure Resources

1. **Create a Resource Group**:
   ```bash
   az group create --name webreview-rg --location eastus
   ```

2. **Create Cosmos DB Account**:
   ```bash
   az cosmosdb create \
     --name webreview-cosmos \
     --resource-group webreview-rg \
     --kind GlobalDocumentDB
   
   # Create database
   az cosmosdb sql database create \
     --account-name webreview-cosmos \
     --resource-group webreview-rg \
     --name webreview
   
   # Create containers
   for container in users projects feedback invitations sessions; do
     az cosmosdb sql container create \
       --account-name webreview-cosmos \
       --resource-group webreview-rg \
       --database-name webreview \
       --name $container \
       --partition-key-path "/partitionKey"
   done
   ```

3. **Create Static Web App**:
   ```bash
   az staticwebapp create \
     --name webreview-app \
     --resource-group webreview-rg \
     --source https://github.com/YOUR_USERNAME/WebReview \
     --branch main \
     --app-location "/" \
     --api-location "api" \
     --output-location "/"
   ```

### Step 2: Configure App Settings

In Azure Portal > Static Web App > Configuration > Application settings:

| Setting | Value |
|---------|-------|
| `COSMOS_CONNECTION_STRING` | Get from Cosmos DB > Keys |
| `COSMOS_DATABASE` | `webreview` |
| `JWT_SECRET` | Generate a secure 32+ character string |
| `SMTP_HOST` | Your SMTP server |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |
| `APP_URL` | Your Static Web App URL |

### Step 3: Create Initial Admin User

After deployment, you'll need to create the first admin user. You can:

1. **Use Azure Portal** - Go to Cosmos DB > Data Explorer > users container and create a document:
   ```json
   {
     "id": "admin-user-id",
     "email": "admin@example.com",
     "passwordHash": "[bcrypt hash of password]",
     "name": "Admin User",
     "role": "admin",
     "status": "active",
     "partitionKey": "user",
     "createdAt": "2024-01-01T00:00:00.000Z"
   }
   ```

2. **Or run a setup script** locally connected to your Cosmos DB

## Customization

### Branding
Edit CSS variables in `styles.css`:

```css
:root {
    --primary: #1e5fa8;        /* StevensIT Blue */
    --primary-dark: #164785;   
    --primary-light: #2d7fd4;  
    --accent: #00b4d8;         
}
```
3. Choose a priority level
4. Enter your feedback details
5. Click "Submit Feedback"

### Approving a Project
Click the "Approve" button while previewing a project to mark it as approved.

## Browser Support

- Chrome (recommended)
- Firefox
- Safari
- Edge

## Notes

- Some websites may not load in the iframe due to their security policies (X-Frame-Options)
- All data is stored locally in the browser using localStorage
- Sample projects are provided for demonstration
- Authentication is required when deployed to Azure

## License

© 2026 StevensIT. All rights reserved.

