param(
    [Parameter(Mandatory = $true)]
    [string] $InputPath,
    [Parameter(Mandatory = $true)]
    [string] $OutputPath
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$source = [System.Drawing.Bitmap]::FromFile($InputPath)
$working = New-Object System.Drawing.Bitmap(
    $source.Width,
    $source.Height,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$graphics = [System.Drawing.Graphics]::FromImage($working)
$graphics.DrawImageUnscaled($source, 0, 0)
$graphics.Dispose()
$source.Dispose()

$rectangle = New-Object System.Drawing.Rectangle(0, 0, $working.Width, $working.Height)
$data = $working.LockBits(
    $rectangle,
    [System.Drawing.Imaging.ImageLockMode]::ReadWrite,
    [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
)
$byteCount = [Math]::Abs($data.Stride) * $data.Height
$pixels = New-Object byte[] $byteCount
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $pixels, 0, $byteCount)

for ($y = 0; $y -lt $data.Height; $y++) {
    $row = $y * [Math]::Abs($data.Stride)
    for ($x = 0; $x -lt $data.Width; $x++) {
        $offset = $row + ($x * 4)
        $blue = [int] $pixels[$offset]
        $green = [int] $pixels[$offset + 1]
        $red = [int] $pixels[$offset + 2]
        $alpha = [int] $pixels[$offset + 3]
        $nonGreen = [Math]::Max($red, $blue)
        $excess = $green - $nonGreen

        if ($excess -gt 12) {
            $opacity = 1.0 - (($excess - 12.0) / 170.0)
            $opacity = [Math]::Max(0.0, [Math]::Min(1.0, $opacity))
            $pixels[$offset + 3] = [byte] [Math]::Round($alpha * $opacity)
            $pixels[$offset + 1] = [byte] [Math]::Min($green, $nonGreen + 10)

            if ($pixels[$offset + 3] -eq 0) {
                $pixels[$offset] = 0
                $pixels[$offset + 1] = 0
                $pixels[$offset + 2] = 0
            }
        }
    }
}

[System.Runtime.InteropServices.Marshal]::Copy($pixels, 0, $data.Scan0, $byteCount)
$working.UnlockBits($data)
$outputDirectory = Split-Path -Parent $OutputPath
if ($outputDirectory) {
    [System.IO.Directory]::CreateDirectory($outputDirectory) | Out-Null
}
$working.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
$working.Dispose()
