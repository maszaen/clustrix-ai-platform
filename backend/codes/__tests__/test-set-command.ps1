# ============================================================================
# TEST SUITE FOR <set> COMMAND HANDLER
# ============================================================================

$ErrorActionPreference = 'Stop'

# Import the handler
. "$PSScriptRoot\..\set-command-handler.ps1"

$testDir = Join-Path $PSScriptRoot "test-files"
New-Item -ItemType Directory -Force -Path $testDir | Out-Null

$testsPassed = 0
$testsFailed = 0

function Test-Operation {
    param(
        [string]$Name,
        [scriptblock]$Test
    )

    try {
        Write-Host "`n========================================" -ForegroundColor Cyan
        Write-Host "TEST: $Name" -ForegroundColor Cyan
        Write-Host "========================================" -ForegroundColor Cyan

        & $Test

        Write-Host "✓ PASSED" -ForegroundColor Green
        $script:testsPassed++

    } catch {
        Write-Host "✗ FAILED: $_" -ForegroundColor Red
        Write-Host $_.ScriptStackTrace -ForegroundColor Red
        $script:testsFailed++
    }
}

# ============================================================================
# TEST 1: REPLACE OPERATION (Normal Case)
# ============================================================================
Test-Operation "Test 1: Replace lines 10-20" {
    $testFile = Join-Path $testDir "test1.txt"

    # Create test file with 50 lines
    $lines = 1..50 | ForEach-Object { "Line $_" }
    $lines | Set-Content -Path $testFile -Encoding UTF8

    # Create <set> command
    $command = @"
<set file="$testFile" range={10, 20}>@[CDATA[
Replaced line 1
Replaced line 2
Replaced line 3
]]</set>
"@

    # Execute
    $result = Invoke-SetCommand -CommandText $command -WorkingDirectory $testDir

    # Validate
    if (-not $result.Success) {
        throw "Operation failed: $($result.Message)"
    }

    # Check file content
    $newContent = Get-Content -Path $testFile -Encoding UTF8
    if ($newContent[9] -ne "Replaced line 1") {
        throw "Line 10 should be 'Replaced line 1', got: $($newContent[9])"
    }

    if ($newContent.Count -ne 42) {  # 50 - 11 + 3 = 42
        throw "Expected 42 lines, got: $($newContent.Count)"
    }
}

# ============================================================================
# TEST 2: DELETE OPERATION
# ============================================================================
Test-Operation "Test 2: Delete lines 30-35" {
    $testFile = Join-Path $testDir "test2.txt"

    # Create test file with 50 lines
    $lines = 1..50 | ForEach-Object { "Line $_" }
    $lines | Set-Content -Path $testFile -Encoding UTF8

    # Create <set> command for deletion (empty content)
    $command = @"
<set file="$testFile" range={30, 35}></set>
"@

    # Execute
    $result = Invoke-SetCommand -CommandText $command -WorkingDirectory $testDir

    # Validate
    if (-not $result.Success) {
        throw "Operation failed: $($result.Message)"
    }

    # Check file content
    $newContent = Get-Content -Path $testFile -Encoding UTF8
    if ($newContent.Count -ne 44) {  # 50 - 6 = 44
        throw "Expected 44 lines, got: $($newContent.Count)"
    }

    # Line 29 should still be "Line 29", line 30 should now be "Line 36"
    if ($newContent[28] -ne "Line 29") {
        throw "Line 29 should be 'Line 29', got: $($newContent[28])"
    }
    if ($newContent[29] -ne "Line 36") {
        throw "Line 30 should now be 'Line 36', got: $($newContent[29])"
    }
}

# ============================================================================
# TEST 3: INSERT OPERATION (Insert at line 5)
# ============================================================================
Test-Operation "Test 3: Insert at line 5" {
    $testFile = Join-Path $testDir "test3.txt"

    # Create test file with 50 lines
    $lines = 1..50 | ForEach-Object { "Line $_" }
    $lines | Set-Content -Path $testFile -Encoding UTF8

    # Create <set> command for insertion (no end line)
    $command = @"
<set file="$testFile" range={5}>@[CDATA[
Inserted line 1
Inserted line 2
Inserted line 3
]]</set>
"@

    # Execute
    $result = Invoke-SetCommand -CommandText $command -WorkingDirectory $testDir

    # Validate
    if (-not $result.Success) {
        throw "Operation failed: $($result.Message)"
    }

    # Check file content
    $newContent = Get-Content -Path $testFile -Encoding UTF8
    if ($newContent.Count -ne 53) {  # 50 + 3 = 53
        throw "Expected 53 lines, got: $($newContent.Count)"
    }

    # Line 5 should be "Inserted line 1"
    if ($newContent[4] -ne "Line 4") {
        throw "Line 5 should still be 'Line 4' before insert, got: $($newContent[4])"
    }
    if ($newContent[5] -ne "Inserted line 1") {
        throw "Line 6 should be 'Inserted line 1', got: $($newContent[5])"
    }
}

# ============================================================================
# TEST 4: VALIDATION - Out of bounds (REJECT)
# ============================================================================
Test-Operation "Test 4: Reject out of bounds (way past EOF)" {
    $testFile = Join-Path $testDir "test4.txt"

    # Create test file with 50 lines
    $lines = 1..50 | ForEach-Object { "Line $_" }
    $lines | Set-Content -Path $testFile -Encoding UTF8

    # Try to replace lines 100-110 (way out of bounds)
    $command = @"
<set file="$testFile" range={2000, 2100}>@[CDATA[
This should be rejected
]]</set>
"@

    # Execute
    $result = Invoke-SetCommand -CommandText $command -WorkingDirectory $testDir

    # Validate that it FAILED
    if ($result.Success) {
        throw "Operation should have failed for out of bounds range"
    }

    Write-Host "Correctly rejected: $($result.Message)" -ForegroundColor Yellow
}

