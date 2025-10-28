# Delete Marked Sections Script
# This script removes all code blocks marked with START/END DELETE markers
# from renderer.js

$ErrorActionPreference = "Stop"

$file = 'H:\VSCode\Clustrix-AI-Platform\renderer\renderer.js'
$backupFile = 'H:\VSCode\Clustrix-AI-Platform\renderer\renderer.js.backup'

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Delete Marked Sections Script" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Check if file exists
if (-not (Test-Path $file)) {
    Write-Host "ERROR: File not found: $file" -ForegroundColor Red
    exit 1
}

# Create backup
Write-Host "Creating backup..." -ForegroundColor Yellow
Copy-Item $file $backupFile -Force
Write-Host "Backup created: $backupFile" -ForegroundColor Green
Write-Host ""

# Read file
Write-Host "Reading file..." -ForegroundColor Yellow
$lines = Get-Content $file
$originalLineCount = $lines.Count
Write-Host "Original line count: $originalLineCount" -ForegroundColor Cyan
Write-Host ""

# Count markers
$startMarkers = ($lines | Select-String -Pattern '=== START DELETE ===').Count
$endMarkers = ($lines | Select-String -Pattern '=== END DELETE ===').Count
Write-Host "Found START markers: $startMarkers" -ForegroundColor Cyan
Write-Host "Found END markers: $endMarkers" -ForegroundColor Cyan

if ($startMarkers -ne $endMarkers) {
    Write-Host ""
    Write-Host "ERROR: Unbalanced markers! START=$startMarkers, END=$endMarkers" -ForegroundColor Red
    Write-Host "Please check the file for missing markers." -ForegroundColor Red
    exit 1
}

if ($startMarkers -eq 0) {
    Write-Host ""
    Write-Host "WARNING: No markers found. Nothing to delete." -ForegroundColor Yellow
    exit 0
}

Write-Host ""
Write-Host "Processing deletion..." -ForegroundColor Yellow

# Process lines
$output = @()
$deleting = $false
$deletedSections = 0
$deletedLines = 0
$currentSection = ""

foreach ($line in $lines) {
    if ($line -match '=== START DELETE ===\s*(.*)') {
        $deleting = $true
        $deletedSections++
        $currentSection = $matches[1]
        Write-Host "  Deleting section #${deletedSections}: $currentSection" -ForegroundColor DarkGray
        continue
    }
    
    if ($line -match '=== END DELETE ===') {
        $deleting = $false
        Write-Host "  Section #${deletedSections} deleted" -ForegroundColor DarkGray
        continue
    }
    
    if ($deleting) {
        $deletedLines++
    } else {
        $output += $line
    }
}

# Write output
Write-Host ""
Write-Host "Writing cleaned file..." -ForegroundColor Yellow
$output | Set-Content $file -Encoding UTF8

$newLineCount = $output.Count
$linesRemoved = $originalLineCount - $newLineCount

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "SUCCESS!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Statistics:" -ForegroundColor Cyan
Write-Host "  - Original lines: $originalLineCount" -ForegroundColor White
Write-Host "  - New lines: $newLineCount" -ForegroundColor White
Write-Host "  - Lines removed: $linesRemoved" -ForegroundColor Yellow
Write-Host "  - Sections deleted: $deletedSections" -ForegroundColor Yellow
Write-Host "  - Reduction: $([math]::Round(($linesRemoved / $originalLineCount) * 100, 2))%" -ForegroundColor Yellow
Write-Host ""
Write-Host "Backup saved at: $backupFile" -ForegroundColor Cyan
Write-Host ""
Write-Host "To restore backup if needed:" -ForegroundColor Gray
Write-Host "  Copy-Item '$backupFile' '$file' -Force" -ForegroundColor Gray
Write-Host ""
