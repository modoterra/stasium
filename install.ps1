# Stasium installer for Windows
# Usage: irm https://raw.githubusercontent.com/modoterra/stasium/main/install.ps1 | iex

$ErrorActionPreference = "Stop"

$Repo = "modoterra/stasium"
$GitHubApi = "https://api.github.com"
$GitHubDownload = "https://github.com"

function Main {
    $arch = Get-Arch
    $target = "windows-${arch}"
    $binary = "stasium-${target}.exe"

    $installDir = if ($env:INSTALL_DIR) {
        $env:INSTALL_DIR
    } else {
        Join-Path $env:LOCALAPPDATA "stasium"
    }

    $tag = Get-LatestTag
    $url = "${GitHubDownload}/${Repo}/releases/download/${tag}/${binary}"
    $checksumsUrl = "${GitHubDownload}/${Repo}/releases/download/${tag}/checksums.txt"

    Write-Host "Installing stasium ${tag} (${target}) to ${installDir}"

    $tmpDir = Join-Path ([System.IO.Path]::GetTempPath()) ([System.IO.Path]::GetRandomFileName())
    New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null

    try {
        $binaryPath = Join-Path $tmpDir $binary
        $checksumsPath = Join-Path $tmpDir "checksums.txt"

        Invoke-WebRequest -Uri $url -OutFile $binaryPath -UseBasicParsing
        Invoke-WebRequest -Uri $checksumsUrl -OutFile $checksumsPath -UseBasicParsing

        Test-Checksum -Dir $tmpDir -File $binary

        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
        $dest = Join-Path $installDir "stasium.exe"
        Move-Item -Path $binaryPath -Destination $dest -Force

        Write-Host "Installed stasium ${tag} to ${dest}"
        Add-ToPath $installDir
    }
    finally {
        Remove-Item -Path $tmpDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

function Get-Arch {
    $arch = [System.Runtime.InteropServices.RuntimeInformation]::OSArchitecture
    switch ($arch) {
        "X64"   { return "x64" }
        "Arm64" {
            Write-Host "Warning: Windows ARM64 binaries are not yet available." -ForegroundColor Yellow
            Write-Host "The x64 binary may work via emulation." -ForegroundColor Yellow
            return "x64"
        }
        default {
            Write-Error "Unsupported architecture: ${arch}"
            exit 1
        }
    }
}

function Get-LatestTag {
    $url = "${GitHubApi}/repos/${Repo}/releases/latest"
    $response = Invoke-RestMethod -Uri $url -UseBasicParsing
    if (-not $response.tag_name) {
        Write-Error "Could not determine latest release"
        exit 1
    }
    return $response.tag_name
}

function Test-Checksum {
    param([string]$Dir, [string]$File)

    $checksumsPath = Join-Path $Dir "checksums.txt"
    $content = Get-Content $checksumsPath

    $expected = $null
    foreach ($line in $content) {
        if ($line -match "^(\S+)\s+.*${File}$") {
            $expected = $Matches[1]
            break
        }
    }

    if (-not $expected) {
        Write-Host "Warning: no checksum found for ${File}, skipping verification" -ForegroundColor Yellow
        return
    }

    $filePath = Join-Path $Dir $File
    $hash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLower()

    if ($hash -ne $expected) {
        Write-Error "Checksum mismatch for ${File}`n  expected: ${expected}`n  actual:   ${hash}"
        exit 1
    }

    Write-Host "Checksum verified."
}

function Add-ToPath {
    param([string]$Dir)

    $userPath = [Environment]::GetEnvironmentVariable("PATH", "User")
    if ($userPath -split ";" | Where-Object { $_ -eq $Dir }) {
        return
    }

    Write-Host ""
    Write-Host "Adding ${Dir} to your user PATH..."
    [Environment]::SetEnvironmentVariable("PATH", "${userPath};${Dir}", "User")
    $env:PATH = "${env:PATH};${Dir}"
    Write-Host "Done. Restart your terminal for the PATH change to take effect."
}

Main
