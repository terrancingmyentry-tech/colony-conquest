# Copy texture files from your Documents folder into the project's custom textures folder.
# Update source paths if your files are elsewhere.
$dest = "$PSScriptRoot\custom"
New-Item -ItemType Directory -Force -Path $dest | Out-Null

$srcBase = "C:\Users\Rumean Rusher\Documents\Colony Conquest - Custom textures"
Copy-Item -Path (Join-Path $srcBase 'Tile or Grass Tile.png') -Destination (Join-Path $dest 'Tile or Grass Tile.png') -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $srcBase 'Water.png') -Destination (Join-Path $dest 'Water.png') -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $srcBase 'River Water.png') -Destination (Join-Path $dest 'River Water.png') -Force -ErrorAction SilentlyContinue
Copy-Item -Path (Join-Path $srcBase 'Tree or Boulder.png') -Destination (Join-Path $dest 'Tree or Boulder.png') -Force -ErrorAction SilentlyContinue

Write-Host "Textures installed to $dest"