param(
    [string]$OutputDirectory = "backups"
)

$ErrorActionPreference = "Stop"
$container = (docker compose ps -q postgres).Trim()
if (-not $container) {
    throw "Postgres is not running. Start the Compose stack before backing up."
}

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$fileName = "opennotebook-$stamp.dump"
$containerPath = "/tmp/$fileName"
$outputPath = Join-Path $OutputDirectory $fileName

docker compose exec -T postgres sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f "$1"' sh $containerPath
if ($LASTEXITCODE -ne 0) { throw "pg_dump failed with exit code $LASTEXITCODE" }
docker cp "${container}:$containerPath" $outputPath
if ($LASTEXITCODE -ne 0) { throw "Could not copy backup from the Postgres container" }
docker compose exec -T postgres rm -f $containerPath
Write-Output "Database backup created: $outputPath"
