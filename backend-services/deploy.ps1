# ============================================================
# Clustrix Backend - Google Cloud Run Deploy Script (PowerShell)
# ============================================================
# 
# Prerequisites:
# 1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install
# 2. Run: gcloud auth login
# 3. Run: gcloud config set project YOUR_PROJECT_ID
#
# Usage:
#   .\deploy.ps1
# ============================================================

$ErrorActionPreference = "Stop"

# Configuration - EDIT THESE
$PROJECT_ID = "clustrix-backend"  # Your GCP project ID
$SERVICE_NAME = "clustrix-backend"
$REGION = "asia-southeast1"  # Change to your preferred region

Write-Host "🚀 Deploying Clustrix Backend to Cloud Run..." -ForegroundColor Cyan
Write-Host ""

# Check if gcloud is installed
if (-not (Get-Command gcloud -ErrorAction SilentlyContinue)) {
    Write-Host "❌ gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install" -ForegroundColor Red
    exit 1
}

# Set project
Write-Host "📋 Setting project to $PROJECT_ID..." -ForegroundColor Yellow
gcloud config set project $PROJECT_ID

# Enable required APIs
Write-Host "🔧 Enabling required APIs..." -ForegroundColor Yellow
gcloud services enable run.googleapis.com --quiet
gcloud services enable cloudbuild.googleapis.com --quiet

# Deploy to Cloud Run
Write-Host "🏗️  Building and deploying..." -ForegroundColor Yellow
Write-Host ""

gcloud run deploy $SERVICE_NAME `
    --source . `
    --region $REGION `
    --platform managed `
    --allow-unauthenticated `
    --port 8080 `
    --memory 512Mi `
    --cpu 1 `
    --min-instances 0 `
    --max-instances 10 `
    --set-env-vars "NODE_ENV=production"

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "✅ Deploy successful!" -ForegroundColor Green
    Write-Host ""
    
    # Get service URL
    $URL = gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.url)"
    Write-Host "🌐 Service URL: $URL" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📊 Admin Panel: $URL/admin?secret=YOUR_ADMIN_SECRET" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Next steps:" -ForegroundColor White
    Write-Host "1. Set environment variables in Cloud Console or use --set-secrets" -ForegroundColor Gray
    Write-Host "2. Update mobile app CLOUD_BASE_URL to: $URL" -ForegroundColor Gray
} else {
    Write-Host ""
    Write-Host "❌ Deploy failed. Check errors above." -ForegroundColor Red
    exit 1
}
