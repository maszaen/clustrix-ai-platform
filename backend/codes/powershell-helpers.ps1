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

function Replace-FileLine {
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
    Replace-FileLine -Path "index.html" -LineNumber 25 -NewContent "    <h1>New Title</h1>"
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

function Insert-FileLine {
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
    Insert-FileLine -Path "index.html" -LineNumber 25 -NewContent "    <div class='new-section'>"
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

# Export functions
Export-ModuleMember -Function Show-FileWithLineNumbers, Replace-FileLine, Remove-FileLine, Insert-FileLine
