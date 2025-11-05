# Clustrix Auto-Updater Setup Guide

Complete setup guide for the custom auto-updater with license validation and secure updates via GitHub private repository.

## 🏗️ Architecture Overview

```
┌─────────────┐     HTTPS     ┌──────────────┐     MongoDB    ┌─────────────┐
│  Electron   │─────────────▶ │ Vercel API   │───────────────▶│  MongoDB    │
│  App Client │               │ (Serverless) │                │  Database   │
└─────────────┘               └──────────────┘                └─────────────┘
      │                              │
      │                              ▼
      │                       ┌──────────────┐
      │                       │  GitHub API  │
      │                       │ (with token) │
      │                       └──────────────┘
      │                              │
      └──────────────────────────────┘
        Download installer file
```

**Flow:**
1. User clicks "Check for Updates" → prompts for license key (if not stored)
2. App validates license key via Vercel API
3. Vercel API checks GitHub for latest release (using GH_TOKEN)
4. If update available, Vercel generates signed download URL
5. App downloads installer directly from GitHub
6. User clicks "Install and Restart"

**Security:**
- ✅ License key validated server-side
- ✅ GitHub token never exposed to client
- ✅ Download URLs are temporary (1 hour expiry)
- ✅ All downloads tracked in MongoDB
- ✅ Private repository remains private

---

## 📋 Prerequisites

1. **MongoDB Atlas Account** (Free tier works fine)
   - Sign up: https://www.mongodb.com/cloud/atlas/register

2. **Vercel Account** (Free tier works fine)
   - Sign up: https://vercel.com/signup

3. **GitHub Personal Access Token**
   - Create at: https://github.com/settings/tokens

---

## 🚀 Step 1: MongoDB Setup

### 1.1 Create MongoDB Cluster

1. Go to https://cloud.mongodb.com
2. Click "Build a Database"
3. Choose "FREE" tier (M0 Sandbox)
4. Select a cloud provider and region (closest to your users)
5. Name your cluster (e.g., "clustrix-production")
6. Click "Create"

### 1.2 Create Database User

1. In MongoDB Atlas, go to "Database Access"
2. Click "Add New Database User"
3. Choose "Password" authentication
4. Username: `clustrix_api`
5. Generate a secure password (save it!)
6. Database User Privileges: "Read and write to any database"
7. Click "Add User"

### 1.3 Whitelist IP Addresses

1. Go to "Network Access"
2. Click "Add IP Address"
3. Click "Allow Access from Anywhere" (Vercel uses dynamic IPs)
4. Confirm

### 1.4 Get Connection String

1. Go to "Database" → "Connect" → "Connect your application"
2. Copy the connection string:
   ```
   mongodb+srv://clustrix_api:<password>@cluster.mongodb.net/?retryWrites=true&w=majority
   ```
3. Replace `<password>` with your database user password

### 1.5 Create Collections and Indexes

Connect using MongoDB Compass or mongosh:

```javascript
// Create database
use clustrix

// Create licenses collection
db.createCollection("licenses")

// Create indexes for licenses
db.licenses.createIndex({ "key": 1 }, { unique: true })
db.licenses.createIndex({ "email": 1 })
db.licenses.createIndex({ "active": 1, "expiresAt": 1 })

// Create update_logs collection
db.createCollection("update_logs")
db.update_logs.createIndex({ "timestamp": -1 })
db.update_logs.createIndex({ "licenseKey": 1 })

// Create download_logs collection
db.createCollection("download_logs")
db.download_logs.createIndex({ "timestamp": -1 })
db.download_logs.createIndex({ "licenseKey": 1 })

// Insert sample license for testing
db.licenses.insertOne({
  key: "CLUSTRIX-TEST-LICENSE-KEY-12345",
  email: "test@example.com",
  name: "Test User",
  type: "standard",
  active: true,
  features: ["updates", "support"],
  createdAt: new Date(),
  activatedAt: new Date(),
  expiresAt: null,  // null = lifetime license
  downloadCount: 0
})
```

---

## 🚀 Step 2: GitHub Token Setup

### 2.1 Create Fine-Grained Personal Access Token (Recommended)

1. Go to https://github.com/settings/tokens?type=beta
2. Click "Generate new token"
3. Token name: `clustrix-updater-api`
4. Expiration: Choose appropriate duration
5. Repository access: **"Only select repositories"**
6. Select: `maszaen/clustrix-ai-platform`
7. Permissions:
   - **Contents**: Read and write ✅
   - **Metadata**: Read-only (auto-selected) ✅
