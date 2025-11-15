# ============================================================================
# CODES AGENT V3: SIMPLIFIED <set> TAG SYSTEM
# ============================================================================
#
# DESIGN PHILOSOPHY:
# - Simple syntax: AI only needs to use <set range={start, end}>@[CDATA[...]]</set>
# - Defensive validation: Check bounds BEFORE applying changes
# - Git-style diff: Show what changed with context
# - Memory updates: Track file state after every operation
#
# OPERATIONS:
# 1. REPLACE: <set range={20, 60}>@[CDATA[new lines]]</set>
# 2. DELETE:  <set range={20, 60}></set>
# 3. INSERT:  <set range={20}>@[CDATA[new lines]]</set>
# ============================================================================

function Invoke-SetCommand {
    <#
    .SYNOPSIS
    Parse and execute <set> tag commands from AI responses

    .PARAMETER CommandText
    The full command text from AI (may contain multiple <set> tags)

    .PARAMETER WorkingDirectory
    The working directory for resolving relative paths

    .EXAMPLE
    Invoke-SetCommand -CommandText '<set file="app.js" range={10, 20}>@[CDATA[new code]]</set>'
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$CommandText,

        [Parameter(Mandatory=$false)]
        [string]$WorkingDirectory = (Get-Location).Path
    )

    try {
        # Parse all <set> tags from command text
        $setTags = Parse-SetTags -CommandText $CommandText

        if ($setTags.Count -eq 0) {
            Write-Error "No <set> tags found in command text"
            return @{
                Success = $false
                Message = "No <set> tags found in command text"
                Operations = @()
            }
        }

        $results = @()
        $allSuccess = $true

        foreach ($setTag in $setTags) {
            Write-Output ""
            Write-Output "=========================================="
            Write-Output "PROCESSING SET OPERATION"
            Write-Output "=========================================="
            Write-Output "File: $($setTag.File)"
            Write-Output "Range: $($setTag.Range)"
            Write-Output "Operation: $($setTag.Operation)"
            Write-Output ""

            # Execute the set operation
            $result = Execute-SetOperation -SetTag $setTag -WorkingDirectory $WorkingDirectory
            $results += $result

            if (-not $result.Success) {
                $allSuccess = $false
                Write-Error $result.Message
            } else {
                # Show diff output
                Write-Output ""
                Write-Output "=========================================="
                Write-Output "GIT-STYLE DIFF"
                Write-Output "=========================================="
                Write-Output $result.Diff
                Write-Output ""

                # Show updated memory state (context around change)
                Write-Output "=========================================="
                Write-Output "UPDATED MEMORY STATE"
                Write-Output "=========================================="
                Write-Output $result.MemoryState
                Write-Output ""
            }
        }

        return @{
            Success = $allSuccess
            Operations = $results
            Message = if ($allSuccess) { "All operations completed successfully" } else { "Some operations failed" }
        }

    } catch {
        Write-Error "Failed to process set command: $_"
        return @{
            Success = $false
            Message = "Failed to process set command: $_"
            Operations = @()
        }
    }
}

function Parse-SetTags {
    <#
    .SYNOPSIS
    Parse <set> tags from command text

    .DESCRIPTION
    Extracts all <set> tags with their attributes and CDATA content

    Format: <set file="path" range={start, end}>@[CDATA[content]]</set>
    or:     <set file="path" range={start}>@[CDATA[content]]</set>
    or:     <set file="path" range={start, end}></set>
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$CommandText
    )

    $setTags = @()

    # Regex to match <set> tags with flexible formatting
    # Matches: <set file="..." range={...}>CONTENT</set>
    $pattern = '<set\s+file=["\']([^"'']+)["\']\s+range=\{([^}]+)\}>(.*?)</set>'
    $matches = [regex]::Matches($CommandText, $pattern, [System.Text.RegularExpressions.RegexOptions]::Singleline)

    foreach ($match in $matches) {
        $filePath = $match.Groups[1].Value.Trim()
        $rangeStr = $match.Groups[2].Value.Trim()
        $content = $match.Groups[3].Value

        # Parse range: "20, 60" or "20"
        $rangeParts = $rangeStr -split '\s*,\s*'
        $startLine = [int]$rangeParts[0]
        $endLine = if ($rangeParts.Count -gt 1) { [int]$rangeParts[1] } else { $null }

        # Extract CDATA content if present
        $cdataContent = $null
        if ($content -match '@\[CDATA\[([\s\S]*?)\]\]') {
            $cdataContent = $Matches[1]
        } elseif ($content.Trim() -ne '') {
            # If no CDATA but content exists, use content as-is
            $cdataContent = $content
        }

        # Determine operation type
        $operation = if ($cdataContent -eq $null -or $cdataContent.Trim() -eq '') {
            'DELETE'
        } elseif ($endLine -eq $null) {
            'INSERT'
        } else {
            'REPLACE'
        }

        $setTags += [PSCustomObject]@{
            File = $filePath
            StartLine = $startLine
            EndLine = $endLine
            Content = $cdataContent
            Operation = $operation
            Range = if ($endLine) { "$startLine-$endLine" } else { "$startLine" }
        }
    }

    return $setTags
}

