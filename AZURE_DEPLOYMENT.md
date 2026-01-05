# Azure Deployment Guide for StevensIT WebReview

This guide walks you through deploying the WebReview application to Azure Static Web Apps with Azure AD authentication.

## Prerequisites

- Azure subscription with appropriate permissions
- GitHub account (for repository and CI/CD)
- Azure AD (Entra ID) tenant access for app registration

---

## Step 1: Create Azure Static Web App

### Via Azure Portal

1. Go to [Azure Portal](https://portal.azure.com)
2. Click **Create a resource** → Search for **Static Web Apps**
3. Click **Create**
4. Fill in the details:
   - **Subscription**: Select your Azure subscription
   - **Resource Group**: Create new or select existing
   - **Name**: `stevensit-webreview` (or your preferred name)
   - **Plan type**: Free or Standard (Standard required for custom auth)
   - **Region**: Select closest to your users
   - **Source**: GitHub
5. Sign in to GitHub and authorize Azure
6. Select:
   - **Organization**: Your GitHub org/account
   - **Repository**: Your WebReview repository
   - **Branch**: `main`
7. Build Details:
   - **Build Presets**: Custom
   - **App location**: `/`
   - **Output location**: (leave empty)
8. Click **Review + create** → **Create**

### Via Azure CLI

```bash
# Login to Azure
az login

# Create resource group (if needed)
az group create --name rg-stevensit-webreview --location eastus

# Create Static Web App
az staticwebapp create \
  --name stevensit-webreview \
  --resource-group rg-stevensit-webreview \
  --source https://github.com/YOUR_USERNAME/WebReview \
  --location "eastus2" \
  --branch main \
  --app-location "/" \
  --output-location "" \
  --login-with-github
```

---

## Step 2: Configure Azure AD Authentication

### 2.1 Register Application in Azure AD

1. Go to **Azure Portal** → **Microsoft Entra ID** (Azure AD)
2. Navigate to **App registrations** → **New registration**
3. Fill in:
   - **Name**: `StevensIT WebReview`
   - **Supported account types**: 
     - For internal only: "Accounts in this organizational directory only"
     - For external: "Accounts in any organizational directory and personal Microsoft accounts"
   - **Redirect URI**: 
     - Platform: **Web**
     - URL: `https://YOUR-STATIC-WEB-APP.azurestaticapps.net/.auth/login/aad/callback`
4. Click **Register**

### 2.2 Configure App Registration

After registration:

1. Note the **Application (client) ID** - you'll need this
2. Note the **Directory (tenant) ID** - you'll need this
3. Go to **Certificates & secrets** → **New client secret**
   - Description: `WebReview Auth Secret`
   - Expiry: Choose appropriate duration
   - Click **Add** and **copy the secret value immediately**

4. Go to **Authentication**:
   - Under **Implicit grant and hybrid flows**, check:
     - ✅ Access tokens
     - ✅ ID tokens
   - Click **Save**

5. Go to **API permissions**:
   - Ensure `User.Read` is present (for basic profile info)
   - Click **Grant admin consent** if required

### 2.3 Add Secrets to Static Web App

1. Go to your Static Web App in Azure Portal
2. Navigate to **Configuration** → **Application settings**
3. Add these settings:

| Name | Value |
|------|-------|
| `AAD_CLIENT_ID` | Your Application (client) ID |
| `AAD_CLIENT_SECRET` | Your client secret value |

4. Click **Save**

### 2.4 Update staticwebapp.config.json

Update the tenant ID in your `staticwebapp.config.json`:

```json
{
  "auth": {
    "identityProviders": {
      "azureActiveDirectory": {
        "registration": {
          "openIdIssuer": "https://login.microsoftonline.com/YOUR-TENANT-ID/v2.0",
          "clientIdSettingName": "AAD_CLIENT_ID",
          "clientSecretSettingName": "AAD_CLIENT_SECRET"
        }
      }
    }
  }
}
```

Replace `YOUR-TENANT-ID` with your actual Azure AD tenant ID.

---

## Step 3: Configure Role-Based Access (Optional)

### Define Roles in Azure AD

1. Go to your App Registration → **App roles** → **Create app role**
2. Create roles:

| Display Name | Value | Description |
|-------------|-------|-------------|
| Developer | developer | Can create and manage projects |
| Reviewer | reviewer | Can view projects and submit feedback |
| Admin | admin | Full administrative access |

### Assign Users to Roles

1. Go to **Enterprise applications** → Find "StevensIT WebReview"
2. Go to **Users and groups** → **Add user/group**
3. Select users and assign appropriate roles

### Update staticwebapp.config.json for Roles

```json
{
  "routes": [
    {
      "route": "/api/admin/*",
      "allowedRoles": ["admin"]
    },
    {
      "route": "/api/projects/create",
      "allowedRoles": ["developer", "admin"]
    },
    {
      "route": "/*",
      "allowedRoles": ["authenticated"]
    }
  ]
}
```

---

## Step 4: Enable GitHub Authentication (Optional)

For developer access via GitHub:

### 4.1 Create GitHub OAuth App

1. Go to GitHub → Settings → Developer settings → OAuth Apps → New OAuth App
2. Fill in:
   - **Application name**: StevensIT WebReview
   - **Homepage URL**: `https://YOUR-STATIC-WEB-APP.azurestaticapps.net`
   - **Authorization callback URL**: `https://YOUR-STATIC-WEB-APP.azurestaticapps.net/.auth/login/github/callback`
3. Click **Register application**
4. Copy the **Client ID**
5. Generate a **Client secret** and copy it

### 4.2 Add to Static Web App Settings

Add these application settings:

| Name | Value |
|------|-------|
| `GITHUB_CLIENT_ID` | Your GitHub Client ID |
| `GITHUB_CLIENT_SECRET` | Your GitHub Client Secret |

---

## Step 5: GitHub Actions Secrets

The deployment workflow needs the API token:

1. Go to your Static Web App → **Overview** → **Manage deployment token**
2. Copy the token
3. Go to your GitHub repository → **Settings** → **Secrets and variables** → **Actions**
4. Create secret: `AZURE_STATIC_WEB_APPS_API_TOKEN` with the token value

---

## Step 6: Deploy

Push your code to the `main` branch:

```bash
git add .
git commit -m "Configure Azure deployment with authentication"
git push origin main
```

The GitHub Action will automatically deploy your app.

---

## Verification

1. Visit your Static Web App URL (found in Azure Portal overview)
2. You should be redirected to the login page
3. Sign in with Microsoft or GitHub
4. After successful auth, you should see the WebReview dashboard

---

## Custom Domain (Optional)

1. Go to Static Web App → **Custom domains**
2. Click **Add** → **Custom domain on other DNS**
3. Enter your domain (e.g., `webreview.stevensed.org`)
4. Add the CNAME record to your DNS provider
5. Azure will automatically provision SSL certificate

---

## Troubleshooting

### "401 Unauthorized" after login
- Verify AAD_CLIENT_ID and AAD_CLIENT_SECRET are correct
- Check the redirect URI matches exactly
- Ensure tenant ID is correct in config

### GitHub login not working
- Verify callback URL in GitHub OAuth app
- Check GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET settings

### Users can't see roles
- Ensure roles are defined in App Registration
- Assign users to roles in Enterprise Applications
- Check role claims are being returned

### Deployment fails
- Check GitHub Actions logs
- Verify API token is correct
- Ensure staticwebapp.config.json is valid JSON

---

## Security Best Practices

1. **Use Standard plan** for production (enables custom auth, more routes)
2. **Rotate secrets** periodically
3. **Enable MFA** for Azure AD users
4. **Monitor sign-ins** via Azure AD sign-in logs
5. **Set token expiry** appropriately for your security requirements
6. **Review permissions** regularly

---

## Support

For issues with this deployment:
- Check [Azure Static Web Apps documentation](https://docs.microsoft.com/azure/static-web-apps/)
- Review [Azure AD authentication docs](https://docs.microsoft.com/azure/static-web-apps/authentication-authorization)
- Contact StevensIT support

---

© 2026 StevensIT. All rights reserved.
