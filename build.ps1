# Build and package Mattermost Meeting Plugin
# Usage: .\build.ps1

Write-Host "Building Meeting Plugin..." -ForegroundColor Cyan

# Check if Go is installed
$goVersion = go version 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Error: Go is not installed. Please install Go from https://go.dev/dl/" -ForegroundColor Red
    exit 1
}
Write-Host "Found: $goVersion" -ForegroundColor Green

# Step 1: Install webapp dependencies
Write-Host "`nInstalling webapp dependencies..." -ForegroundColor Yellow
Push-Location webapp
npm install
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to install dependencies" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Step 2: Build webapp with webpack
Write-Host "`nBuilding webapp with webpack..." -ForegroundColor Yellow
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build webapp" -ForegroundColor Red
    Pop-Location
    exit 1
}
Pop-Location

if (-not (Test-Path "webapp\dist\main.js")) {
    Write-Host "Build failed: webapp\dist\main.js not found" -ForegroundColor Red
    exit 1
}
Write-Host "Webapp build successful: webapp\dist\main.js created" -ForegroundColor Green

# Step 3: Build server (Go plugin)
Write-Host "`nBuilding server components..." -ForegroundColor Yellow
Push-Location server

# Create dist directory
New-Item -ItemType Directory -Path "dist" -Force | Out-Null

# Download Go dependencies
Write-Host "Downloading Go dependencies..." -ForegroundColor Cyan
go mod download

# Build for Linux (most common for Mattermost servers)
Write-Host "Building for Linux amd64..." -ForegroundColor Cyan
$env:CGO_ENABLED="0"
$env:GOOS="linux"
$env:GOARCH="amd64"
go build -o "dist/plugin-linux-amd64" .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build server for Linux" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Build for Windows (for local testing)
Write-Host "Building for Windows amd64..." -ForegroundColor Cyan
$env:CGO_ENABLED="0"
$env:GOOS="windows"
$env:GOARCH="amd64"
go build -o "dist/plugin-windows-amd64.exe" .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build server for Windows" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Build for macOS Intel
Write-Host "Building for macOS amd64..." -ForegroundColor Cyan
$env:CGO_ENABLED="0"
$env:GOOS="darwin"
$env:GOARCH="amd64"
go build -o "dist/plugin-darwin-amd64" .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build server for macOS Intel" -ForegroundColor Red
    Pop-Location
    exit 1
}

# Build for macOS Apple Silicon
Write-Host "Building for macOS arm64..." -ForegroundColor Cyan
$env:CGO_ENABLED="0"
$env:GOOS="darwin"
$env:GOARCH="arm64"
go build -o "dist/plugin-darwin-arm64" .
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build server for macOS Apple Silicon" -ForegroundColor Red
    Pop-Location
    exit 1
}

Pop-Location

Write-Host "Server build successful for all platforms" -ForegroundColor Green

# Step 4: Clean up old archive
if (Test-Path "kontur-meeting.tar.gz") {
    Remove-Item "kontur-meeting.tar.gz" -Force
    Write-Host "Removed old kontur-meeting.tar.gz" -ForegroundColor Gray
}

if (Test-Path "build_temp") {
    Remove-Item "build_temp" -Recurse -Force
}

# Step 5: Create package structure
Write-Host "`nCreating package structure..." -ForegroundColor Yellow
New-Item -ItemType Directory -Path "build_temp\webapp\dist" -Force | Out-Null
New-Item -ItemType Directory -Path "build_temp\server\dist" -Force | Out-Null
New-Item -ItemType Directory -Path "build_temp\assets" -Force | Out-Null

Copy-Item "plugin.json" "build_temp\"
Copy-Item "webapp\dist\main.js" "build_temp\webapp\dist\"
Copy-Item "server\dist\*" "build_temp\server\dist\" -Recurse
Copy-Item "assets\*" "build_temp\assets\" -Recurse

# Step 6: Create TAR.GZ archive with executable permissions
Write-Host "Creating kontur-meeting.tar.gz with executable permissions..." -ForegroundColor Yellow

if (Get-Command wsl -ErrorAction SilentlyContinue) {
    Write-Host "Using WSL to create archive with proper permissions..." -ForegroundColor Cyan
    # Use WSL bash script to set permissions and create tar
    wsl bash build-archive.sh
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Failed to create archive with WSL" -ForegroundColor Red
        Remove-Item -Path "build_temp" -Recurse -Force
        exit 1
    }
} else {
    Write-Host "WARNING: WSL not found!" -ForegroundColor Red
    Write-Host "Archive will be created without executable permissions." -ForegroundColor Yellow
    Write-Host "You will need to fix permissions manually after uploading to Mattermost." -ForegroundColor Yellow
    
    # Fallback to Windows tar (without executable permissions)
    Push-Location build_temp
    tar -czf "..\kontur-meeting.tar.gz" plugin.json webapp server assets
    Pop-Location
    
    Write-Host ""
    Write-Host "To fix permissions manually:" -ForegroundColor Yellow
    Write-Host "1. SSH to Mattermost server" -ForegroundColor White
    Write-Host "2. cd /opt/mattermost/plugins/com.skyeng.kontur-meeting/" -ForegroundColor White
    Write-Host "3. chmod +x server/dist/plugin-*" -ForegroundColor White
    Write-Host "4. Restart Mattermost" -ForegroundColor White
}

if (-not (Test-Path "kontur-meeting.tar.gz")) {
    Write-Host "Failed to create tar.gz archive" -ForegroundColor Red
    Remove-Item -Path "build_temp" -Recurse -Force
    exit 1
}

# Step 7: Verify archive
Write-Host "`nVerifying archive structure..." -ForegroundColor Yellow
Write-Host "Archive contents:" -ForegroundColor Cyan
tar -tzf "kontur-meeting.tar.gz"

# Clean up
Remove-Item -Path "build_temp" -Recurse -Force

$fileSize = [math]::Round((Get-Item "kontur-meeting.tar.gz").Length / 1MB, 2)
Write-Host "`nSuccess! kontur-meeting.tar.gz is ready" -ForegroundColor Green
Write-Host "Location: $PWD\kontur-meeting.tar.gz" -ForegroundColor Cyan
Write-Host "Size: $fileSize MB" -ForegroundColor Cyan
Write-Host "`nNext steps:" -ForegroundColor Yellow
Write-Host "  1. Open Mattermost System Console" -ForegroundColor White
Write-Host "  2. Go to Plugins -> Plugin Management" -ForegroundColor White
Write-Host "  3. Upload kontur-meeting.tar.gz" -ForegroundColor White
Write-Host "  4. Enable the plugin" -ForegroundColor White
Write-Host "  5. Configure Webhook URL in plugin settings" -ForegroundColor White
Write-Host "  6. Reload Mattermost page (Ctrl+R)" -ForegroundColor White
Write-Host "`nNOTE: Users will NOT be prompted for URL anymore!" -ForegroundColor Green
Write-Host "      Only System Admin configures Webhook URL in System Console" -ForegroundColor Green
