param(
    [ValidateSet("start", "stop", "status", "init")]
    [string]$Action = "status"
)

$ErrorActionPreference = "Stop"
$bin = Join-Path $env:ProgramFiles "PostgreSQL\17\bin"
$base = Join-Path $env:LOCALAPPDATA "SolarEquity360"
$data = Join-Path $base "pgdata"
$log = Join-Path $base "postgres.log"
$port = 55432

if (-not (Test-Path (Join-Path $bin "pg_ctl.exe"))) {
    throw "PostgreSQL 17 binaries were not found at $bin."
}

switch ($Action) {
    "init" {
        if (Test-Path $data) {
            Write-Host "Cluster already exists at $data"
            break
        }
        New-Item -ItemType Directory -Force -Path $base | Out-Null
        $pwfile = Join-Path $env:TEMP "solarequity-initdb-password.txt"
        $password = Read-Host "Choose a password for the solarequity database user" -AsSecureString
        $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
            [Runtime.InteropServices.Marshal]::SecureStringToBSTR($password)
        )
        Set-Content -LiteralPath $pwfile -Value $plain -NoNewline -Encoding ascii
        & (Join-Path $bin "initdb.exe") -D $data -U solarequity `
            --auth-host=scram-sha-256 --auth-local=trust `
            --encoding=UTF8 --no-locale --pwfile=$pwfile
        Remove-Item -LiteralPath $pwfile -Force
        Add-Content -LiteralPath (Join-Path $data "postgresql.conf") -Value @"

port = 55432
listen_addresses = '127.0.0.1'
max_connections = 50
"@
        & (Join-Path $bin "pg_ctl.exe") -D $data -l $log -w start
        $env:PGPASSWORD = $plain
        & (Join-Path $bin "psql.exe") -h 127.0.0.1 -p $port -U solarequity -d postgres `
            -c "CREATE DATABASE solarequity360 OWNER solarequity;"
        Write-Host "Cluster initialized and started on port $port."
    }
    "start" {
        if (-not (Test-Path $data)) { throw "No cluster at $data. Run: .\scripts\dev-db.ps1 init" }
        & (Join-Path $bin "pg_ctl.exe") -D $data -l $log -w start
    }
    "stop" {
        if (-not (Test-Path $data)) { throw "No cluster at $data." }
        & (Join-Path $bin "pg_ctl.exe") -D $data -w stop
    }
    "status" {
        if (-not (Test-Path $data)) { Write-Host "Not initialized: $data"; break }
        & (Join-Path $bin "pg_ctl.exe") -D $data status
        Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue |
            Select-Object LocalAddress, LocalPort
    }
}
