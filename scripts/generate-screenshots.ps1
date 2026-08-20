# dsh-conversation-toc — 生成 README 用示意图（占位截图）
# Generates the mockup screenshots used by the README (docs/assets/*.png).
# Windows only (System.Drawing). Run:  powershell -File scripts/generate-screenshots.ps1
$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

$outDir = Join-Path $PSScriptRoot "..\docs\assets"
New-Item -ItemType Directory -Force -Path $outDir | Out-Null

function New-RoundedRect($x, $y, $w, $h, $r) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $d = $r * 2
  $path.AddArc($x, $y, $d, $d, 180, 90)
  $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
  $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
  $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
  $path.CloseFigure()
  return ,$path
}

function New-Pen([string]$hex, [float]$w = 1) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return New-Object System.Drawing.Pen($c, $w)
}
function New-Solid([string]$hex) {
  $c = [System.Drawing.ColorTranslator]::FromHtml($hex)
  return New-Object System.Drawing.SolidBrush($c)
}
function New-Font([string]$name, [float]$size, [int]$style = 0) {
  return New-Object System.Drawing.Font($name, $size, $style, [System.Drawing.GraphicsUnit]::Pixel)
}

$yahei = "Microsoft YaHei"
$seg = "Segoe UI"

# ── 1) 展开面板 toc-panel.png ─────────────────────────────────────────────
$W = 300; $H = 332
$bmp = New-Object System.Drawing.Bitmap($W, $H)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g.Clear([System.Drawing.ColorTranslator]::FromHtml("#F5F6F8"))

# 卡片
$cardX = 16; $cardY = 14; $cardW = 268; $cardH = 304; $r = 12
$cardPath = New-RoundedRect $cardX $cardY $cardW $cardH $r
$g.FillPath((New-Solid "#FFFFFF"), $cardPath)
$g.DrawPath((New-Pen "#E3E6EB"), $cardPath)

# 头部
$g.DrawString("对话大纲", (New-Font $yahei 13 1), (New-Solid "#1F2329"), 30, 28)
$fmtRight = New-Object System.Drawing.StringFormat
$fmtRight.Alignment = [System.Drawing.StringAlignment]::Far
$fmtRight.LineAlignment = [System.Drawing.StringAlignment]::Center
$g.DrawString("7 个主题", (New-Font $yahei 10), (New-Solid "#9CA3AF"), (New-Object System.Drawing.RectangleF(120, 28, 116, 18)), $fmtRight)
$g.DrawString("×", (New-Font $seg 14), (New-Solid "#9CA3AF"), (New-Object System.Drawing.RectangleF(236, 26, 22, 22)), $fmtRight)
$g.DrawLine((New-Pen "#EEF0F3"), 30, 56, $cardX + $cardW - 30, 56)

# 行
$rows = @(
  @{ level = 0; text = "广义平稳过程自相关函数对称…"; color = "#6B7280"; bar = "#D1D5DB" },
  @{ level = 0; text = "匹配滤波器与维纳滤波器是什…"; color = "#6B7280"; bar = "#D1D5DB" },
  @{ level = 1; text = "两者的设计准则是什么";       color = "#111827"; bar = "#9CA3AF" },
  @{ level = 1; text = "N-P准则的核心思想是什么";     color = "#6B7280"; bar = "#D1D5DB" },
  @{ level = 0; text = "短时傅里叶变换的时频分辨率…"; color = "#6B7280"; bar = "#D1D5DB" },
  @{ level = 0; text = "如何计算白噪声通过线性时不…"; color = "#6B7280"; bar = "#D1D5DB" },
  @{ level = 0; text = "举个简单的例子说明调频信号…"; color = "#5A8CFF"; bar = "#5A8CFF" }
)
$rowY = 66
foreach ($row in $rows) {
  $indent = 22 * $row.level
  $textX = 30 + $indent
  $barX = $cardX + $cardW - 30 - 14
  $barY = $rowY + 7
  # 激活行浅蓝底
  if ($row.color -eq "#5A8CFF") {
    $bgPath = New-RoundedRect ($textX - 8) ($rowY - 1) ($barX - $textX + 22) 22 6
    $g.FillPath((New-Solid "#F0F4FF"), $bgPath)
  }
  $fmt = New-Object System.Drawing.StringFormat
  $fmt.Trimming = [System.Drawing.StringTrimming]::EllipsisCharacter
  $txtRect = New-Object System.Drawing.RectangleF($textX, $rowY, ($barX - $textX - 10), 20)
  $g.DrawString($row.text, (New-Font $yahei 12), (New-Solid $row.color), $txtRect, $fmt)
  # 右侧胶囊指示条
  $barPath = New-RoundedRect $barX $barY 14 3 2
  $g.FillPath((New-Solid $row.bar), $barPath)
  $rowY += 34
}

$bmp.Save((Join-Path $outDir "toc-panel.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose(); $bmp.Dispose()
Write-Output "wrote docs/assets/toc-panel.png"

# ── 2) 折叠胶囊条 toc-rail.png ────────────────────────────────────────────
$W2 = 84; $H2 = 236
$bmp2 = New-Object System.Drawing.Bitmap($W2, $H2)
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g2.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit
$g2.Clear([System.Drawing.ColorTranslator]::FromHtml("#F5F6F8"))

$pillX = 14; $pillY = 16; $pillW = 56; $pillH = 204
$pillPath = New-RoundedRect $pillX $pillY $pillW $pillH 12
$g2.FillPath((New-Solid "#FFFFFF"), $pillPath)
$g2.DrawPath((New-Pen "#E3E6EB"), $pillPath)

$capsuleColors = @("#D1D5DB", "#D1D5DB", "#D1D5DB", "#D1D5DB", "#D1D5DB", "#D1D5DB", "#5A8CFF")
$capX = $pillX + [int](($pillW - 14) / 2)
$capY = $pillY + 22
foreach ($color in $capsuleColors) {
  $capPath = New-RoundedRect $capX $capY 14 4 2
  $g2.FillPath((New-Solid $color), $capPath)
  $capY += 22
}

$bmp2.Save((Join-Path $outDir "toc-rail.png"), [System.Drawing.Imaging.ImageFormat]::Png)
$g2.Dispose(); $bmp2.Dispose()
Write-Output "wrote docs/assets/toc-rail.png"
