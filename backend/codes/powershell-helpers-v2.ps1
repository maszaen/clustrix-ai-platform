# PowerShell Helper Functions V2 for Clustrix Codes Agent
# Optimized for token efficiency and safety

function Show-FileWithLineNumbers {
    <#
    .SYNOPSIS
    Display file content with line numbers (SAFE - token efficient)

    .PARAMETER Path
    Path to the file

    .PARAMETER StartLine
    Starting line number (1-indexed)

    .PARAMETER EndLine
    Ending line number (1-indexed)

    .EXAMPLE
    Show-FileWithLineNumbers -Path "index.html"
    Show-FileWithLineNumbers -Path "index.html" -StartLine 50 -EndLine 100
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$false)]
        [int]$StartLine = 1,

        [Parameter(Mandatory=$false)]
        [int]$EndLine = -1
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count

    # Output total count first (helpful for AI)
    Write-Output "File: $Path (Total lines: $totalLines)"
    Write-Output ""

    if ($EndLine -eq -1 -or $EndLine -gt $totalLines) {
        $EndLine = $totalLines
    }

    # Convert to 0-indexed
    $startIdx = $StartLine - 1
    $endIdx = $EndLine - 1

    if ($startIdx -lt 0) { $startIdx = 0 }
    if ($endIdx -ge $totalLines) { $endIdx = $totalLines - 1 }

    for ($i = $startIdx; $i -le $endIdx; $i++) {
        $lineNum = $i + 1
        Write-Output ("{0:D3}: {1}" -f $lineNum, $lines[$i])
    }
}

function Set-FileLine {
    <#
    .SYNOPSIS
    Replace specific line in a file (SAFE - creates backup)

    .PARAMETER Path
    Path to the file

    .PARAMETER LineNumber
    Line number to replace (1-indexed)

    .PARAMETER NewContent
    New content for the line

    .PARAMETER Backup
    Create backup before modifying (default: $true)

    .EXAMPLE
    Set-FileLine -Path "index.html" -LineNumber 25 -NewContent "    <h1>New Title</h1>"
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$true)]
        [int]$LineNumber,

        [Parameter(Mandatory=$true)]
        [string]$NewContent,

        [Parameter(Mandatory=$false)]
        [bool]$Backup = $true
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    # Create backup
    if ($Backup) {
        $backupPath = "$Path.backup"
        Copy-Item -Path $Path -Destination $backupPath -Force
        Write-Output "[BACKUP] Created: $backupPath"
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count

    if ($LineNumber -lt 1 -or $LineNumber -gt $totalLines) {
        Write-Error "Line number $LineNumber is out of range (1-$totalLines)"
        return
    }

    # Show before/after for verification
    $idx = $LineNumber - 1
    Write-Output "[BEFORE Line $LineNumber] $($lines[$idx])"
    $lines[$idx] = $NewContent
    Write-Output "[AFTER Line $LineNumber] $NewContent"

    # Write back to file
    $lines | Set-Content -Path $Path -Encoding UTF8
    Write-Output "[SUCCESS] Line $LineNumber replaced"
}

function Set-MultipleLines {
    <#
    .SYNOPSIS
    Replace multiple lines in a file (batch edit - SAFE)

    .PARAMETER Path
    Path to the file

    .PARAMETER Replacements
    Hashtable of line numbers and their new content
    Example: @{25='new line 25'; 30='new line 30'; 45='new line 45'}

    .PARAMETER Backup
    Create backup before modifying (default: $true)

    .EXAMPLE
    Set-MultipleLines -Path "index.html" -Replacements @{25='<h1>New</h1>'; 30='<p>Text</p>'}
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$true)]
        [hashtable]$Replacements,

        [Parameter(Mandatory=$false)]
        [bool]$Backup = $true
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    # Create backup
    if ($Backup) {
        $backupPath = "$Path.backup"
        Copy-Item -Path $Path -Destination $backupPath -Force
        Write-Output "[BACKUP] Created: $backupPath"
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count
    $changedCount = 0

    # Apply all replacements with verification
    foreach ($lineNum in $Replacements.Keys) {
        if ($lineNum -lt 1 -or $lineNum -gt $totalLines) {
            Write-Warning "Line $lineNum out of range (1-$totalLines), skipping"
            continue
        }

        $idx = $lineNum - 1
        Write-Output "[BEFORE Line $lineNum] $($lines[$idx])"
        $lines[$idx] = $Replacements[$lineNum]
        Write-Output "[AFTER Line $lineNum] $($Replacements[$lineNum])"
        $changedCount++
    }

    # Write back to file
    $lines | Set-Content -Path $Path -Encoding UTF8
    Write-Output "[SUCCESS] Replaced $changedCount lines"
}

