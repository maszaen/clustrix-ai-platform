# PowerShell Helper Functions for Clustrix Codes Agent
# These functions provide reliable file reading and editing capabilities

function Show-FileWithLineNumbers {
    <#
    .SYNOPSIS
    Display file content with line numbers
    
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
    Replace specific line(s) in a file
    
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
        Write-Output "Backup created: $backupPath"
    }
    
    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count
    
    if ($LineNumber -lt 1 -or $LineNumber -gt $totalLines) {
        Write-Error "Line number $LineNumber is out of range (1-$totalLines)"
        return
    }
    
    # Convert to 0-indexed
    $idx = $LineNumber - 1
    $lines[$idx] = $NewContent
    
    # Write back to file
    $lines | Set-Content -Path $Path -Encoding UTF8
    Write-Output "Line $LineNumber replaced successfully"
}

function Remove-FileLine {
    <#
    .SYNOPSIS
    Remove specific line(s) from a file
    
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
        Write-Output "Backup created: $backupPath"
    }
    
    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count
    
    if ($LineNumber -lt 1 -or $LineNumber -gt $totalLines) {
        Write-Error "Line number $LineNumber is out of range (1-$totalLines)"
        return
    }
    
    # Convert to 0-indexed
    $idx = $LineNumber - 1
    
    # Remove line by creating new array without that line
    $newLines = @()
    for ($i = 0; $i -lt $lines.Count; $i++) {
        if ($i -ne $idx) {
            $newLines += $lines[$i]
        }
    }
    
    # Write back to file
    $newLines | Set-Content -Path $Path -Encoding UTF8
    Write-Output "Line $LineNumber removed successfully"
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
        Write-Output "Backup created: $backupPath"
    }
    
    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count
    
    if ($LineNumber -lt 1 -or $LineNumber -gt ($totalLines + 1)) {
        Write-Error "Line number $LineNumber is out of range (1-$($totalLines + 1))"
        return
    }
    
    # Convert to 0-indexed
    $idx = $LineNumber - 1
    
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
    Write-Output "Line inserted at position $LineNumber successfully"
}

function Set-MultipleLines {
    <#
    .SYNOPSIS
    Replace multiple lines in a file (batch edit)

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
        Write-Output "Backup created: $backupPath"
    }

    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count
    $changedCount = 0

    # Apply all replacements
    foreach ($lineNum in $Replacements.Keys) {
        if ($lineNum -lt 1 -or $lineNum -gt $totalLines) {
            Write-Warning "Line number $lineNum is out of range (1-$totalLines), skipping"
            continue
        }

        $idx = $lineNum - 1
        $lines[$idx] = $Replacements[$lineNum]
        $changedCount++
    }

    # Write back to file
    $lines | Set-Content -Path $Path -Encoding UTF8
    Write-Output "Successfully replaced $changedCount lines"
}

function Search-FileWithContext {
    <#
    .SYNOPSIS
    Search for pattern in file and return results with line numbers and context

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
    $matches = @()

    for ($i = 0; $i -lt $totalLines; $i++) {
        if ($lines[$i] -match $Pattern) {
            $lineNum = $i + 1
            $startIdx = [Math]::Max(0, $i - $ContextBefore)
            $endIdx = [Math]::Min($totalLines - 1, $i + $ContextAfter)

            Write-Output "--- Match at line $lineNum ---"
            for ($j = $startIdx; $j -le $endIdx; $j++) {
                $num = $j + 1
                $prefix = if ($j -eq $i) { ">>>" } else { "   " }
                Write-Output ("{0} {1:D3}: {2}" -f $prefix, $num, $lines[$j])
            }
            Write-Output ""
        }
    }
}

function Get-FileLineRange {
    <#
    .SYNOPSIS
    Smart file reading with multiple range support

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
    Find duplicate lines in a file

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
                Content = $line
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
Export-ModuleMember -Function Show-FileWithLineNumbers, Set-FileLine, Remove-FileLine, Add-FileLine, Set-MultipleLines, Search-FileWithContext, Get-FileLineRange, Find-DuplicateLines
