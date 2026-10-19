[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet(
        'dev', 'test', 'lint', 'typecheck', 'migrate', 'auth-migrate',
        'seed', 'sample', 'types', 'smoke', 'eval', 'benchmark-chat', 'list'
    )]
    [string] $Target = 'list'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Push-Location $repoRoot
try {
    function Invoke-Step {
        param(
            [Parameter(Mandatory)] [string] $Program,
            [Parameter(Mandatory)] [string[]] $Arguments
        )
        Write-Host "> $Program $($Arguments -join ' ')" -ForegroundColor Cyan
        & $Program @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code $LASTEXITCODE`: $Program $($Arguments -join ' ')"
        }
    }

    $pytest = @(
        'run', '--frozen', '--all-packages', 'pytest',
        '--cov=opennotebook_core.storage',
        '--cov=opennotebook_core.embeddings',
        '--cov=opennotebook_core.queue',
        '--cov-report=term-missing', '--cov-fail-under=80'
    )
    $pnpm = @('pnpm', '--filter', 'web')

    switch ($Target) {
        'list' {
            @('dev', 'test', 'lint', 'typecheck', 'migrate', 'auth-migrate', 'seed', 'sample', 'types', 'smoke', 'eval', 'benchmark-chat') |
                ForEach-Object { Write-Output $_ }
        }
        'dev' { Invoke-Step 'docker' @('compose', 'up', '--build', '-d') }
        'test' {
            Invoke-Step 'uv' ($pytest + @())
            Invoke-Step 'corepack' ($pnpm + @('test'))
        }
        'lint' {
            Invoke-Step 'uv' @('run', '--frozen', '--all-packages', 'ruff', 'check', '.')
            Invoke-Step 'corepack' ($pnpm + @('lint'))
        }
        'typecheck' {
            Invoke-Step 'uv' @('run', '--frozen', '--all-packages', 'mypy', '.')
            Invoke-Step 'corepack' ($pnpm + @('typecheck'))
        }
        'migrate' { Invoke-Step 'docker' @('compose', 'exec', '-T', 'api', 'alembic', '-c', 'packages/core/alembic.ini', 'upgrade', 'head') }
        'auth-migrate' { Invoke-Step 'docker' @('compose', 'run', '--rm', 'auth-migrate') }
        'seed' { Invoke-Step 'uv' @('run', 'python', 'scripts/seed.py') }
        'sample' { Invoke-Step 'uv' @('run', '--frozen', '--all-packages', 'python', 'scripts/load_onboarding_sample.py') }
        'types' {
            Invoke-Step 'uv' @('run', '--frozen', '--all-packages', 'python', 'scripts/export_openapi.py')
            Invoke-Step 'corepack' @('pnpm', '--filter', 'web', 'exec', 'openapi-typescript', '../../openapi.json', '-o', 'src/lib/generated/api.d.ts')
        }
        'smoke' { Invoke-Step 'docker' @('compose', 'exec', '-T', 'api', 'python', 'scripts/smoke_ping.py') }
        'eval' { Invoke-Step 'uv' @('run', '--frozen', '--all-packages', 'python', 'evals/run.py') }
        'benchmark-chat' { Invoke-Step 'uv' @('run', '--frozen', '--all-packages', 'python', 'scripts/benchmark_level3.py') }
    }
}
finally {
    Pop-Location
}
