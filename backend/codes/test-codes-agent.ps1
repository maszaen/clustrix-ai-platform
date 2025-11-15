param(
  [switch]$Verbose
)

$ErrorActionPreference = 'Stop'

function New-TempWorkspace {
  $path = Join-Path -Path ([System.IO.Path]::GetTempPath()) -ChildPath ("codes-agent-" + [System.Guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $path | Out-Null
  return $path
}

function Write-Lines {
  param(
    [string]$Path,
    [string[]]$Lines
  )

  $content = [string]::Join("`n", $Lines) + "`n"
  $directory = Split-Path -Path $Path
  if (-not (Test-Path $directory)) {
    New-Item -ItemType Directory -Path $directory | Out-Null
  }
  [System.IO.File]::WriteAllText($Path, $content, [System.Text.Encoding]::UTF8)
}

function Read-Lines {
  param([string]$Path)
  return Get-Content -Path $Path
}

$repoRoot = (Resolve-Path (Join-Path (Join-Path $PSScriptRoot '..') '..')).Path
$modulePath = (Join-Path $repoRoot 'backend/codes/edit-operations.js') -replace '\\', '/'

function Invoke-ApplySet {
  param(
    [string]$Workspace,
    [string]$Command
  )

  $encoded = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($Command))
  $script = "const { applySetOperations } = require('$modulePath');const payload = Buffer.from(process.argv[3], 'base64').toString('utf8');try{const result = applySetOperations(payload,{ workspacePath: process.argv[2] });console.log(JSON.stringify(result));}catch(error){console.error(JSON.stringify({ error: error.message }));process.exit(1);}";
  $output = & node -e $script $Workspace $encoded 2>&1

  if ($LASTEXITCODE -ne 0) {
    $err = ($output | ConvertFrom-Json).error
    throw "applySetOperations failed: $err"
  }

  return $output | ConvertFrom-Json
}

function Assert-True {
  param(
    [bool]$Condition,
    [string]$Message
  )

  if (-not $Condition) {
    throw "ASSERTION FAILED: $Message"
  }
}

$workspace = New-TempWorkspace
$fileRelative = 'sample/test-file.js'
$filePath = Join-Path $workspace $fileRelative
$lines = 1..50 | ForEach-Object { "line-$_" }
Write-Lines -Path $filePath -Lines $lines

try {
  Write-Host 'Test 1: Replace lines 10-20'
  $cmd1 = @"
<set file="$fileRelative" range={10, 20}>
<![CDATA[
replace-a
replace-b
]]>
</set>
"@
  $result1 = Invoke-ApplySet -Workspace $workspace -Command $cmd1
  Assert-True ($result1.success -eq $true) 'Replace operation should succeed'
  $final1 = Read-Lines -Path $filePath
  Assert-True ($final1[9] -eq 'replace-a') 'Line 10 must be replace-a'
  Assert-True ($final1[10] -eq 'replace-b') 'Line 11 must be replace-b'

  Write-Host 'Test 2: Delete lines 30-35'
  $cmd2 = @"
<set file="$fileRelative" range={30, 35}>
<![CDATA[]]>
</set>
"@
  Invoke-ApplySet -Workspace $workspace -Command $cmd2 | Out-Null
  $final2 = Read-Lines -Path $filePath
  Assert-True ($final2.Count -eq 44) 'Delete should remove six lines'

  Write-Host 'Test 3: Insert before line 5'
  $cmd3 = @"
<set file="$fileRelative" range={5}>
<![CDATA[
insert-a
insert-b
]]>
</set>
"@
  Invoke-ApplySet -Workspace $workspace -Command $cmd3 | Out-Null
  $final3 = Read-Lines -Path $filePath
  Assert-True ($final3[4] -eq 'insert-a') 'Inserted content should appear before original line 5'
  Assert-True ($final3[5] -eq 'insert-b') 'Second inserted line should follow'

  Write-Host 'Test 4: Append using range={-1}'
  $cmd4 = @"
<set file="$fileRelative" range={-1}>
<![CDATA[
tail-a
tail-b
]]>
</set>
"@
  Invoke-ApplySet -Workspace $workspace -Command $cmd4 | Out-Null
  $final4 = Read-Lines -Path $filePath
  Assert-True ($final4[-2] -eq 'tail-a') 'Second-to-last line should be tail-a'
  Assert-True ($final4[-1] -eq 'tail-b') 'Last line should be tail-b'

  Write-Host 'Test 5: Reject out-of-bounds range'
  $cmd5 = @"
<set file="$fileRelative" range={100, 110}>
<![CDATA[oob]]>
</set>
"@
  try {
    Invoke-ApplySet -Workspace $workspace -Command $cmd5 | Out-Null
    throw 'Expected validation failure'
  } catch {
    Assert-True ($_.Exception.Message -like '*exceeds file length*') 'Out-of-bounds should be rejected'
  }

  Write-Host 'Test 6: Reject invalid range ordering'
  $cmd6 = @"
<set file="$fileRelative" range={30, 20}>
<![CDATA[bad]]>
</set>
"@
  try {
    Invoke-ApplySet -Workspace $workspace -Command $cmd6 | Out-Null
    throw 'Expected range validation failure'
  } catch {
    Assert-True ($_.Exception.Message -like '*greater than or equal to start*') 'Start > end should be rejected'
  }

  Write-Host 'Test 7: Reject malformed CDATA'
  $cmd7 = @"
<set file="$fileRelative" range={5, 6}>
<![CDATA[missing-close
</set>
"@
  try {
    Invoke-ApplySet -Workspace $workspace -Command $cmd7 | Out-Null
    throw 'Expected CDATA validation failure'
  } catch {
    Assert-True ($_.Exception.Message -like '*CDATA section is not properly closed*') 'Malformed CDATA should be rejected'
  }

  Write-Host 'All tests passed.'
} finally {
  if (Test-Path $workspace) {
    Remove-Item -Path $workspace -Recurse -Force
  }
}

