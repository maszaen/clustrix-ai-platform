# Deploy Clustrix Backend to Cloud Run
# Usage: .\deploy.ps1

$SERVICE_NAME = "clustrix-backend"
$REGION = "asia-southeast1"

Write-Host "Deploying $SERVICE_NAME to Cloud Run ($REGION)..." -ForegroundColor Cyan

gcloud run deploy $SERVICE_NAME `
  --source . `
  --region $REGION `
  --allow-unauthenticated `
  --quiet

if ($LASTEXITCODE -eq 0) {
  Write-Host "`nDeployment successful!" -ForegroundColor Green
  $URL = gcloud run services describe $SERVICE_NAME --region $REGION --format="value(status.url)"
  Write-Host "Service URL: $URL" -ForegroundColor Cyan
} else {
  Write-Host "`nDeployment failed!" -ForegroundColor Red
  exit 1
}
