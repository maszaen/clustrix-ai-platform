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
    
    # Output header with file path and total lines
    $relativePath = $Path -replace '\\', '/'
    if (-not $relativePath.StartsWith('/')) {
        $relativePath = "/$relativePath"
    }
    Write-Output "$relativePath [$totalLines lines]"

    for ($i = $startIdx; $i -le $endIdx; $i++) {
        $lineNum = $i + 1
        $content = $lines[$i]
        Write-Output ("{0}:{1}" -f $lineNum, $content)
    }

    # Add range indicator if not showing full file
    if ($StartLine -gt 1 -or $EndLine -lt $totalLines) {
        Write-Output ""
        Write-Output "[Showing $StartLine-$EndLine of $totalLines lines]"
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

    $relativePath = $Path -replace '\\', '/'
    if (-not $relativePath.StartsWith('/')) {
        $relativePath = "/$relativePath"
    }
    
    Write-Output "Updated $relativePath line $LineNumber"
    Write-Output ""
    $displayContent = $NewContent
    Write-Output ("{0}:{1}" -f $LineNumber, $displayContent)
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
    }
    
    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count
    
    if ($LineNumber -lt 1 -or $LineNumber -gt $totalLines) {
        Write-Error "Line number $LineNumber is out of range (1-$totalLines)"
        return
    }
    
    # Convert to 0-indexed
    $idx = $LineNumber - 1
    $removedLine = $lines[$idx]
    
    # Remove line using ArrayList (O(n) instead of O(n²))
    $linesList = [System.Collections.ArrayList]@($lines)
    $linesList.RemoveAt($idx)
    $newLines = $linesList.ToArray()
    
    # Write back to file
    $newLines | Set-Content -Path $Path -Encoding UTF8

    $relativePath = $Path -replace '\\', '/'
    if (-not $relativePath.StartsWith('/')) {
        $relativePath = "/$relativePath"
    }
    
    Write-Output "Removed $relativePath line $LineNumber"
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
    }
    
    $lines = Get-Content -Path $Path -Encoding UTF8
    $totalLines = $lines.Count
    
    if ($LineNumber -lt 1 -or $LineNumber -gt ($totalLines + 1)) {
        Write-Error "Line number $LineNumber is out of range (1-$($totalLines + 1))"
        return
    }
    
    # Convert to 0-indexed
    $idx = $LineNumber - 1
    
    # Insert line using ArrayList (O(n) instead of O(n²))
    $linesList = [System.Collections.ArrayList]@($lines)
    if ($LineNumber -gt $totalLines) {
        # Append to end
        $linesList.Add($NewContent) | Out-Null
    } else {
        # Insert at position
        $linesList.Insert($idx, $NewContent)
    }
    $newLines = $linesList.ToArray()
    
    # Write back to file
    $newLines | Set-Content -Path $Path -Encoding UTF8

    $relativePath = $Path -replace '\\', '/'
    if (-not $relativePath.StartsWith('/')) {
        $relativePath = "/$relativePath"
    }
    
    Write-Output "Inserted $relativePath line $LineNumber"
    Write-Output ""
    $displayContent = $NewContent
    Write-Output ("{0}:{1}" -f $LineNumber, $displayContent)
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

    # Report invalid lines
    if ($invalidLines.Count -gt 0) {
        $sortedInvalid = $invalidLines | Sort-Object
        Write-Error "Invalid line numbers: $($sortedInvalid -join ', ') (file has $totalLines lines)"
    }

    if ($validEdits.Count -eq 0) {
        Write-Error "No valid edits to apply"
        return
    }

    # Apply valid replacements only
    foreach ($lineNum in $validEdits.Keys) {
        $idx = $lineNum - 1
        $lines[$idx] = $validEdits[$lineNum]
        $changedCount++
    }

    # Write back to file
    $lines | Set-Content -Path $Path -Encoding UTF8

    $relativePath = $Path -replace '\\', '/'
    if (-not $relativePath.StartsWith('/')) {
        $relativePath = "/$relativePath"
    }

    $sortedLineNums = $validEdits.Keys | Sort-Object
    $minLine = $sortedLineNums | Select-Object -First 1
    $maxLine = $sortedLineNums | Select-Object -Last 1

    if ($minLine -eq $maxLine) {
        Write-Output "Updated $relativePath line $minLine"
    } else {
        Write-Output "Updated $relativePath lines $minLine-$maxLine"
    }
    Write-Output ""

    foreach ($lineNum in $sortedLineNums) {
        $displayContent = $validEdits[$lineNum]
        Write-Output ("{0}:{1}" -f $lineNum, $displayContent)
    }
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
    $matchResults = @()

    for ($i = 0; $i -lt $totalLines; $i++) {
        if ($lines[$i] -match $Pattern) {
            $lineNum = $i + 1
            $startIdx = [Math]::Max(0, $i - $ContextBefore)
            $endIdx = [Math]::Min($totalLines - 1, $i + $ContextAfter)
            $matchResults += @{
                StartIdx = $startIdx
                EndIdx = $endIdx
            }
        }
    }

    if ($matchResults.Count -eq 0) {
        Write-Output "No results found."
        return
    }

    $resultWord = if ($matchResults.Count -eq 1) { "result" } else { "results" }
    Write-Output "Found $($matchResults.Count) $resultWord`:"
    Write-Output ""

    $relativePath = $Path -replace '\\', '/'
    if (-not $relativePath.StartsWith('/')) {
        $relativePath = "/$relativePath"
    }
    Write-Output $relativePath

    $isFirst = $true
    foreach ($match in $matchResults) {
        if (-not $isFirst) {
            Write-Output ""
        }
        $isFirst = $false

        for ($j = $match.StartIdx; $j -le $match.EndIdx; $j++) {
            $num = $j + 1
            $content = $lines[$j]
            Write-Output ("{0}:{1}" -f $num, $content)
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

    $relativePath = $Path -replace '\\', '/'
    if (-not $relativePath.StartsWith('/')) {
        $relativePath = "/$relativePath"
    }
    Write-Output "$relativePath [$totalLines lines]"

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

            Write-Output ""
            for ($i = $start - 1; $i -lt $end; $i++) {
                $lineNum = $i + 1
                $content = $lines[$i]
                Write-Output ("{0}:{1}" -f $lineNum, $content)
            }
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
        Write-Output "No results found."
    } else {
        $resultWord = if ($duplicates.Count -eq 1) { "result" } else { "results" }
        Write-Output "Found $($duplicates.Count) $resultWord`:"
        Write-Output ""

        $relativePath = $Path -replace '\\', '/'
        if (-not $relativePath.StartsWith('/')) {
            $relativePath = "/$relativePath"
        }
        Write-Output $relativePath

        foreach ($dup in $duplicates) {
            $content = $dup.Content
            Write-Output ("{0}:{1} (duplicate of line {2})" -f $dup.Line, $content, $dup.FirstSeenAt)
        }
    }
}

