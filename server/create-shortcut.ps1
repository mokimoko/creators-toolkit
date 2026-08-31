param(
    [string]$ShortcutPath = (Join-Path $PSScriptRoot "..\Creator's Toolkit.lnk")
)

$ErrorActionPreference = 'Stop'

$launcherPath = Join-Path $PSScriptRoot 'start-server.bat'
$workingDirectory = $PSScriptRoot
$iconPath = Join-Path $PSScriptRoot 'icon.ico'

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($ShortcutPath)
$shortcut.TargetPath = $launcherPath
$shortcut.WorkingDirectory = $workingDirectory
$shortcut.Description = "Launch Creator's Toolkit"
if (Test-Path -LiteralPath $iconPath) {
    $shortcut.IconLocation = $iconPath
}
$shortcut.Save()

Write-Host "Shortcut ready: $ShortcutPath"
