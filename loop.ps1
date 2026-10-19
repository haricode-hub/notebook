# Usage: .\loop.ps1 -Level 11 -Max 60     (Windows PowerShell; agent must be on PATH)
# Use a throwaway container/VM if you pass permission-skipping flags, and set API spend limits.
param(
  [Parameter(Mandatory=$true)][int]$Level,
  [int]$Max = 60,
  [string]$Agent = "claude"   # or "codex"
)
$promptPath = ".agents/LOOP_PROMPT.md"
(Get-Content $promptPath) -replace '^CURRENT_LEVEL = .*', "CURRENT_LEVEL = $Level" | Set-Content $promptPath
for ($i = 1; $i -le $Max; $i++) {
  Write-Host "=== level $Level iteration $i ==="
  $prompt = Get-Content $promptPath -Raw
  if ($Agent -eq "codex") { $out = codex exec --full-auto $prompt 2>&1 | Out-String }
  else { $out = $prompt | claude -p --dangerously-skip-permissions 2>&1 | Out-String }
  ($out -split "`n" | Select-Object -Last 15) -join "`n" | Write-Host
  if ($out -match "<promise>L${Level}_COMPLETE</promise>") { Write-Host "LEVEL $Level DONE"; break }
  Start-Sleep -Seconds 2
}