8. Click "Generate token"
9. **SAVE THE TOKEN** - you won't see it again!

### 2.2 Alternative: Classic Token

1. Go to https://github.com/settings/tokens
2. Click "Generate new token (classic)"
3. Note: `clustrix-updater-api`
4. Select scopes:
   - ✅ **repo** (Full control of private repositories)
5. Click "Generate token"
6. **SAVE THE TOKEN**

---

## 🚀 Step 3: Vercel Deployment

### 3.1 Install Vercel CLI (Optional)

```bash
npm install -g vercel
```

### 3.2 Deploy to Vercel

#### Option A: Via Vercel Dashboard (Easiest)

1. Go to https://vercel.com/new
2. Import your GitHub repository: `maszaen/clustrix-ai-platform`
3. Configure project:
   - **Framework Preset**: Other
   - **Root Directory**: `./` (leave empty)
   - **Build Command**: (leave empty)
   - **Output Directory**: (leave empty)

4. **Add Environment Variables:**

   ```
   MONGODB_URI=mongodb+srv://clustrix_api:YOUR_PASSWORD@cluster.mongodb.net
   MONGODB_DB_NAME=clustrix
   GH_TOKEN=ghp_your_github_token_here
   GITHUB_REPO_OWNER=maszaen
   GITHUB_REPO_NAME=clustrix-ai-platform
   NODE_ENV=production
   ```

5. Click "Deploy"
6. Wait for deployment to complete
7. Copy your Vercel URL (e.g., `https://clustrix-ai-platform.vercel.app`)

#### Option B: Via Vercel CLI

```bash
# Login to Vercel
vercel login

# Deploy
vercel --prod

# Add environment variables
vercel env add MONGODB_URI production
vercel env add MONGODB_DB_NAME production
vercel env add GH_TOKEN production
vercel env add GITHUB_REPO_OWNER production
vercel env add GITHUB_REPO_NAME production
```

### 3.3 Test API Endpoints

Test your deployed API:

```bash
# Test license validation
curl -X POST https://your-app.vercel.app/api/validate-license \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"CLUSTRIX-TEST-LICENSE-KEY-12345"}'

# Test update check
curl -X POST https://your-app.vercel.app/api/check-update \
  -H "Content-Type: application/json" \
  -d '{"licenseKey":"CLUSTRIX-TEST-LICENSE-KEY-12345","currentVersion":"1.0.0"}'
```

Expected response for license validation:
```json
{
  "success": true,
  "valid": true,
  "license": {
    "email": "test@example.com",
    "name": "Test User",
    "type": "standard",
    "expiresAt": null,
    "features": ["updates", "support"],
    "isLifetime": true
  }
}
```

---

## 🚀 Step 4: Configure Electron App

### 4.1 Update Environment Variable

Create or update `.env` file in your project root:

```env
UPDATE_API_URL=https://your-app.vercel.app/api
```

Replace `your-app.vercel.app` with your actual Vercel URL.

### 4.2 Update main.js (Already Done)

The custom updater is already configured in `main.js`. It reads `UPDATE_API_URL` from environment variables.

### 4.3 Build and Test

```bash
# Install dependencies (if not already)
npm install

# Test the app
npm start

# Click "App Version" menu
# Click "Check for Updates"
# Enter license key: CLUSTRIX-TEST-LICENSE-KEY-12345
```

---

## 🚀 Step 5: Publishing Releases

### 5.1 Create a GitHub Release

1. Build your app:
   ```bash
   npm run make
   ```

2. Find the installer in `out/` directory (e.g., `Clustrix-Setup-34.9.0.exe`)

3. Create GitHub release:
   ```bash
   # Via GitHub CLI
   gh release create v34.9.0 \
     --title "Clustrix v34.9.0" \
     --notes "Release notes here" \
     ./out/Clustrix-Setup-34.9.0.exe

   # Or manually:
   # 1. Go to: https://github.com/maszaen/clustrix-ai-platform/releases/new
   # 2. Tag: v34.9.0
   # 3. Title: Clustrix v34.9.0
   # 4. Description: Your release notes
   # 5. Upload: Clustrix-Setup-34.9.0.exe
   # 6. Click "Publish release"
   ```

4. The release is now available for updates!

---

## 🧪 Testing the Complete Flow

### Test Scenario 1: Update Available

1. Build version `34.9.0` and install it
2. Create GitHub release for version `34.10.0`
3. Open app → "App Version" menu
4. Click "Check for Updates"
5. Enter license key: `CLUSTRIX-TEST-LICENSE-KEY-12345`
6. Should show: "Update Available! v34.10.0"
7. Click "Download Update"
8. Progress bar should appear
9. Click "Install and Restart"
10. App should quit and installer should launch