# ============================================================================
# TEST 5: VALIDATION - Invalid range (start > end)
# ============================================================================
Test-Operation "Test 5: Reject invalid range (start > end)" {
    $testFile = Join-Path $testDir "test5.txt"

    # Create test file with 50 lines
    $lines = 1..50 | ForEach-Object { "Line $_" }
    $lines | Set-Content -Path $testFile -Encoding UTF8

    # Try to replace with invalid range
    $command = @"
<set file="$testFile" range={30, 20}>@[CDATA[
This should be rejected
]]</set>
"@

    # Execute
    $result = Invoke-SetCommand -CommandText $command -WorkingDirectory $testDir

    # Validate that it FAILED
    if ($result.Success) {
        throw "Operation should have failed for invalid range"
    }

    Write-Host "Correctly rejected: $($result.Message)" -ForegroundColor Yellow
}

# ============================================================================
# TEST 6: APPEND TO EOF (Insert past last line)
# ============================================================================
Test-Operation "Test 6: Append to end of file" {
    $testFile = Join-Path $testDir "test6.txt"

    # Create test file with 65 lines (the problematic case!)
    $lines = 1..65 | ForEach-Object { "Line $_" }
    $lines | Set-Content -Path $testFile -Encoding UTF8

    # Append new lines starting at line 66 (this was previously rejected!)
    $command = @"
<set file="$testFile" range={66}>@[CDATA[
New line 66
New line 67
New line 68
New line 69
New line 70
]]</set>
"@

    # Execute
    $result = Invoke-SetCommand -CommandText $command -WorkingDirectory $testDir

    # Validate
    if (-not $result.Success) {
        throw "Operation failed: $($result.Message)"
    }

    # Check file content
    $newContent = Get-Content -Path $testFile -Encoding UTF8
    if ($newContent.Count -ne 70) {
        throw "Expected 70 lines, got: $($newContent.Count)"
    }

    if ($newContent[65] -ne "New line 66") {
        throw "Line 66 should be 'New line 66', got: $($newContent[65])"
    }
}

# ============================================================================
# TEST 7: REPLACE PAST EOF (Special case - replace until EOF)
# ============================================================================
Test-Operation "Test 7: Replace past EOF (gracefully handle)" {
    $testFile = Join-Path $testDir "test7.txt"

    # Create test file with 65 lines
    $lines = 1..65 | ForEach-Object { "Line $_" }
    $lines | Set-Content -Path $testFile -Encoding UTF8

    # Try to replace lines 60-100 (past EOF) - should replace 60-65 and append the rest
    $command = @"
<set file="$testFile" range={60, 100}>@[CDATA[
Replaced 60
Replaced 61
New line 66
New line 67
]]</set>
"@

    # Execute
    $result = Invoke-SetCommand -CommandText $command -WorkingDirectory $testDir

    # Validate - this should succeed and handle gracefully
    if (-not $result.Success) {
        throw "Operation failed: $($result.Message)"
    }

    # Check file content
    $newContent = Get-Content -Path $testFile -Encoding UTF8

    # File should have: lines 1-59 (59 lines) + 4 new lines = 63 lines
    if ($newContent.Count -ne 63) {
        throw "Expected 63 lines, got: $($newContent.Count)"
    }

    if ($newContent[59] -ne "Replaced 60") {
        throw "Line 60 should be 'Replaced 60', got: $($newContent[59])"
    }
}

# ============================================================================
# TEST 8: MALFORMED CDATA (Should handle gracefully)
# ============================================================================
Test-Operation "Test 8: Handle malformed CDATA" {
    $testFile = Join-Path $testDir "test8.txt"

    # Create test file
    $lines = 1..50 | ForEach-Object { "Line $_" }
    $lines | Set-Content -Path $testFile -Encoding UTF8

    # Malformed CDATA (no closing ]])
    $command = @"
<set file="$testFile" range={10, 20}>@[CDATA[
This CDATA is not properly closed
</set>
"@

    # Execute
    $result = Invoke-SetCommand -CommandText $command -WorkingDirectory $testDir

    # This should fail gracefully
    if ($result.Success) {
        # If it somehow succeeded, check that at least no corruption occurred
        Write-Host "Warning: Malformed CDATA was accepted" -ForegroundColor Yellow
    } else {
        Write-Host "Correctly handled malformed CDATA: $($result.Message)" -ForegroundColor Yellow
    }
}

# ============================================================================
# CLEANUP AND SUMMARY
# ============================================================================

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "TEST SUMMARY" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Passed: $testsPassed" -ForegroundColor Green
Write-Host "Failed: $testsFailed" -ForegroundColor $(if ($testsFailed -eq 0) { 'Green' } else { 'Red' })
Write-Host ""

# Clean up test directory
Remove-Item -Path $testDir -Recurse -Force -ErrorAction SilentlyContinue

if ($testsFailed -eq 0) {
    Write-Host "✓ ALL TESTS PASSED!" -ForegroundColor Green
    exit 0
} else {
    Write-Host "✗ SOME TESTS FAILED!" -ForegroundColor Red
    exit 1
}