function Remove-FileLine {
    <#
    .SYNOPSIS
    Remove specific line from a file

    .PARAMETER Path
    Path to the file

    .PARAMETER LineNumber
    Line number to remove (1-indexed)

    .PARAMETER Backup
    Create backup before modifying (default: $true)

    .EXAMPLE
    Remove-FileLine -Path "index.html" -LineNumber 25
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$true)]
        [int]$LineNumber,

        [Parameter(Mandatory=$false)]
        [bool]$Backup = $true
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    # Create backup
    if ($Backup) {
        $backupPath = "$Path.backup"
        Copy-Item -Path $Path -Destination $backupPath -Force
        Write-Output "[BACKUP] Created: $backupPath"
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count

    if ($LineNumber -lt 1 -or $LineNumber -gt $totalLines) {
        Write-Error "Line number $LineNumber is out of range (1-$totalLines)"
        return
    }

    $idx = $LineNumber - 1
    Write-Output "[REMOVING Line $LineNumber] $($lines[$idx])"

    # Remove line
    $newLines = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($i -ne $idx) {
            $newLines += $lines[$i]
        }
    }

    # Write back to file
    $newLines | Set-Content -Path $Path -Encoding UTF8
    Write-Output "[SUCCESS] Line $LineNumber removed"
}

function Add-FileLine {
    <#
    .SYNOPSIS
    Insert a new line at specific position

    .PARAMETER Path
    Path to the file

    .PARAMETER LineNumber
    Line number where to insert (1-indexed, new line will be inserted BEFORE this line)

    .PARAMETER NewContent
    Content of the new line

    .PARAMETER Backup
    Create backup before modifying (default: $true)

    .EXAMPLE
    Add-FileLine -Path "index.html" -LineNumber 25 -NewContent "    <div class='new-section'>"
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$true)]
        [int]$LineNumber,

        [Parameter(Mandatory=$true)]
        [string]$NewContent,

        [Parameter(Mandatory=$false)]
        [bool]$Backup = $true
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    # Create backup
    if ($Backup) {
        $backupPath = "$Path.backup"
        Copy-Item -Path $Path -Destination $backupPath -Force
        Write-Output "[BACKUP] Created: $backupPath"
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count

    if ($LineNumber -lt 1 -or $LineNumber -gt ($totalLines + 1)) {
        Write-Error "Line number $LineNumber is out of range (1-$($totalLines + 1))"
        return
    }

    $idx = $LineNumber - 1
    Write-Output "[INSERTING before Line $LineNumber] $NewContent"

    # Insert line
    $newLines = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($i -eq $idx) {
            $newLines += $NewContent
        }
        $newLines += $lines[$i]
    }

    # Handle case where inserting at end
    if ($LineNumber -eq ($totalLines + 1)) {
        $newLines += $NewContent
    }

    # Write back to file
    $newLines | Set-Content -Path $Path -Encoding UTF8
    Write-Output "[SUCCESS] Line inserted at position $LineNumber"
}