function Execute-SetOperation {
    <#
    .SYNOPSIS
    Execute a single <set> operation (replace, delete, or insert)
    #>
    param(
        [Parameter(Mandatory=$true)]
        [PSCustomObject]$SetTag,

        [Parameter(Mandatory=$false)]
        [string]$WorkingDirectory = (Get-Location).Path
    )

    # Resolve file path
    $filePath = $SetTag.File
    if (-not [System.IO.Path]::IsPathRooted($filePath)) {
        $filePath = Join-Path $WorkingDirectory $filePath
    }

    # Validate file exists (for REPLACE and DELETE, not for INSERT to new file)
    if ($SetTag.Operation -ne 'INSERT' -and -not (Test-Path $filePath)) {
        return @{
            Success = $false
            Message = "File not found: $filePath"
            Operation = $SetTag.Operation
            FilePath = $filePath
        }
    }

    # Read current file content
    $originalLines = if (Test-Path $filePath) {
        @(Get-Content -Path $filePath -Encoding UTF8 -ErrorAction SilentlyContinue)
    } else {
        @()
    }

    $totalLines = $originalLines.Count
    $startLine = $SetTag.StartLine
    $endLine = $SetTag.EndLine

    # === DEFENSIVE VALIDATION ===
    $validation = Validate-SetOperation -SetTag $SetTag -TotalLines $totalLines
    if (-not $validation.Valid) {
        return @{
            Success = $false
            Message = $validation.Message
            Operation = $SetTag.Operation
            FilePath = $filePath
        }
    }

    # Backup file before modification
    $backupPath = "$filePath.backup"
    if (Test-Path $filePath) {
        Copy-Item -Path $filePath -Destination $backupPath -Force -ErrorAction SilentlyContinue
    }

    # Parse new content lines
    $newContentLines = if ($SetTag.Content) {
        $SetTag.Content -split '\r?\n'
    } else {
        @()
    }

    # Build new file content based on operation
    $newLines = @()

    switch ($SetTag.Operation) {
        'REPLACE' {
            # Lines before replacement
            if ($startLine -gt 1) {
                $newLines += $originalLines[0..($startLine - 2)]
            }

            # New content
            $newLines += $newContentLines

            # Lines after replacement
            if ($endLine -lt $totalLines) {
                $newLines += $originalLines[$endLine..($totalLines - 1)]
            }
        }

        'DELETE' {
            # Lines before deletion
            if ($startLine -gt 1) {
                $newLines += $originalLines[0..($startLine - 2)]
            }

            # Lines after deletion
            if ($endLine -lt $totalLines) {
                $newLines += $originalLines[$endLine..($totalLines - 1)]
            }
        }

        'INSERT' {
            # Lines before insertion point
            if ($startLine -gt 1 -and $totalLines -gt 0) {
                $newLines += $originalLines[0..([Math]::Min($startLine - 1, $totalLines - 1))]
            }

            # New content
            $newLines += $newContentLines

            # Lines after insertion point (if any)
            if ($startLine -le $totalLines) {
                $newLines += $originalLines[($startLine - 1)..($totalLines - 1)]
            }
        }
    }

    # Write new content to file
    try {
        $newLines | Set-Content -Path $filePath -Encoding UTF8 -ErrorAction Stop

        # Generate diff
        $diff = Generate-GitDiff -FilePath $filePath -OriginalLines $originalLines -NewLines $newLines -Operation $SetTag.Operation -StartLine $startLine -EndLine $endLine

        # Generate memory state (context around change)
        $memoryState = Generate-MemoryState -FilePath $filePath -NewLines $newLines -StartLine $startLine -EndLine $endLine -Operation $SetTag.Operation

        return @{
            Success = $true
            Message = "$($SetTag.Operation) operation completed successfully"
            Operation = $SetTag.Operation
            FilePath = $filePath
            OriginalLineCount = $totalLines
            NewLineCount = $newLines.Count
            Diff = $diff
            MemoryState = $memoryState
        }

    } catch {
        return @{
            Success = $false
            Message = "Failed to write file: $_"
            Operation = $SetTag.Operation
            FilePath = $filePath
        }
    }
}