function List-ProjectFiles {
    <#
    .SYNOPSIS
    Structured directory listing with file metrics and depth control.

    .PARAMETER Path
    Root directory to scan (default: current working directory)

    .PARAMETER Extensions
    Comma separated list or array of extensions (".js,.ts") or wildcard patterns ("*.js").

    .PARAMETER Depth
    Maximum depth to recurse relative to the starting directory. Use -1 for unlimited.

    .PARAMETER Exclude
    Directory names to ignore during traversal.

    .PARAMETER Absolute
    Include absolute file paths next to the formatted output.

    .PARAMETER Sort
    (Deprecated) Results are now grouped and sorted automatically for readability.
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

    $depthProvided = $PSBoundParameters.ContainsKey('Depth')
    $effectiveDepth = if ($depthProvided) { $Depth } else { [Math]::Min($Depth, 2) }
    $maxDepth = if ($effectiveDepth -lt 0) { [int]::MaxValue } else { $effectiveDepth }

    $getLineCount = {
        param([string]$filePath)
        $reader = $null
        try {
            $reader = [System.IO.File]::OpenText($filePath)
            $count = 0
            while ($null -ne $reader.ReadLine()) {
                $count += 1
            }
            return $count
        }
        catch {
            return -1
        }
        finally {
            if ($reader) { $reader.Dispose() }
        }
    }

    $files = [System.Collections.Generic.List[object]]::new()
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

            $relativePath = $entry
            try {
                $relativePath = [System.IO.Path]::GetRelativePath($resolvedPath, $entry)
            }
            catch {
                try {
                    $rootUri = New-Object System.Uri(($resolvedPath.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar))
                    $entryUri = New-Object System.Uri($entry)
                    $relativePath = $rootUri.MakeRelativeUri($entryUri).ToString()
                    if ([System.IO.Path]::DirectorySeparatorChar -ne '/') {
                        $relativePath = $relativePath -replace '/', [System.IO.Path]::DirectorySeparatorChar
                    }
                }
                catch {
                    $relativePath = $entry
                }
            }

            $relativePath = $relativePath.TrimStart([char[]]"\/")
            if ([string]::IsNullOrWhiteSpace($relativePath)) {
                $relativePath = $name
            }

            try {
                $fileInfo = Get-Item -LiteralPath $entry -ErrorAction Stop
            }
            catch {
                Write-Warning "List-ProjectFiles: Unable to read $entry ($($_.Exception.Message))"
                continue
            }

            $lineCount = & $getLineCount $entry
            $directory = [System.IO.Path]::GetDirectoryName($relativePath)
            if ([string]::IsNullOrWhiteSpace($directory)) {
                $directory = '.'
            }

            $files.Add([PSCustomObject]@{
                FileName    = $name
                Directory   = $directory
                Relative    = $relativePath
                Absolute    = $entry
                SizeBytes   = $fileInfo.Length
                LineCount   = $lineCount
            })
        }
    }

    if ($files.Count -eq 0) {
        Write-Output "No files found."
        return
    }

    $fileWord = if ($files.Count -eq 1) { "file" } else { "files" }
    Write-Output "Found $($files.Count) $fileWord`:"
    Write-Output ""

    $grouped = $files | Group-Object -Property Directory | Sort-Object { $_.Name }

    foreach ($group in $grouped) {
        $dirName = $group.Name
        $displayDir = if ($dirName -eq '.' -or [string]::IsNullOrWhiteSpace($dirName)) { "/" } else { "/" + ($dirName -replace '\\', '/') + "/" }
        Write-Output $displayDir

        $fileEntries = $group.Group | Sort-Object -Property FileName
        $maxNameLength = ($fileEntries | ForEach-Object { $_.FileName.Length } | Measure-Object -Maximum).Maximum
        if (-not $maxNameLength) { $maxNameLength = 0 }

        foreach ($file in $fileEntries) {
            $sizeLabel = "{0:N1} KB" -f ([math]::Round($file.SizeBytes / 1KB, 1))
            $lineLabel = if ($file.LineCount -ge 0) { "{0} lines" -f $file.LineCount } else { "? lines" }
            $format = "  {0,-$maxNameLength}  {1,8}   {2}"
            $line = $format -f $file.FileName, $sizeLabel, $lineLabel
            if ($Absolute.IsPresent) {
                $line += "  [$($file.Absolute)]"
            }
            Write-Output $line
        }

        Write-Output ''
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
                        Write-Output "[OK] Winget install completed"
                        $installSuccess = $true
                    } else {
                        Write-Output "[FAIL] Winget install failed or already installed"
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
                            Write-Output "[OK] Chocolatey install completed"
                            $installSuccess = $true
                        } else {
                            Write-Output "[FAIL] Chocolatey install failed"
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
                    Write-Output "[OK] Homebrew install completed"
                    $installSuccess = $true
                } else {
                    Write-Output "[FAIL] Homebrew install failed"
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
                        Write-Output "[OK] APT install completed"
                        $installSuccess = $true
                    } else {
                        Write-Output "[FAIL] APT install failed"
                        Write-Output "Install output: $installOutput"
                    }
                } elseif (Test-Path "/usr/bin/yum") {
                    Write-Output "[1/3] Installing ripgrep via yum (RedHat/CentOS)..."
                    Write-Output ""

                    $installOutput = sudo yum install -y ripgrep 2>&1

                    if ($LASTEXITCODE -eq 0) {
                        Write-Output "[OK] YUM install completed"
                        $installSuccess = $true
                    } else {
                        Write-Output "[FAIL] YUM install failed"
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
                    Write-Output "[OK] PATH refreshed in current session"
                } catch {
                    Write-Warning "Failed to refresh PATH: $_"
                }
            } else {
                Write-Output "[OK] PATH refresh not required on this OS"
            }

            Write-Output ""
            Write-Output "[3/3] Verifying ripgrep installation..."

            # Check if install succeeded
            $rgAvailable = $null -ne (Get-Command rg -ErrorAction SilentlyContinue)

            if ($rgAvailable) {
                $rgVersion = (rg --version 2>&1 | Select-Object -First 1)
                Write-Output "[OK] Ripgrep is now available: $rgVersion"
                Write-Output ""
                Write-Output "========================================"
                Write-Output "[RG_INSTALLED] Installation successful!"
                Write-Output "========================================"
                return
            } else {
                Write-Output "[FAIL] Ripgrep command still not found after installation"
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
                    $linePattern = '^(?<path>.+?)([:\-])(?<line>\d+)([:\-])(?<content>.*)$'
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
                            $content = $Matches['content']

                            if (-not $matchesByFile.Contains($filePath)) {
                                $matchesByFile[$filePath] = New-Object System.Collections.Generic.List[object]
                            }
                            $matchesByFile[$filePath].Add([pscustomobject]@{ LineNumber = $lineNumber; Content = $content })
                        }
                    }

                    if ($matchesByFile.Count -eq 0) {
                        Write-Output "No results found."
                    } else {
                        $totalMatches = 0
                        foreach ($entry in $matchesByFile.GetEnumerator()) {
                            $totalMatches += $entry.Value.Count
                        }

                        $resultWord = if ($totalMatches -eq 1) { "result" } else { "results" }
                        Write-Output "Found $totalMatches $resultWord`:"
                        Write-Output ""

                        $isFirst = $true
                        foreach ($entry in $matchesByFile.GetEnumerator()) {
                            if (-not $isFirst) {
                                Write-Output ""
                            }
                            $isFirst = $false

                            $filePath = $entry.Key -replace '\\', '/'
                            if (-not $filePath.StartsWith('/')) {
                                $filePath = "/$filePath"
                            }
                            Write-Output $filePath

                            $sortedMatches = $entry.Value | Sort-Object LineNumber
                            foreach ($match in $sortedMatches) {
                                $content = $match.Content
                                Write-Output ("{0}:{1}" -f $match.LineNumber, $content)
                            }
                        }
                    }
                } else {
                    Write-Output "No results found."
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
            Write-Output "No results found."
            return
        }

        $resultWord = if ($allMatches.Count -eq 1) { "result" } else { "results" }
        Write-Output "Found $($allMatches.Count) $resultWord`:"
        Write-Output ""

        $groupedMatches = $allMatches | Group-Object -Property Path
        $isFirst = $true
        foreach ($group in $groupedMatches) {
            if (-not $isFirst) {
                Write-Output ""
            }
            $isFirst = $false

            $relativePath = (Resolve-Path -Relative $group.Name) -replace '\\', '/'
            if (-not $relativePath.StartsWith('/')) {
                $relativePath = "/$relativePath"
            }
            Write-Output $relativePath

            foreach ($match in $group.Group) {
                if ($match.Context -and $match.Context.PreContext) {
                    $preCount = $match.Context.PreContext.Count
                    for ($i = 0; $i -lt $preCount; $i++) {
                        $lineNumber = $match.LineNumber - ($preCount - $i)
                        $content = $match.Context.PreContext[$i]
                        Write-Output ("{0}:{1}" -f $lineNumber, $content)
                    }
                }

                $mainContent = $match.Line
                Write-Output ("{0}:{1}" -f $match.LineNumber, $mainContent)

                if ($match.Context -and $match.Context.PostContext) {
                    for ($i = 0; $i -lt $match.Context.PostContext.Count; $i++) {
                        $lineNumber = $match.LineNumber + $i + 1
                        $content = $match.Context.PostContext[$i]
                        Write-Output ("{0}:{1}" -f $lineNumber, $content)
                    }
                }
            }
        }
        return
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

    try {
        # Use Select-String with context (FAST - native regex, no file loading!)
        $matchResults = if ($CaseSensitive) {
            Select-String -Path $Path -Pattern $Pattern -Context $Context -CaseSensitive
        } else {
            Select-String -Path $Path -Pattern $Pattern -Context $Context
        }

        if (-not $matchResults) {
            Write-Output "No results found."
            return
        }

        $resultWord = if ($matchResults.Count -eq 1) { "result" } else { "results" }
        Write-Output "Found $($matchResults.Count) $resultWord`:"
        Write-Output ""

        $relativePath = $Path -replace '\\', '/'
        if (-not $relativePath.StartsWith('/')) {
            $relativePath = "/$relativePath"
        }
        Write-Output $relativePath

        $isFirst = $true
        foreach ($match in $matchResults) {
            if (-not $isFirst) {
                Write-Output ""
            }
            $isFirst = $false

            # Show context before
            if ($match.Context.PreContext) {
                $startLine = $match.LineNumber - $match.Context.PreContext.Count
                $ctxIdx = 0
                foreach ($line in $match.Context.PreContext) {
                    $content = $line
                    Write-Output ("{0}:{1}" -f ($startLine + $ctxIdx), $content)
                    $ctxIdx++
                }
            }

            # Show matching line
            $mainContent = $match.Line
            Write-Output ("{0}:{1}" -f $match.LineNumber, $mainContent)

            # Show context after
            if ($match.Context.PostContext) {
                $ctxIdx = 1
                foreach ($line in $match.Context.PostContext) {
                    $content = $line
                    Write-Output ("{0}:{1}" -f ($match.LineNumber + $ctxIdx), $content)
                    $ctxIdx++
                }
            }
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
        $lineCount = "?"
    }

    $relativePath = $Path -replace '\\', '/'
    if (-not $relativePath.StartsWith('/')) {
        $relativePath = "/$relativePath"
    }

    $sizeKB = [math]::Round($file.Length / 1KB, 1)
    
    Write-Output $relativePath
    Write-Output "  Size: $sizeKB KB"
    Write-Output "  Lines: $lineCount"
    Write-Output "  Modified: $($file.LastWriteTime.ToString('yyyy-MM-dd HH:mm:ss'))"
}

# Note: Functions are automatically available after dot-sourcing this script
# No need for Export-ModuleMember (that's only for .psm1 modules)