### Test Scenario 2: No Update Available

1. Create GitHub release for version `34.9.0`
2. Open app (version `34.9.0`)
3. Click "Check for Updates"
4. Should show: "You're running the latest version!"

### Test Scenario 3: Invalid License

1. Click "Check for Updates"
2. Enter invalid license key: `INVALID-KEY`
3. Should show: "Invalid license key"

---

## 📊 Monitoring and Analytics

### View Update Logs in MongoDB

```javascript
// Recent update checks
db.update_logs.find().sort({ timestamp: -1 }).limit(10)

// Updates by license
db.update_logs.aggregate([
  { $group: {
    _id: "$licenseKey",
    count: { $sum: 1 },
    lastCheck: { $max: "$timestamp" }
  }}
])

// Download statistics
db.download_logs.aggregate([
  { $group: {
    _id: { $dateToString: { format: "%Y-%m-%d", date: "$timestamp" } },
    downloads: { $sum: 1 }
  }},
  { $sort: { _id: -1 }}
])
```

---

## 🔒 Security Best Practices

1. **Never commit `.env` file** - it's already in `.gitignore`
2. **Rotate GitHub tokens** every 90 days
3. **Use fine-grained tokens** instead of classic tokens
4. **Monitor MongoDB logs** for suspicious activity
5. **Set up MongoDB Atlas alerts** for unusual access patterns
6. **Enable MongoDB Atlas encryption** (already enabled by default)
7. **Use Vercel environment variables** - never hardcode secrets

---

## 🐛 Troubleshooting

### Error: "GH_TOKEN is not set"

- Check Vercel environment variables
- Redeploy after adding environment variables

### Error: "MONGODB_URI environment variable is not set"

- Check Vercel environment variables
- Ensure connection string is correct
- Check MongoDB Atlas whitelist

### Error: "License key not set"

- Clear localStorage: `localStorage.removeItem('clustrix_license_key')`
- Enter license key again

### Error: "Failed to fetch latest release"

- Check GitHub token permissions
- Verify repository name is correct
- Check GitHub API rate limits

### Updates not detected

- Verify release tag format: `v1.2.3` (must start with 'v')
- Check release is published (not draft)
- Verify installer file exists in release assets

---

## 💰 Cost Estimate

| Service | Free Tier | Expected Cost |
|---------|-----------|---------------|
| **MongoDB Atlas** | 512MB storage, Shared RAM | FREE |
| **Vercel** | 100GB bandwidth, Unlimited API calls | FREE (for most cases) |
| **GitHub** | Private repo, Unlimited releases | FREE |
| **Total** | | **$0/month** for small-medium apps |

---

## 📝 License Key Management

### Generate License Keys

You can use any format, but here's a recommended approach:

```javascript
// Example license key generator
function generateLicenseKey() {
  const prefix = 'CLUSTRIX';
  const random = Math.random().toString(36).substring(2, 15).toUpperCase();
  const checksum = Math.random().toString(36).substring(2, 7).toUpperCase();
  return `${prefix}-${random}-${checksum}`;
}

// Example: CLUSTRIX-X7F9K2M8H3L-A9B4C
```

### Create License in MongoDB

```javascript
db.licenses.insertOne({
  key: generateLicenseKey(),
  email: "customer@example.com",
  name: "Customer Name",
  type: "standard", // or "pro", "enterprise"
  active: true,
  features: ["updates", "support", "priority"],
  createdAt: new Date(),
  activatedAt: new Date(),
  expiresAt: new Date("2025-12-31"), // or null for lifetime
  downloadCount: 0,
  maxDevices: 1,
  metadata: {
    purchaseOrderId: "PO-12345",
    paymentMethod: "stripe"
  }
})
```

---

## 🎯 Next Steps

1. ✅ Set up MongoDB cluster
2. ✅ Create GitHub token
3. ✅ Deploy to Vercel
4. ✅ Test API endpoints
5. ✅ Configure Electron app
6. ✅ Create test release
7. ✅ Test complete update flow
8. 📧 Set up email notifications (optional)
9. 📊 Create admin dashboard (optional)
10. 🚀 Launch!

---

## 📞 Support

If you encounter any issues:

1. Check the logs in Vercel dashboard
2. Check MongoDB Atlas logs
3. Check Electron app logs (via "Help" → "View Logs")
4. Create an issue on GitHub

---

**Made with ❤️ by Maszaen Corporation**