function Validate-SetOperation {
    <#
    .SYNOPSIS
    Validate <set> operation before applying

    .DESCRIPTION
    Performs defensive validation:
    - Start/end within reasonable bounds
    - Start <= End for replace/delete
    - Content is valid
    #>
    param(
        [Parameter(Mandatory=$true)]
        [PSCustomObject]$SetTag,

        [Parameter(Mandatory=$true)]
        [int]$TotalLines
    )

    $startLine = $SetTag.StartLine
    $endLine = $SetTag.EndLine

    # Validate start line
    if ($startLine -lt 1) {
        return @{
            Valid = $false
            Message = "Start line must be >= 1 (got: $startLine)"
        }
    }

    # For REPLACE and DELETE, validate range
    if ($SetTag.Operation -in @('REPLACE', 'DELETE')) {
        # Allow end line to be past EOF for REPLACE (will just replace until EOF)
        # But reject completely unreasonable values
        if ($startLine -gt $TotalLines + 1000) {
            return @{
                Valid = $false
                Message = "Start line $startLine is too far beyond file end ($TotalLines lines). If adding new content, use INSERT operation with range={$($TotalLines + 1)}"
            }
        }

        # Validate end line
        if ($endLine -lt $startLine) {
            return @{
                Valid = $false
                Message = "End line ($endLine) must be >= start line ($startLine)"
            }
        }
    }

    # For INSERT, allow inserting past EOF (appending)
    # No strict validation needed - we'll handle it gracefully

    return @{
        Valid = $true
        Message = "Validation passed"
    }
}

function Generate-GitDiff {
    <#
    .SYNOPSIS
    Generate git-style diff output showing what changed
    #>
    param(
        [string]$FilePath,
        [array]$OriginalLines,
        [array]$NewLines,
        [string]$Operation,
        [int]$StartLine,
        [int]$EndLine
    )

    $fileName = Split-Path -Leaf $FilePath
    $originalCount = $OriginalLines.Count
    $newCount = $NewLines.Count

    $diff = @()
    $diff += "File: $fileName ($originalCount lines → $newCount lines)"
    $diff += ""

    # Show context around the change (5 lines before/after)
    $contextBefore = 5
    $contextAfter = 5

    # Calculate range to show
    $showStart = [Math]::Max(1, $StartLine - $contextBefore)
    $showEnd = [Math]::Min($originalCount, ($EndLine -or $StartLine) + $contextAfter)

    $diff += "@@ -$StartLine,$(if ($EndLine) { $EndLine - $StartLine + 1 } else { 1 }) +$StartLine,$(($NewLines.Count - $OriginalLines.Count) + $(if ($EndLine) { $EndLine - $StartLine + 1 } else { 1 })) @@"

    # Show lines before change
    for ($i = $showStart - 1; $i -lt $StartLine - 1; $i++) {
        if ($i -ge 0 -and $i -lt $OriginalLines.Count) {
            $diff += " $($i + 1): $($OriginalLines[$i])"
        }
    }

    # Show removed lines (for REPLACE and DELETE)
    if ($Operation -in @('REPLACE', 'DELETE')) {
        for ($i = $StartLine - 1; $i -lt $EndLine; $i++) {
            if ($i -ge 0 -and $i -lt $OriginalLines.Count) {
                $diff += "-$($i + 1): $($OriginalLines[$i])"
            }
        }
    }

    # Show added lines (for REPLACE and INSERT)
    if ($Operation -in @('REPLACE', 'INSERT')) {
        $newContentLines = if ($Operation -eq 'INSERT') {
            # For INSERT, new lines are at the insertion point
            $insertEndIdx = $StartLine + ($NewLines.Count - $OriginalLines.Count) - 1
            $NewLines[($StartLine - 1)..$insertEndIdx]
        } else {
            # For REPLACE, new lines replace the range
            $replaceCount = $EndLine - $StartLine + 1
            $NewLines[($StartLine - 1)..($StartLine - 1 + $replaceCount - 1)]
        }

        $lineNum = $StartLine
        foreach ($line in $newContentLines) {
            $diff += "+$($lineNum): $line"
            $lineNum++
        }
    }

    # Show lines after change (from new file)
    $afterStart = if ($Operation -eq 'DELETE') {
        $StartLine
    } else {
        $StartLine + ($NewLines.Count - $OriginalLines.Count)
    }

    for ($i = $afterStart; $i -lt $afterStart + $contextAfter; $i++) {
        if ($i -ge 0 -and $i -lt $NewLines.Count) {
            $diff += " $($i + 1): $($NewLines[$i])"
        }
    }

    return $diff -join "`n"
}

function Generate-MemoryState {
    <#
    .SYNOPSIS
    Generate memory state output showing file context around change
    #>
    param(
        [string]$FilePath,
        [array]$NewLines,
        [int]$StartLine,
        [int]$EndLine,
        [string]$Operation
    )

    $fileName = Split-Path -Leaf $FilePath
    $contextLines = 5

    $memoryState = @()
    $memoryState += "[$($StartLine - $contextLines)-$($StartLine + $contextLines)] $fileName"

    # Calculate range to show
    $showStart = [Math]::Max(0, $StartLine - $contextLines - 1)
    $showEnd = [Math]::Min($NewLines.Count - 1, $StartLine + $contextLines)

    # Show context
    for ($i = $showStart; $i -le $showEnd; $i++) {
        if ($i -ge 0 -and $i -lt $NewLines.Count) {
            $memoryState += "$($i + 1): $($NewLines[$i])"
        }
    }

    return $memoryState -join "`n"
}

# Export functions
Export-ModuleMember -Function Invoke-SetCommand, Parse-SetTags, Execute-SetOperation
