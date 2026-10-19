[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^11\.\d+$')]
    [string] $Task,

    [switch] $WhatIf
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$prompt = @"
Read AGENTS.md, the Level 11 instructions, .agents/PLAN.md, .agents/TASKS.md, and the last 40 lines of .agents/PROGRESS.md. Execute only Level 11 task $Task in $repoRoot. Do not begin another numbered task in this run. Never claim a gate passed without measured evidence in .agents/LEVEL_11_REPORT.md; label fake-backend results. Do not change an acceptance criterion without an ADR and explicit user approval. Verify the task, commit it, update .agents/TASKS.md and .agents/PROGRESS.md, and update the report table with gate, command, measured value, pass/fail, and runner. Do not output L11_COMPLETE unless every gate is measured and green or explicitly BLOCKED for a user-approved reason.
"@

if ($WhatIf) {
    Write-Output $prompt
    exit 0
}

$codex = Get-Command codex -ErrorAction Stop
$prompt | & $codex.Source exec --cd $repoRoot --sandbox workspace-write -
if ($LASTEXITCODE -ne 0) {
    throw "Codex task $Task exited with code $LASTEXITCODE."
}
