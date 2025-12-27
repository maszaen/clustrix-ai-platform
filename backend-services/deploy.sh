#!/bin/bash
# ============================================================
# Clustrix Backend - Google Cloud Run Deploy Script (Bash)
# ============================================================
# 
# Prerequisites:
# 1. Install gcloud CLI: https://cloud.google.com/sdk/docs/install
# 2. Run: gcloud auth login
# 3. Run: gcloud config set project YOUR_PROJECT_ID
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh
# ============================================================

set -e

# Configuration - EDIT THESE
PROJECT_ID="clustrix-backend"  # Your GCP project ID
SERVICE_NAME="clustrix-backend"
REGION="asia-southeast1"  # Change to your preferred region

echo "🚀 Deploying Clustrix Backend to Cloud Run..."
echo ""

# Check if gcloud is installed
if ! command -v gcloud &> /dev/null; then
    echo "❌ gcloud CLI not found. Install from: https://cloud.google.com/sdk/docs/install"
    exit 1
fi

# Set project
echo "📋 Setting project to $PROJECT_ID..."
gcloud config set project $PROJECT_ID

# Enable required APIs
echo "🔧 Enabling required APIs..."
gcloud services enable run.googleapis.com --quiet
gcloud services enable cloudbuild.googleapis.com --quiet

# Deploy to Cloud Run
echo "🏗️  Building and deploying..."
echo ""

gcloud run deploy $SERVICE_NAME \
    --source . \
    --region $REGION \
    --platform managed \
    --allow-unauthenticated \
    --port 8080 \
    --memory 512Mi \
    --cpu 1 \
    --min-instances 0 \
    --max-instances 10 \
    --set-env-vars "NODE_ENV=production"

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Deploy successful!"
    echo ""
    
    # Get service URL
    URL=$(gcloud run services describe $SERVICE_NAME --region $REGION --format "value(status.url)")
    echo "🌐 Service URL: $URL"
    echo ""
    echo "📊 Admin Panel: $URL/admin?secret=YOUR_ADMIN_SECRET"
    echo ""
    echo "Next steps:"
    echo "1. Set environment variables in Cloud Console or use --set-secrets"
    echo "2. Update mobile app CLOUD_BASE_URL to: $URL"
else
    echo ""
    echo "❌ Deploy failed. Check errors above."
    exit 1
fi