function Search-FileWithContext {
    <#
    .SYNOPSIS
    Search for pattern with context (SAFE - shows matches with line numbers)

    .PARAMETER Path
    Path to the file

    .PARAMETER Pattern
    Pattern to search (regex supported)

    .PARAMETER ContextBefore
    Lines before match (default: 2)

    .PARAMETER ContextAfter
    Lines after match (default: 2)

    .EXAMPLE
    Search-FileWithContext -Path "index.html" -Pattern "class=" -ContextBefore 1 -ContextAfter 3
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$true)]
        [string]$Pattern,

        [Parameter(Mandatory=$false)]
        [int]$ContextBefore = 2,

        [Parameter(Mandatory=$false)]
        [int]$ContextAfter = 2
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count
    $matchCount = 0

    for ($i = 0; $i -lt $totalLines; $i++) {
        if ($lines[$i] -match $Pattern) {
            $matchCount++
            $lineNum = $i + 1
            $startIdx = [Math]::Max(0, $i - $ContextBefore)
            $endIdx = [Math]::Min($totalLines - 1, $i + $ContextAfter)

            Write-Output "--- Match #$matchCount at line $lineNum ---"
            for ($j = $startIdx; $j -le $endIdx; $j++) {
                $num = $j + 1
                $prefix = if ($j -eq $i) { ">>>" } else { "   " }
                Write-Output ("{0} {1:D3}: {2}" -f $prefix, $num, $lines[$j])
            }
            Write-Output ""
        }
    }

    if ($matchCount -eq 0) {
        Write-Output "No matches found for pattern: $Pattern"
    } else {
        Write-Output "Total matches: $matchCount"
    }
}

function Get-FileLineRange {
    <#
    .SYNOPSIS
    Smart file reading with multiple range support (TOKEN EFFICIENT)

    .PARAMETER Path
    Path to the file

    .PARAMETER Ranges
    Array of ranges to read, e.g., @('1-50', '100-150', '200-250')

    .EXAMPLE
    Get-FileLineRange -Path "large-file.html" -Ranges @('1-100', '200-300', '500-600')
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$true)]
        [string[]]$Ranges
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count

    Write-Output "File: $Path (Total lines: $totalLines)"
    Write-Output ""

    foreach ($range in $Ranges) {
        if ($range -match '^(\d+)-(\d+)$') {
            $start = [int]$Matches[1]
            $end = [int]$Matches[2]

            if ($start -lt 1) { $start = 1 }
            if ($end -gt $totalLines) { $end = $totalLines }
            if ($start -gt $end) {
                Write-Warning "Invalid range: $range"
                continue
            }

            Write-Output "=== Lines $start-$end ==="
            for ($i = $start - 1; $i -lt $end; $i++) {
                $lineNum = $i + 1
                Write-Output ("{0:D3}: {1}" -f $lineNum, $lines[$i])
            }
            Write-Output ""
        } else {
            Write-Warning "Invalid range format: $range (use 'start-end', e.g., '1-50')"
        }
    }
}

function Find-DuplicateLines {
    <#
    .SYNOPSIS
    Find duplicate lines in a file (HELPFUL for bug detection)

    .PARAMETER Path
    Path to the file

    .PARAMETER CaseSensitive
    Case sensitive comparison (default: $false)

    .EXAMPLE
    Find-DuplicateLines -Path "index.html"
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$false)]
        [bool]$CaseSensitive = $false
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    $seen = @{}
    $duplicates = @()

    for ($i = 0; $i -lt $lines.Count; $i++) {
        $line = $lines[$i]
        $key = if ($CaseSensitive) { $line } else { $line.ToLower() }

        if ($seen.ContainsKey($key)) {
            $duplicates += [PSCustomObject]@{
                Line = $i + 1
                Content = $line.Substring(0, [Math]::Min(80, $line.Length))
                FirstSeenAt = $seen[$key]
            }
        } else {
            $seen[$key] = $i + 1
        }
    }

    if ($duplicates.Count -eq 0) {
        Write-Output "No duplicate lines found."
    } else {
        Write-Output "Found $($duplicates.Count) duplicate lines:"
        $duplicates | Format-Table -AutoSize
    }
}

# Export functions
Export-ModuleMember -Function Show-FileWithLineNumbers, Set-FileLine, Set-MultipleLines, Remove-FileLine, Add-FileLine, Search-FileWithContext, Get-FileLineRange, Find-DuplicateLines
