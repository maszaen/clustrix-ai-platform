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
    
    if ($EndLine -eq -1) {
        # Default to 100 lines max if no EndLine specified
        $EndLine = [Math]::Min($StartLine + 99, $totalLines)
    } elseif ($EndLine -gt $totalLines) {
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

    # Add total line count and indication if there are more lines
    Write-Output "[Total lines in file: $totalLines]"
    if ($EndLine -lt $totalLines) {
        $remaining = $totalLines - $EndLine
        Write-Output "[${remaining} lines more...]"
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

    # Separate valid and invalid line numbers
    $validEdits = @{}
    $invalidLines = @()

    foreach ($lineNum in $Replacements.Keys) {
        if ($lineNum -lt 1 -or $lineNum -gt $totalLines) {
            $invalidLines += $lineNum
        } else {
            $validEdits[$lineNum] = $Replacements[$lineNum]
        }
    }

    # Report invalid lines with actionable guidance (single summary, no spam)
    if ($invalidLines.Count -gt 0) {
        $sortedInvalid = $invalidLines | Sort-Object
        $minInvalid = $sortedInvalid[0]
        $maxInvalid = $sortedInvalid[-1]

        Write-Output ""
        Write-Output "========================================"
        Write-Output "WARNING: Some edits are out of range"
        Write-Output "========================================"
        Write-Output ""
        Write-Output "File has $totalLines lines (range: 1-$totalLines)"
        Write-Output "Skipped $($invalidLines.Count) invalid line numbers: $minInvalid-$maxInvalid"
        Write-Output ""
        Write-Output "SOLUTION:"
        Write-Output "  1. Read file first: Show-FileWithLineNumbers -Path `"$Path`""
        Write-Output "  2. Check actual line count"
        Write-Output "  3. Use Set-Content to rewrite entire file if adding new content"
        Write-Output ""
        Write-Output "Proceeding with $($validEdits.Count) valid edits only..."
        Write-Output "========================================"
        Write-Output ""
    }

    # Apply valid replacements only
    foreach ($lineNum in $validEdits.Keys) {
        $idx = $lineNum - 1
        $lines[$idx] = $validEdits[$lineNum]
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

function List-ProjectFiles {
    <#
    .SYNOPSIS
    Ultra-fast directory listing with extension filtering and depth control.

    .PARAMETER Path
    Root directory to scan (default: current working directory)

    .PARAMETER Extensions
    Comma separated list or array of extensions (".js,.ts") or wildcard patterns ("*.js").

    .PARAMETER Depth
    Maximum depth to recurse relative to the starting directory. Use -1 for unlimited.

    .PARAMETER Exclude
    Directory names to ignore during traversal.

    .PARAMETER Absolute
    Emit absolute paths instead of paths relative to the root.

    .PARAMETER Sort
    Sort the results alphabetically before emitting them.
    #>
    param(
        [Parameter(Mandatory=$false)]
        [string]$Path = (Get-Location),

        [Parameter(Mandatory=$false)]
        [object]$Extensions = '*.js,*.ts,*.tsx,*.jsx,*.cjs,*.mjs,*.css,*.scss',

        [Parameter(Mandatory=$false)]
        [int]$Depth = 2,

        [Parameter(Mandatory=$false)]
        [object]$Exclude = 'node_modules,.git,dist,build,out,coverage,.cache',

        [switch]$Absolute,

        [switch]$Sort
    )

    $resolvedPath = $null
    try {
        $resolvedPath = (Resolve-Path -Path $Path).ProviderPath
    }
    catch {
        Write-Error "List-ProjectFiles: Path not found: $Path"
        return
    }

    if (-not (Test-Path $resolvedPath -PathType Container)) {
        Write-Error "List-ProjectFiles: Path is not a directory: $resolvedPath"
        return
    }

    $normalizeList = {
        param([object]$value)

        $result = @()
        if ($null -eq $value) {
            return $result
        }

        $items = if ($value -is [System.Array]) { $value } else { @($value) }
        foreach ($item in $items) {
            if ($null -eq $item) { continue }

            $parts = "$item".Split(',', [System.StringSplitOptions]::RemoveEmptyEntries)
            foreach ($part in $parts) {
                $trimmed = $part.Trim()
                if ($trimmed.Length -gt 0) {
                    $result += $trimmed
                }
            }
        }

        return $result
    }

    $extensionValues = & $normalizeList $Extensions
    $extensionSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($ext in $extensionValues) {
        $normalized = $ext
        if ($normalized.StartsWith('*')) {
            $normalized = $normalized.Substring(1)
        }

        if ($normalized.Length -eq 0) {
            continue
        }

        if (-not $normalized.StartsWith('.')) {
            $normalized = ".$normalized"
        }

        if ($normalized.Length -eq 1) {
            continue
        }

        $extensionSet.Add($normalized.ToLowerInvariant()) | Out-Null
    }

    $hasExtensionFilter = $extensionSet.Count -gt 0

    $excludeValues = & $normalizeList $Exclude
    if ($excludeValues.Count -eq 0) {
        $excludeValues = @('node_modules', '.git', 'dist', 'build', 'out', 'coverage', '.cache')
    }

    $excludeSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    foreach ($item in $excludeValues) {
        if ([string]::IsNullOrWhiteSpace($item)) { continue }
        $excludeSet.Add($item.Trim()) | Out-Null
    }

    $maxDepth = if ($Depth -lt 0) { [int]::MaxValue } else { $Depth }

    $results = [System.Collections.Generic.List[string]]::new()
    $queue = [System.Collections.Generic.Queue[object]]::new()
    $queue.Enqueue([PSCustomObject]@{ Path = $resolvedPath; Depth = 0 })

    while ($queue.Count -gt 0) {
        $current = $queue.Dequeue()
        $currentPath = $current.Path
        $currentDepth = $current.Depth

        try {
            $entries = [System.IO.Directory]::EnumerateFileSystemEntries($currentPath)
        }
        catch {
            Write-Warning "List-ProjectFiles: Skipping $currentPath ($($_.Exception.Message))"
            continue
        }

        foreach ($entry in $entries) {
            $name = [System.IO.Path]::GetFileName($entry)

            if ([System.IO.Directory]::Exists($entry)) {
                if ($excludeSet.Contains($name)) {
                    continue
                }

                if ($currentDepth -lt $maxDepth) {
                    $queue.Enqueue([PSCustomObject]@{ Path = $entry; Depth = $currentDepth + 1 })
                }

                continue
            }

            if ($hasExtensionFilter) {
                $ext = [System.IO.Path]::GetExtension($entry)
                if (-not $extensionSet.Contains($ext.ToLowerInvariant())) {
                    continue
                }
            }

            $outputPath = $entry
            if (-not $Absolute.IsPresent) {
                try {
                    $outputPath = [System.IO.Path]::GetRelativePath($resolvedPath, $entry)
                }
                catch {
                    try {
                        $rootUri = New-Object System.Uri(($resolvedPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar))
                        $entryUri = New-Object System.Uri($entry)
                        $outputPath = $rootUri.MakeRelativeUri($entryUri).ToString()
                        if ([System.IO.Path]::DirectorySeparatorChar -ne '/') {
                            $outputPath = $outputPath -replace '/', [System.IO.Path]::DirectorySeparatorChar
                        }
                    }
                    catch {
                        $outputPath = $entry
                    }
                }
            }

            if (-not $Absolute.IsPresent) {
                $outputPath = $outputPath.TrimStart([char[]]"\/")
            }

            $results.Add($outputPath)
        }
    }

    if ($Sort.IsPresent) {
        $results.Sort([System.StringComparer]::OrdinalIgnoreCase)
    }

    # Enhanced output with size and line count
    if ($results.Count -eq 0) {
        Write-Output "No files found."
        return
    }

    # Group by directory for better formatting
    $byDirectory = @{}
    foreach ($filePath in $results) {
        $dirName = [System.IO.Path]::GetDirectoryName($filePath)
        if ([string]::IsNullOrEmpty($dirName)) {
            $dirName = "."
        }

        if (-not $byDirectory.ContainsKey($dirName)) {
            $byDirectory[$dirName] = New-Object System.Collections.Generic.List[string]
        }
        $byDirectory[$dirName].Add($filePath)
    }

    # Output formatted results
    $sortedDirs = $byDirectory.Keys | Sort-Object
    foreach ($dir in $sortedDirs) {
        # Output directory header
        Write-Output "$dir\"

        # Get files in this directory
        $filesInDir = $byDirectory[$dir]

        foreach ($filePath in $filesInDir) {
            $fileName = [System.IO.Path]::GetFileName($filePath)

            # Get full path for stat
            $fullPath = if ($Absolute.IsPresent) {
                $filePath
            } else {
                Join-Path $resolvedPath $filePath
            }

            try {
                $fileInfo = New-Object System.IO.FileInfo($fullPath)
                $sizeKB = [math]::Round($fileInfo.Length / 1KB, 1)

                # Count lines without loading entire file
                $lineCount = 0
                try {
                    $reader = [System.IO.File]::OpenText($fullPath)
                    while ($null -ne $reader.ReadLine()) {
                        $lineCount++
                    }
                    $reader.Close()
                } catch {
                    $lineCount = 0
                }

                # Format output: "  filename.ext    X.X KB    YYY lines"
                $sizeStr = "$sizeKB KB".PadRight(10)
                $linesStr = "$lineCount lines"
                Write-Output "  $($fileName.PadRight(20)) $sizeStr $linesStr"
            } catch {
                # Fallback if stat fails
                Write-Output "  $fileName"
            }
        }

        Write-Output ""
    }
}

function Search-InFiles {
    <#
    .SYNOPSIS
    ULTRA-FAST recursive search using ripgrep (rg) - 100x faster than PowerShell Select-String!
    Automatically excludes node_modules, .git, dist, build, and respects .gitignore

    .PARAMETER Pattern
    Regex pattern to search

    .PARAMETER Path
    Starting directory (default: current directory)

    .PARAMETER Filter
    File filter (e.g., "*.js", "*.html,*.css")

    .PARAMETER Depth
    Maximum recursion depth (default: 3)

    .PARAMETER Context
    Lines of context to show (default: 0)

    .PARAMETER RgPath
    Path to ripgrep executable (optional, for bundled binary)

    .EXAMPLE
    Search-InFiles -Pattern "openCodeDetail" -Filter "*.js" -Depth 2
    Search-InFiles -Pattern "class.*Button" -Filter "*.tsx" -Context 2
    Search-InFiles -Pattern "#code-title" -Filter "*.html,*.js" -Path "renderer"
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Pattern,

        [Parameter(Mandatory=$false)]
        [string]$Path = ".",

        [Parameter(Mandatory=$false)]
        [string]$Filter = "*.*",

        [Parameter(Mandatory=$false)]
        [int]$Depth = 3,

        [Parameter(Mandatory=$false)]
        [int]$Context = 0,

        [Parameter(Mandatory=$false)]
        [string]$RgPath
    )

    if (-not (Test-Path $Path)) {
        Write-Error "Path not found: $Path"
        return
    }

    Write-Output "Searching for pattern: $Pattern"
    Write-Output "Path: $Path | Filter: $Filter | Depth: $Depth"

    # Check if ripgrep is available
    $rgCommand = if ($RgPath -and (Test-Path $RgPath)) {
        $RgPath
    } else {
        "rg"
    }
    
    $rgAvailable = $null -ne (Get-Command $rgCommand -ErrorAction SilentlyContinue)

    if (-not $rgAvailable) {
        Write-Output "========================================"
        Write-Output "Ripgrep (rg) not found - Installing now"
        Write-Output "========================================"
        Write-Output ""

        try {
            $installSuccess = $false

            # Detect OS and install ripgrep
            if ($IsWindows -or $env:OS -match "Windows") {
                # Try winget first (fastest, built into Windows 11+)
                $wingetAvailable = $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
                if ($wingetAvailable) {
                    Write-Output "[1/3] Installing ripgrep via winget (Windows Package Manager)..."
                    Write-Output ""

                    # Show install output for troubleshooting
                    $installOutput = winget install BurntSushi.ripgrep.MSVC --silent --accept-source-agreements --accept-package-agreements 2>&1

                    if ($LASTEXITCODE -eq 0 -or $installOutput -match "successfully installed") {
                        Write-Output "✓ Winget install completed"
                        $installSuccess = $true
                    } else {
                        Write-Output "× Winget install failed or already installed"
                        Write-Output "Install output: $installOutput"
                    }
                } else {
                    # Fallback to choco
                    $chocoAvailable = $null -ne (Get-Command choco -ErrorAction SilentlyContinue)
                    if ($chocoAvailable) {
                        Write-Output "[1/3] Installing ripgrep via Chocolatey..."
                        Write-Output ""

                        $installOutput = choco install ripgrep -y 2>&1

                        if ($LASTEXITCODE -eq 0) {
                            Write-Output "✓ Chocolatey install completed"
                            $installSuccess = $true
                        } else {
                            Write-Output "× Chocolatey install failed"
                            Write-Output "Install output: $installOutput"
                        }
                    } else {
                        Write-Error "Neither winget nor chocolatey found. Cannot auto-install ripgrep."
                        Write-Output ""
                        Write-Output "Please install ripgrep manually:"
                        Write-Output "  - Via winget: winget install BurntSushi.ripgrep.MSVC"
                        Write-Output "  - Via choco: choco install ripgrep"
                        Write-Output "  - Download: https://github.com/BurntSushi/ripgrep/releases"
                        Write-Output ""
                        Write-Output "Using PowerShell Select-String fallback for now..."
                        $rgAvailable = $false
                    }
                }
            } elseif ($IsMacOS) {
                Write-Output "[1/3] Installing ripgrep via Homebrew..."
                Write-Output ""

                $installOutput = brew install ripgrep 2>&1

                if ($LASTEXITCODE -eq 0) {
                    Write-Output "✓ Homebrew install completed"
                    $installSuccess = $true
                } else {
                    Write-Output "× Homebrew install failed"
                    Write-Output "Install output: $installOutput"
                }
            } else {
                # Linux
                if (Test-Path "/usr/bin/apt") {
                    Write-Output "[1/3] Installing ripgrep via apt (Ubuntu/Debian)..."
                    Write-Output ""

                    sudo apt-get update -y
                    $installOutput = sudo apt-get install -y ripgrep 2>&1

                    if ($LASTEXITCODE -eq 0) {
                        Write-Output "✓ APT install completed"
                        $installSuccess = $true
                    } else {
                        Write-Output "× APT install failed"
                        Write-Output "Install output: $installOutput"
                    }
                } elseif (Test-Path "/usr/bin/yum") {
                    Write-Output "[1/3] Installing ripgrep via yum (RedHat/CentOS)..."
                    Write-Output ""

                    $installOutput = sudo yum install -y ripgrep 2>&1

                    if ($LASTEXITCODE -eq 0) {
                        Write-Output "✓ YUM install completed"
                        $installSuccess = $true
                    } else {
                        Write-Output "× YUM install failed"
                        Write-Output "Install output: $installOutput"
                    }
                }
            }

            Write-Output ""
            Write-Output "[2/3] Refreshing PATH environment variable..."

            # Refresh PATH in current session (Windows only)
            if ($IsWindows -or $env:OS -match "Windows") {
                try {
                    $machinePath = [System.Environment]::GetEnvironmentVariable("Path","Machine")
                    $userPath = [System.Environment]::GetEnvironmentVariable("Path","User")
                    $env:Path = "$machinePath;$userPath"
                    Write-Output "✓ PATH refreshed in current session"
                } catch {
                    Write-Warning "Failed to refresh PATH: $_"
                }
            } else {
                Write-Output "✓ PATH refresh not required on this OS"
            }

            Write-Output ""
            Write-Output "[3/3] Verifying ripgrep installation..."

            # Check if install succeeded
            $rgAvailable = $null -ne (Get-Command rg -ErrorAction SilentlyContinue)

            if ($rgAvailable) {
                $rgVersion = (rg --version 2>&1 | Select-Object -First 1)
                Write-Output "✓ Ripgrep is now available: $rgVersion"
                Write-Output ""
                Write-Output "========================================"
                Write-Output "[RG_INSTALLED] Installation successful!"
                Write-Output "========================================"
                return
            } else {
                Write-Output "× Ripgrep command still not found after installation"
                Write-Output ""

                if ($installSuccess) {
                    Write-Output "Installation completed but requires terminal restart to update PATH."
                    Write-Output ""
                    Write-Output "========================================"
                    Write-Output "[RG_INSTALLED] Terminal restart required"
                    Write-Output "========================================"
                    return
                } else {
                    Write-Warning "Installation may have failed. Using PowerShell Select-String fallback..."
                    $rgAvailable = $false
                }
            }
        } catch {
            Write-Error "Failed to install ripgrep: $_"
            Write-Output ""
            Write-Output "Falling back to PowerShell Select-String (slower)..."
            $rgAvailable = $false
        }
    }

    if ($rgAvailable) {
        # Use ripgrep for ultra-fast search
        Write-Output "Using ripgrep (fast search)..."

        try {
            # Build ripgrep command
            $rgArgs = @(
                $Pattern,
                "--glob", $Filter,
                "--max-depth", $Depth.ToString(),
                "--line-number",
                "--no-heading",
                "--with-filename"
            )

            if ($Context -gt 0) {
                $rgArgs += "--context"
                $rgArgs += $Context.ToString()
            }

            # Add path
            $rgArgs += $Path

            # Execute ripgrep
            $rgOutput = & $rgCommand @rgArgs 2>&1

            if ($LASTEXITCODE -eq 0 -or $LASTEXITCODE -eq 1) {  # 0 = matches found, 1 = no matches
                if ($rgOutput) {
                    $linePattern = '^(?<path>.+?)([:\-])(?<line>\d+)([:\-])(.*)$'
                    $matchesByFile = [ordered]@{}

                    foreach ($line in $rgOutput) {
                        if ([string]::IsNullOrWhiteSpace($line)) {
                            continue
                        }
                        if ($line -eq '--') {
                            continue
                        }
                        if ($line -match $linePattern) {
                            $filePath = $Matches['path']
                            $lineNumber = [int]$Matches['line']
                            $content = $Matches[5]

                            if (-not $matchesByFile.Contains($filePath)) {
                                $matchesByFile[$filePath] = New-Object System.Collections.Generic.List[object]
                            }
                            $matchesByFile[$filePath].Add([pscustomobject]@{ LineNumber = $lineNumber; Content = $content })
                        }
                    }

                    if ($matchesByFile.Count -eq 0) {
                        Write-Output "No matches found."
                    } else {
                        $totalMatches = 0
                        foreach ($entry in $matchesByFile.GetEnumerator()) {
                            $totalMatches += $entry.Value.Count
                        }

                        Write-Output "Found $totalMatches matches:"
                        Write-Output ""

                        $fileIndex = 0
                        foreach ($entry in $matchesByFile.GetEnumerator()) {
                            $fileIndex++
                            Write-Output $entry.Key
                            $sortedMatches = $entry.Value | Sort-Object LineNumber
                            foreach ($match in $sortedMatches) {
                                Write-Output ("{0}:{1}" -f $match.LineNumber, $match.Content)
                            }
                            if ($fileIndex -lt $matchesByFile.Count) {
                                Write-Output "--"
                            }
                        }
                    }
                } else {
                    Write-Output "No matches found."
                }
            } else {
                Write-Warning "Ripgrep execution failed with exit code $LASTEXITCODE"
                Write-Output "Output: $rgOutput"
                Write-Output ""
                Write-Output "Falling back to PowerShell Select-String..."
                $rgAvailable = $false
            }
        } catch {
            Write-Warning "Failed to execute ripgrep: $_"
            Write-Output ""
            Write-Output "Falling back to PowerShell Select-String..."
            $rgAvailable = $false
        }
    }

    if ($rgAvailable) {
        return
    }

    if (-not $rgAvailable) {
        # PowerShell fallback implementation
        Write-Output "Using PowerShell Select-String (slower)..."
        Write-Output ""

        $filters = $Filter -split ','
        $allMatches = @()

        foreach ($f in $filters) {
            $f = $f.Trim()
            try {
                $files = Get-ChildItem -Path $Path -Filter $f -Depth $Depth -File -ErrorAction SilentlyContinue |
                         Where-Object { $_.FullName -notmatch 'node_modules|\.git|dist|build' }

                foreach ($file in $files) {
                    if ($Context -gt 0) {
                        $matches = Select-String -Path $file.FullName -Pattern $Pattern -Context $Context -ErrorAction SilentlyContinue
                    } else {
                        $matches = Select-String -Path $file.FullName -Pattern $Pattern -ErrorAction SilentlyContinue
                    }

                    if ($matches) {
                        $allMatches += $matches
                    }
                }
            } catch {
                Write-Warning "Error searching $f : $_"
            }
        }

        if ($allMatches.Count -eq 0) {
            Write-Output "No matches found."
            return
        }

        Write-Output "Found $($allMatches.Count) matches:"
        Write-Output ""

        $groupedMatches = $allMatches | Group-Object -Property Path
        $groupIndex = 0
        foreach ($group in $groupedMatches) {
            $groupIndex++
            $relativePath = Resolve-Path -Relative $group.Name
            Write-Output $relativePath

            foreach ($match in $group.Group) {
                if ($match.Context -and $match.Context.PreContext) {
                    $preCount = $match.Context.PreContext.Count
                    for ($i = 0; $i -lt $preCount; $i++) {
                        $lineNumber = $match.LineNumber - ($preCount - $i)
                        Write-Output ("{0}:{1}" -f $lineNumber, $match.Context.PreContext[$i])
                    }
                }

                Write-Output ("{0}:{1}" -f $match.LineNumber, $match.Line)

                if ($match.Context -and $match.Context.PostContext) {
                    for ($i = 0; $i -lt $match.Context.PostContext.Count; $i++) {
                        $lineNumber = $match.LineNumber + $i + 1
                        Write-Output ("{0}:{1}" -f $lineNumber, $match.Context.PostContext[$i])
                    }
                }
            }

            if ($groupIndex -lt $groupedMatches.Count) {
                Write-Output "--"
            }
        }
        return
    }

    # Build ripgrep command
    $rgArgs = @(
        $Pattern,
        $Path,
        '--line-number',
        '--heading',
        '--color', 'never',
        '--max-depth', $Depth.ToString()
    )

    # Add context if requested
    if ($Context -gt 0) {
        $rgArgs += '-C'
        $rgArgs += $Context.ToString()
    }

    # Handle file filters (convert "*.js,*.html" to multiple --glob arguments)
    if ($Filter -ne "*.*") {
        $filters = $Filter -split ','
        foreach ($f in $filters) {
            $f = $f.Trim()
            $rgArgs += '--glob'
            $rgArgs += $f
        }
    }

    # Add common exclusions for extra speed (ripgrep already ignores these by default, but explicit is better)
    $excludes = @(
        'node_modules',
        '.git',
        'dist',
        'build',
        '.next',
        '.nuxt',
        'coverage',
        '__pycache__',
        '*.min.js',
        '*.bundle.js'
    )

    foreach ($exclude in $excludes) {
        $rgArgs += '--glob'
        $rgArgs += "!$exclude"
    }

    try {
        # Execute ripgrep
        $output = & rg @rgArgs 2>&1

        if ($LASTEXITCODE -eq 0) {
            # Matches found
            Write-Output $output
        } elseif ($LASTEXITCODE -eq 1) {
            # No matches found (not an error)
            Write-Output "No matches found."
        } else {
            # Actual error
            Write-Error "Ripgrep error: $output"
        }
    } catch {
        Write-Error "Failed to execute ripgrep: $_"
        Write-Output ""
        Write-Output "Falling back to PowerShell Select-String (slower)..."

        # Fallback to original PowerShell method if ripgrep fails
        $filters = $Filter -split ','
        $allMatches = @()

        foreach ($f in $filters) {
            $f = $f.Trim()
            try {
                $files = Get-ChildItem -Path $Path -Filter $f -Depth $Depth -File -ErrorAction SilentlyContinue |
                         Where-Object { $_.FullName -notmatch 'node_modules|\.git|dist|build' }

                foreach ($file in $files) {
                    if ($Context -gt 0) {
                        $matches = Select-String -Path $file.FullName -Pattern $Pattern -Context $Context -ErrorAction SilentlyContinue
                    } else {
                        $matches = Select-String -Path $file.FullName -Pattern $Pattern -ErrorAction SilentlyContinue
                    }

                    if ($matches) {
                        $allMatches += $matches
                    }
                }
            } catch {
                Write-Warning "Error searching $f : $_"
            }
        }

        if ($allMatches.Count -eq 0) {
            Write-Output "No matches found."
            return
        }

        Write-Output "Found $($allMatches.Count) matches:"
        Write-Output ""

        $groupedMatches = $allMatches | Group-Object -Property Path
        foreach ($group in $groupedMatches) {
            $relativePath = Resolve-Path -Relative $group.Name
            Write-Output "=== $relativePath ==="

            foreach ($match in $group.Group) {
                Write-Output "Line $($match.LineNumber): $($match.Line.Trim())"

                if ($Context -gt 0 -and $match.Context) {
                    if ($match.Context.PreContext) {
                        $match.Context.PreContext | ForEach-Object { Write-Output "  - $_" }
                    }
                    if ($match.Context.PostContext) {
                        $match.Context.PostContext | ForEach-Object { Write-Output "  + $_" }
                    }
                }
            }
            Write-Output ""
        }
    }
}

function Find-Pattern {
    <#
    .SYNOPSIS
    Fast single-file pattern search with line numbers (uses Select-String, NOT Get-Content)

    .PARAMETER Pattern
    Regex pattern to search

    .PARAMETER Path
    File path

    .PARAMETER Context
    Lines of context (default: 2)

    .PARAMETER CaseSensitive
    Case-sensitive search (default: false)

    .EXAMPLE
    Find-Pattern -Pattern "function.*open" -Path "renderer.js"
    Find-Pattern -Pattern "display.*none" -Path "style.css" -Context 3
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Pattern,

        [Parameter(Mandatory=$true)]
        [string]$Path,

        [Parameter(Mandatory=$false)]
        [int]$Context = 2,

        [Parameter(Mandatory=$false)]
        [switch]$CaseSensitive
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    Write-Output "Searching in: $Path"
    Write-Output "Pattern: $Pattern"
    Write-Output ""

    try {
        # Use Select-String with context (FAST - native regex, no file loading!)
        $matches = if ($CaseSensitive) {
            Select-String -Path $Path -Pattern $Pattern -Context $Context -CaseSensitive
        } else {
            Select-String -Path $Path -Pattern $Pattern -Context $Context
        }

        if (-not $matches) {
            Write-Output "No matches found."
            return
        }

        Write-Output "Found $($matches.Count) matches:"
        Write-Output ""

        foreach ($match in $matches) {
            Write-Output "--- Line $($match.LineNumber) ---"

            # Show context before
            if ($match.Context.PreContext) {
                foreach ($line in $match.Context.PreContext) {
                    Write-Output "  $line"
                }
            }

            # Show matching line (highlighted)
            Write-Output ">>> $($match.Line.Trim())"

            # Show context after
            if ($match.Context.PostContext) {
                foreach ($line in $match.Context.PostContext) {
                    Write-Output "  $line"
                }
            }

            Write-Output ""
        }
    } catch {
        Write-Error "Error searching file: $_"
    }
}

function Get-FileStats {
    <#
    .SYNOPSIS
    Get file statistics WITHOUT loading content (fast check before reading)

    .PARAMETER Path
    File path

    .EXAMPLE
    Get-FileStats -Path "large-file.js"
    #>
    param(
        [Parameter(Mandatory=$true)]
        [string]$Path
    )

    if (-not (Test-Path $Path)) {
        Write-Error "File not found: $Path"
        return
    }

    $file = Get-Item -Path $Path

    # Use .NET StreamReader to count lines WITHOUT loading entire file (FAST!)
    $lineCount = 0
    try {
        $reader = [System.IO.File]::OpenText($file.FullName)
        while ($null -ne $reader.ReadLine()) {
            $lineCount++
        }
        $reader.Close()
    } catch {
        Write-Warning "Could not count lines: $_"
        $lineCount = "unknown"
    }

    [PSCustomObject]@{
        Path = $file.FullName
        Name = $file.Name
        SizeKB = [math]::Round($file.Length / 1KB, 2)
        SizeMB = [math]::Round($file.Length / 1MB, 2)
        Lines = $lineCount
        Extension = $file.Extension
        LastModified = $file.LastWriteTime
    } | Format-List
}

# Note: Functions are automatically available after dot-sourcing this script
# No need for Export-ModuleMember (that's only for .psm1 modules)
