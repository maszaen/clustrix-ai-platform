# ============================================================
# Clustrix Backend - Setup Secrets Script (PowerShell)
# ============================================================
# Run this ONCE to create secrets in Google Secret Manager
# Then deploy with --set-secrets to use them
# ============================================================

$ErrorActionPreference = "Stop"

Write-Host "🔐 Setting up secrets in Google Secret Manager..." -ForegroundColor Cyan
Write-Host ""

# Read from .env file
$envFile = Get-Content ".env" -ErrorAction SilentlyContinue

if (-not $envFile) {
    Write-Host "❌ .env file not found. Create one first." -ForegroundColor Red
    exit 1
}

# Parse and create secrets
$secrets = @(
    "OPENAI_API_KEY",
    "GEMINI_API_KEY", 
    "ANTHROPIC_API_KEY",
    "GROQ_API_KEY",
    "DEEPSEEK_API_KEY",
    "XAI_API_KEY",
    "MISTRAL_API_KEY",
    "OPENROUTER_API_KEY",
    "PERPLEXITY_API_KEY",
    "CEREBRAS_API_KEY",
    "ZHIPU_API_KEY",
    "BIGMODEL_API_KEY",
    "MEGALLM_API_KEY",
    "TAVILY_API_KEY",
    "SERPAPI_API_KEY",
    "GOOGLE_SEARCH_API_KEY",
    "GOOGLE_CSE_ID",
    "ADMIN_SECRET"
)

foreach ($secretName in $secrets) {
    $line = $envFile | Where-Object { $_ -match "^$secretName=" }
    if ($line) {
        $value = ($line -split "=", 2)[1]
        if ($value -and $value.Length -gt 3) {
            Write-Host "Creating secret: $secretName" -ForegroundColor Yellow
            
            # Delete if exists
            gcloud secrets delete $secretName.ToLower().Replace("_", "-") --quiet 2>$null
            
            # Create new
            echo $value | gcloud secrets create $secretName.ToLower().Replace("_", "-") --data-file=-
        }
    }
}

Write-Host ""
Write-Host "✅ Secrets created! Use --set-secrets in deploy command." -ForegroundColor Green
