import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type {
  ComputerAppRecord,
  ComputerSnapshotNodeRecord,
  ComputerSnapshotRecord,
  ComputerUseActionInput,
  ComputerUseActionResultRecord,
  ComputerUseCapability,
  ComputerUseDiagnosisKind,
  ComputerUseRectRecord,
  ComputerWindowRecord,
} from "../../shared/types";
import { redactComputerText } from "./safety";
import type { ComputerUseBackend, ComputerUseCapabilitiesRecord } from "./types";

const BACKEND_ID = "privora_windows_native" as const;
const DEFAULT_TIMEOUT_MS = 12_000;

interface PowerShellActionResult {
  ok?: boolean;
  message?: string;
  diagnosis?: string;
  capability?: ComputerUseCapability;
  window?: RawWindowRecord;
  path?: string;
  candidates?: RawAppRecord[];
}

interface RawAppRecord {
  id?: unknown;
  name?: unknown;
  source?: unknown;
  executablePath?: unknown;
  shortcutPath?: unknown;
  arguments?: unknown;
  installLocation?: unknown;
  score?: unknown;
}

interface RawWindowRecord {
  id?: unknown;
  title?: unknown;
  processName?: unknown;
  processId?: unknown;
  executablePath?: unknown;
  bounds?: Partial<ComputerUseRectRecord>;
  focused?: unknown;
  elevated?: unknown;
  capabilities?: unknown;
}

export class WindowsNativeComputerUseBackend implements ComputerUseBackend {
  readonly id = BACKEND_ID;
  private refCache = new Map<string, ComputerSnapshotNodeRecord>();

  async capabilities(): Promise<ComputerUseCapabilitiesRecord> {
    const available = process.platform === "win32";
    return {
      backend: BACKEND_ID,
      available,
      platform: process.platform,
      capabilities: available ? ["uia_direct", "send_input_foreground", "window_message"] : [],
      limitations: available ? [
        "Uses UI Automation where available, with foreground SendInput fallback for controls that do not expose patterns.",
        "Does not claim universal background control in v1.",
        "UAC secure desktop, lock screen, hidden credentials, elevated/system boundaries, and irreversible real-world actions remain hard-blocked.",
      ] : ["Windows-native Computer Use is only available on Windows in v1."],
      diagnostics: available ? ["powershell.exe", "UIAutomationClient", "user32.dll"] : [`platform=${process.platform}`],
    };
  }

  async listWindows(signal?: AbortSignal): Promise<ComputerWindowRecord[]> {
    ensureWindows();
    const raw = await runPowerShellJson<RawWindowRecord[]>(`
${win32TypeDefinition()}
$foreground = [PrivoraWin32]::GetForegroundWindow()
$windows = Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | ForEach-Object {
  [PrivoraRect]$rect = New-Object PrivoraRect
  [PrivoraWin32]::GetWindowRect($_.MainWindowHandle, [ref]$rect) | Out-Null
  $path = ""
  try { $path = $_.MainModule.FileName } catch { $path = "" }
  [ordered]@{
    id = [string]$_.MainWindowHandle
    title = [string]$_.MainWindowTitle
    processName = [string]$_.ProcessName
    processId = [int]$_.Id
    executablePath = $path
    focused = ($_.MainWindowHandle -eq $foreground)
    elevated = $false
    bounds = [ordered]@{
      x = [int]$rect.Left
      y = [int]$rect.Top
      width = [Math]::Max(0, [int]($rect.Right - $rect.Left))
      height = [Math]::Max(0, [int]($rect.Bottom - $rect.Top))
    }
    capabilities = @("uia_direct", "send_input_foreground")
  }
}
@($windows) | ConvertTo-Json -Depth 6
`, signal);
    return (Array.isArray(raw) ? raw : []).map(normalizeWindow).filter(Boolean) as ComputerWindowRecord[];
  }

  async focusWindow(windowId: string, signal?: AbortSignal): Promise<ComputerUseActionResultRecord> {
    ensureWindows();
    const startedAt = Date.now();
    const result = await runPowerShellJson<PowerShellActionResult>(`
${win32TypeDefinition()}
$hwnd = [IntPtr]${Number(windowId) || 0}
if ($hwnd -eq [IntPtr]::Zero) {
  [ordered]@{ ok = $false; message = "Window id is invalid."; diagnosis = "stale_target"; capability = "send_input_foreground" } | ConvertTo-Json -Depth 4
  exit
}
${foregroundFocusHelpers()}
$ok = PrivoraForceForeground $hwnd
[ordered]@{ ok = [bool]$ok; message = $(if ($ok) { "Focused window." } else { "Windows refused foreground focus." }); diagnosis = $(if ($ok) { "ok" } else { "blocked_by_uipi" }); capability = "send_input_foreground" } | ConvertTo-Json -Depth 4
`, signal);
    return actionResult("focus", result, startedAt);
  }

  async findApps(input: { query?: string; limit?: number }, signal?: AbortSignal): Promise<ComputerAppRecord[]> {
    ensureWindows();
    const originalQuery = String(input.query || "");
    const fastStartMenuApps = findStartMenuApps(originalQuery, Math.max(1, Math.min(30, Number(input.limit) || 10)));
    const query = escapePowerShellString(originalQuery);
    const limit = Math.max(1, Math.min(30, Number(input.limit) || 10));
    const raw = await runPowerShellJson<RawAppRecord[]>(`
$query = '${query}'.Trim()
$limit = ${limit}
$tokens = @($query.ToLowerInvariant().Split(" ", [System.StringSplitOptions]::RemoveEmptyEntries))
$genericTokens = @("app", "apps", "desktop", "ide", "editor", "browser", "studio", "tool")
$searchTokens = @($tokens | Where-Object { $_.Length -ge 3 -and ($genericTokens -notcontains $_) })
if ($searchTokens.Count -eq 0) { $searchTokens = @($tokens | Where-Object { $_.Length -ge 3 }) }
$items = New-Object System.Collections.Generic.List[object]
function Score-App($name, $path) {
  $haystack = (($name + " " + $path).ToLowerInvariant())
  $nameLower = ([string]$name).ToLowerInvariant()
  if (-not $query) { return 10 }
  $score = 0
  if ($haystack -eq $query.ToLowerInvariant()) { $score += 100 }
  if ($haystack.Contains($query.ToLowerInvariant())) { $score += 60 }
  foreach ($token in $searchTokens) {
    if ($nameLower -eq $token) { $score += 70 }
    elseif ($nameLower.Contains($token)) { $score += 35 }
    elseif ($haystack.Contains($token)) { $score += 20 }
  }
  if ($haystack -match "\\buninstall\\b|remove\\s+.+") { $score -= 80 }
  if ($haystack -match "\\bupdater\\b|\\bpending\\b|\\binstaller\\b|setup\\.exe") { $score -= 35 }
  if ($nameLower -match "^(elevate|crashpad_handler|squirrel|update|installer|setup)$") { $score -= 60 }
  return $score
}
function Add-App($name, $source, $exe, $shortcut, $arguments, $installLocation) {
  $display = ([string]$name).Trim()
  $target = ([string]$exe).Trim()
  $link = ([string]$shortcut).Trim()
  if (-not $display -and $target) { $display = [System.IO.Path]::GetFileNameWithoutExtension($target) }
  if (-not $display) { return }
  $score = Score-App $display ($target + " " + $link + " " + $installLocation)
  if ($query -and $score -le 0) { return }
  $items.Add([ordered]@{
    id = (($source + ":" + $display + ":" + $target + ":" + $link).ToLowerInvariant())
    name = $display
    source = $source
    executablePath = $target
    shortcutPath = $link
    arguments = ([string]$arguments)
    installLocation = ([string]$installLocation)
    score = $score
  }) | Out-Null
}
$shell = $null
try { $shell = New-Object -ComObject WScript.Shell } catch {}
$shortcutRoots = @(
  [Environment]::GetFolderPath("StartMenu"),
  [Environment]::GetFolderPath("CommonStartMenu"),
  (Join-Path $env:APPDATA "Microsoft\\Windows\\Start Menu\\Programs"),
  (Join-Path $env:ProgramData "Microsoft\\Windows\\Start Menu\\Programs")
) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
foreach ($root in $shortcutRoots) {
  Get-ChildItem -LiteralPath $root -Recurse -File -Include *.lnk,*.appref-ms -ErrorAction SilentlyContinue | Select-Object -First 1200 | ForEach-Object {
    $name = $_.BaseName
    $target = ""
    $args = ""
    if ($shell -and $_.Extension -ieq ".lnk") {
      try {
        $shortcut = $shell.CreateShortcut($_.FullName)
        $target = [string]$shortcut.TargetPath
        $args = [string]$shortcut.Arguments
      } catch {}
    }
    Add-App $name "start_menu" $target $_.FullName $args ""
  }
}
$appPathRoots = @(
  "Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
  "Registry::HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\App Paths",
  "Registry::HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\App Paths"
)
foreach ($root in $appPathRoots) {
  if (Test-Path $root) {
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
      $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      Add-App $_.PSChildName "app_paths" ([string]$props.'(default)') "" "" ([string]$props.Path)
    }
  }
}
$uninstallRoots = @(
  "Registry::HKEY_CURRENT_USER\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "Registry::HKEY_LOCAL_MACHINE\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
  "Registry::HKEY_LOCAL_MACHINE\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall"
)
foreach ($root in $uninstallRoots) {
  if (Test-Path $root) {
    Get-ChildItem $root -ErrorAction SilentlyContinue | ForEach-Object {
      $props = Get-ItemProperty $_.PSPath -ErrorAction SilentlyContinue
      if ($props.DisplayName) {
        $icon = [string]$props.DisplayIcon
        $exe = ""
        if ($icon -match '^"([^"]+\\.exe)"') { $exe = $Matches[1] }
        elseif ($icon -match '^([^,]+\\.exe)') { $exe = $Matches[1] }
        Add-App ([string]$props.DisplayName) "registry" $exe "" "" ([string]$props.InstallLocation)
      }
    }
  }
}
if ($query) {
  foreach ($name in @($query, ($query -replace "\\s+", ""), ($query + ".exe"))) {
    try {
      Get-Command $name -ErrorAction Stop | Select-Object -First 5 | ForEach-Object {
        Add-App $_.Name "path" ([string]$_.Source) "" "" ""
      }
    } catch {}
  }
  $likelyRoots = @(
    (Join-Path $env:LOCALAPPDATA "Programs"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\\WindowsApps"),
    [Environment]::GetFolderPath("ProgramFiles"),
    [Environment]::GetFolderPath("ProgramFilesX86")
  ) | Where-Object { $_ -and (Test-Path $_) } | Select-Object -Unique
  foreach ($root in $likelyRoots) {
    foreach ($token in $searchTokens) {
      $matchingDirs = @()
      try {
        $matchingDirs = @(Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name.ToLowerInvariant().Contains($token) } | Select-Object -First 12)
      } catch {}
      foreach ($dir in $matchingDirs) {
        Get-ChildItem -LiteralPath $dir.FullName -Recurse -File -Filter "*.exe" -ErrorAction SilentlyContinue |
          Where-Object { $_.BaseName.ToLowerInvariant().Contains($token) -or $_.DirectoryName.ToLowerInvariant().Contains($token) } |
          Select-Object -First 30 |
          ForEach-Object {
            Add-App $_.BaseName "common_folder" $_.FullName "" "" $_.DirectoryName
          }
      }
    }
  }
}
$deduped = $items |
  Sort-Object @{ Expression = "score"; Descending = $true }, @{ Expression = "name"; Ascending = $true } |
  Group-Object id |
  ForEach-Object { $_.Group | Select-Object -First 1 } |
  Sort-Object @{ Expression = "score"; Descending = $true }, @{ Expression = "name"; Ascending = $true } |
  Select-Object -First $limit
@($deduped) | ConvertTo-Json -Depth 5
`, signal, 8_000).catch(() => []);
    return dedupeApps([
      ...fastStartMenuApps,
      ...(Array.isArray(raw) ? raw : []).map(normalizeApp).filter(Boolean) as ComputerAppRecord[],
    ]).slice(0, limit);
  }

  async snapshot(input: { windowId?: string; depth?: number; includeBoxes?: boolean }, signal?: AbortSignal): Promise<ComputerSnapshotRecord> {
    ensureWindows();
    const depth = Math.max(1, Math.min(5, Number(input.depth) || 3));
    const windowId = input.windowId ? String(input.windowId) : "";
    const raw = await runPowerShellJson<{
      window?: RawWindowRecord;
      nodes?: ComputerSnapshotNodeRecord[];
      text?: string;
      diagnosis?: string;
      message?: string;
    }>(`
${win32TypeDefinition()}
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
$hwnd = [IntPtr]${Number(windowId) || 0}
if ($hwnd -eq [IntPtr]::Zero) { $hwnd = [PrivoraWin32]::GetForegroundWindow() }
if ($hwnd -eq [IntPtr]::Zero) {
  [ordered]@{ nodes = @(); text = ""; diagnosis = "element_missing"; message = "No foreground window is available." } | ConvertTo-Json -Depth 8
  exit
}
$proc = Get-Process | Where-Object { $_.MainWindowHandle -eq $hwnd } | Select-Object -First 1
[PrivoraRect]$winRect = New-Object PrivoraRect
[PrivoraWin32]::GetWindowRect($hwnd, [ref]$winRect) | Out-Null
function SafeInt($value, [int]$fallback = 0) {
  try {
    $number = [double]$value
    if ([double]::IsNaN($number) -or [double]::IsInfinity($number)) { return $fallback }
    if ($number -gt [int]::MaxValue) { return [int]::MaxValue }
    if ($number -lt [int]::MinValue) { return [int]::MinValue }
    return [int][Math]::Round($number)
  } catch {
    return $fallback
  }
}
function SafeString($value) {
  try {
    if ($null -eq $value) { return "" }
    return [string]$value
  } catch {
    return ""
  }
}
function SafeBool($value, [bool]$fallback = $false) {
  try {
    if ($null -eq $value) { return $fallback }
    return [bool]$value
  } catch {
    return $fallback
  }
}
function BoundsFromRect($rect) {
  $x = SafeInt $rect.X
  $y = SafeInt $rect.Y
  $width = [Math]::Max(0, (SafeInt $rect.Width))
  $height = [Math]::Max(0, (SafeInt $rect.Height))
  return [ordered]@{ x = $x; y = $y; width = $width; height = $height }
}
function BoundsFromWinRect($rect) {
  $left = SafeInt $rect.Left
  $top = SafeInt $rect.Top
  $right = SafeInt $rect.Right
  $bottom = SafeInt $rect.Bottom
  return [ordered]@{ x = $left; y = $top; width = [Math]::Max(0, $right - $left); height = [Math]::Max(0, $bottom - $top) }
}
$window = [ordered]@{
  id = [string]$hwnd
  title = $(if ($proc) { SafeString $proc.MainWindowTitle } else { "" })
  processName = $(if ($proc) { SafeString $proc.ProcessName } else { "" })
  processId = $(if ($proc) { SafeInt $proc.Id } else { 0 })
  executablePath = ""
  focused = $true
  elevated = $false
  bounds = BoundsFromWinRect $winRect
  capabilities = @("uia_direct", "send_input_foreground")
}
try {
  $root = [System.Windows.Automation.AutomationElement]::FromHandle($hwnd)
  $script:index = 0
  function ElementValue($el, [bool]$sensitive) {
    if ($sensitive) { return "" }
    try {
      $pattern = $null
      if ($el.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$pattern)) {
        return SafeString $pattern.Current.Value
      }
    } catch {}
    try {
      $pattern = $null
      if ($el.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$pattern)) {
        return SafeString ($pattern.DocumentRange.GetText(2000))
      }
    } catch {}
    return ""
  }
  function NodeFromElement($el, $remainingRaw) {
    $remaining = SafeInt $remainingRaw
    $script:index += 1
    try {
      $rect = $el.Current.BoundingRectangle
      $name = SafeString $el.Current.Name
      $role = SafeString $el.Current.ControlType.ProgrammaticName
      if ($role.StartsWith("ControlType.")) { $role = $role.Substring(12) }
      $sensitive = ($role -match "Password")
      $value = ElementValue $el $sensitive
      $node = [ordered]@{
        ref = ("c" + $script:index)
        role = $role
        name = $name
        value = $value
        automationId = SafeString $el.Current.AutomationId
        enabled = SafeBool $el.Current.IsEnabled $true
        focused = SafeBool $el.Current.HasKeyboardFocus $false
        sensitive = $sensitive
        capability = "uia_direct"
        bounds = BoundsFromRect $rect
        children = @()
      }
    } catch {
      return [ordered]@{
        ref = ("c" + $script:index)
        role = "element"
        name = ""
        value = ""
        automationId = ""
        enabled = $true
        focused = $false
        sensitive = $false
        capability = "unsupported_canvas"
        bounds = [ordered]@{ x = 0; y = 0; width = 0; height = 0 }
        children = @()
      }
    }
    if ($remaining -gt 0) {
      try {
        $children = $el.FindAll([System.Windows.Automation.TreeScope]::Children, [System.Windows.Automation.Condition]::TrueCondition)
        foreach ($child in $children) {
          if ($script:index -ge 250) { break }
          try {
            $childNode = NodeFromElement $child ($remaining - 1)
            if ($null -ne $childNode) { $node.children += $childNode }
          } catch {}
        }
      } catch {
        # Some controls expose broken child collections. Keep the parent node.
      }
    }
    return $node
  }
  $nodes = @((NodeFromElement $root ${depth}))
  $lines = New-Object System.Collections.Generic.List[string]
  function CollectText($node) {
    $label = (($node.role + " " + $node.name + " " + $node.value).Trim())
    if ($label) { $lines.Add($label) | Out-Null }
    foreach ($child in $node.children) { CollectText $child }
  }
  foreach ($node in $nodes) { CollectText $node }
  [ordered]@{ window = $window; nodes = $nodes; text = ($lines -join [Environment]::NewLine) } | ConvertTo-Json -Depth 18
} catch {
  [ordered]@{ window = $window; nodes = @(); text = ""; diagnosis = "unsupported_surface"; message = $_.Exception.Message } | ConvertTo-Json -Depth 8
}
`, signal);

    const window = raw.window ? normalizeWindow(raw.window) || undefined : undefined;
    const nodes = normalizeNodes(raw.nodes || []);
    this.refCache.clear();
    flattenNodes(nodes).forEach((node) => this.refCache.set(node.ref, node));
    return {
      backend: BACKEND_ID,
      mode: nodes.length > 0 ? "uia" : "summary",
      window,
      nodes,
      text: redactComputerText(String(raw.text || compactNodes(nodes))),
      diagnosis: raw.diagnosis ? { kind: raw.diagnosis as ComputerUseDiagnosisKind, message: String(raw.message || raw.diagnosis) } : undefined,
      createdAt: Date.now(),
    };
  }

  async act(input: ComputerUseActionInput, signal?: AbortSignal): Promise<ComputerUseActionResultRecord> {
    ensureWindows();
    const startedAt = Date.now();
    const action = String(input.action || "").toLowerCase();
    const ref = String(input.ref || input.targetRef || "");
    const cached = ref ? this.refCache.get(ref) : undefined;
    const point = resolvePoint(input, cached);
    const key = escapePowerShellString(String(input.key || ""));
    const text = escapePowerShellString(String(input.text ?? input.value ?? ""));
    const clickCount = action === "double_click" ? 2 : 1;
    const targetWindowId = Number(input.windowId) || 0;
    const result = await runPowerShellJson<PowerShellActionResult>(`
${win32TypeDefinition()}
Add-Type -AssemblyName System.Windows.Forms
$targetHwnd = [IntPtr]${targetWindowId}
${foregroundFocusHelpers()}
if ($targetHwnd -ne [IntPtr]::Zero) {
  if (-not (PrivoraForceForeground $targetHwnd)) {
    [ordered]@{
      ok = $false
      message = "Target window is not foreground; refused foreground input to avoid typing into the wrong app."
      diagnosis = "stale_target"
      capability = "send_input_foreground"
    } | ConvertTo-Json -Depth 4
    exit
  }
}
$ok = $true
$message = "Action completed with foreground input fallback."
try {
  if (-not (PrivoraWindowReady $targetHwnd)) {
    $ok = $false
    $message = "Target window lost foreground before input; action was blocked."
    throw $message
  }
  ${point ? `[PrivoraWin32]::SetCursorPos(${point.x}, ${point.y}) | Out-Null` : ""}
  if (-not (PrivoraWindowReady $targetHwnd)) {
    $ok = $false
    $message = "Target window lost foreground after cursor movement; action was blocked."
    throw $message
  }
  ${point && ["click", "double_click", "focus", "invoke", "select", "set_value", "type"].includes(action) ? Array.from({ length: clickCount }).map(() => `
[PrivoraWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 45
[PrivoraWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 55
`).join("\n") : ""}
  ${action === "type" || action === "set_value" ? `
if (-not (PrivoraWindowReady $targetHwnd)) {
  $ok = $false
  $message = "Target window lost foreground before typing; action was blocked."
  throw $message
}
$oldClipboard = ""
try { $oldClipboard = Get-Clipboard -Raw -ErrorAction SilentlyContinue } catch {}
Set-Clipboard -Value '${text}'
[System.Windows.Forms.SendKeys]::SendWait("^v")
Start-Sleep -Milliseconds 120
try { if ($null -ne $oldClipboard) { Set-Clipboard -Value $oldClipboard } } catch {}
` : ""}
  ${action === "press" ? `
if (-not (PrivoraWindowReady $targetHwnd)) {
  $ok = $false
  $message = "Target window lost foreground before key press; action was blocked."
  throw $message
}
[System.Windows.Forms.SendKeys]::SendWait('${sendKeysToken(String(input.key || ""))}')
` : ""}
  ${action === "scroll" ? `
[PrivoraWin32]::mouse_event(0x0800, 0, 0, ${Math.trunc(Number(input.deltaY || input.value || -480))}, [UIntPtr]::Zero)
` : ""}
  ${action === "drag" && point ? `
$endX = ${Math.trunc(Number(input.x || point.x) + Number(input.deltaX || 0))}
$endY = ${Math.trunc(Number(input.y || point.y) + Number(input.deltaY || 0))}
[PrivoraWin32]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)
Start-Sleep -Milliseconds 80
[PrivoraWin32]::SetCursorPos($endX, $endY) | Out-Null
Start-Sleep -Milliseconds 80
[PrivoraWin32]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)
` : ""}
} catch {
  $ok = $false
  if (-not $message -or $message -eq "Action completed with foreground input fallback.") { $message = $_.Exception.Message }
}
[ordered]@{ ok = [bool]$ok; message = $message; diagnosis = $(if ($ok) { "ok" } else { "stale_target" }); capability = "send_input_foreground" } | ConvertTo-Json -Depth 4
`, signal);
    if (!point && ["click", "double_click", "focus", "invoke", "select", "drag"].includes(action)) {
      return {
        backend: BACKEND_ID,
        action,
        success: false,
        finding: `Could not resolve target ${ref || "(none)"} for ${action}.`,
        diagnosis: { kind: "stale_target", message: "No cached UIA ref or coordinates were available for this action." },
        startedAt,
        endedAt: Date.now(),
      };
    }
    return actionResult(action, result, startedAt);
  }

  async screenshot(input: { windowId?: string; x?: number; y?: number; width?: number; height?: number; artifactPath: string }, signal?: AbortSignal): Promise<ComputerUseActionResultRecord> {
    ensureWindows();
    const startedAt = Date.now();
    const artifactPath = escapePowerShellString(path.resolve(input.artifactPath));
    const result = await runPowerShellJson<PowerShellActionResult>(`
${win32TypeDefinition()}
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms
$x = ${Math.max(0, Math.trunc(Number(input.x) || 0))}
$y = ${Math.max(0, Math.trunc(Number(input.y) || 0))}
$width = ${Math.max(1, Math.trunc(Number(input.width) || 0))}
$height = ${Math.max(1, Math.trunc(Number(input.height) || 0))}
if ($width -le 1 -or $height -le 1) {
  if ('${escapePowerShellString(String(input.windowId || ""))}') {
    [PrivoraRect]$rect = New-Object PrivoraRect
    [PrivoraWin32]::GetWindowRect([IntPtr]${Number(input.windowId) || 0}, [ref]$rect) | Out-Null
    $x = [int]$rect.Left; $y = [int]$rect.Top; $width = [Math]::Max(1, [int]($rect.Right - $rect.Left)); $height = [Math]::Max(1, [int]($rect.Bottom - $rect.Top))
  } else {
    $bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
    $width = [int]$bounds.Width; $height = [int]$bounds.Height
  }
}
$bitmap = New-Object System.Drawing.Bitmap($width, $height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($x, $y, 0, 0, $bitmap.Size)
$bitmap.Save('${artifactPath}', [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose(); $bitmap.Dispose()
[ordered]@{ ok = $true; message = "Saved screenshot."; path = '${artifactPath}'; diagnosis = "ok"; capability = "send_input_foreground" } | ConvertTo-Json -Depth 4
`, signal);
    const output = actionResult("screenshot", result, startedAt);
    output.artifactPaths = result.path ? [String(result.path)] : [input.artifactPath];
    return output;
  }

  async openApp(input: { app?: string; path?: string; args?: string[] }, signal?: AbortSignal): Promise<ComputerUseActionResultRecord> {
    ensureWindows();
    const startedAt = Date.now();
    const requested = String(input.path || input.app || "").trim();
    let appOrPath = requested;
    let shortcutPath = "";
    let resolvedApp: ComputerAppRecord | undefined;
    const directTarget = resolveDirectLaunchTarget(requested);
    if (directTarget) {
      appOrPath = directTarget.launchPath;
      shortcutPath = directTarget.shortcutPath || "";
      resolvedApp = directTarget.app;
    } else if (requested && !path.isAbsolute(requested)) {
      const startMenuCandidate = findStartMenuLaunchCandidate(requested);
      if (startMenuCandidate) {
        appOrPath = startMenuCandidate.launchPath;
        shortcutPath = startMenuCandidate.shortcutPath || "";
        resolvedApp = startMenuCandidate.app;
      }
    }
    if (!resolvedApp && requested && !path.isAbsolute(requested)) {
      const candidates = await this.findApps({ query: requested, limit: 5 }, signal).catch(() => []);
      resolvedApp = candidates.find((candidate) => candidate.executablePath || candidate.shortcutPath);
      if (resolvedApp?.shortcutPath && resolvedApp.source === "start_menu") {
        appOrPath = resolvedApp.shortcutPath;
        shortcutPath = resolvedApp.shortcutPath;
      } else if (resolvedApp?.executablePath) {
        appOrPath = resolvedApp.executablePath;
      } else if (resolvedApp?.shortcutPath) {
        appOrPath = resolvedApp.shortcutPath;
        shortcutPath = resolvedApp.shortcutPath;
      }
    }
    const escapedAppOrPath = escapePowerShellString(appOrPath);
    const args = Array.isArray(input.args) ? input.args.map((item) => `'${escapePowerShellString(String(item))}'`).join(",") : "";
    const result = await runPowerShellJson<PowerShellActionResult>(`
$ok = $true
$message = "Started app."
try {
  Start-Process -FilePath '${escapedAppOrPath}' ${args && !shortcutPath ? `-ArgumentList @(${args})` : ""} | Out-Null
} catch {
  $ok = $false
  $message = $_.Exception.Message
}
[ordered]@{ ok = [bool]$ok; message = $message; diagnosis = $(if ($ok) { "ok" } else { "backend_unavailable" }); capability = "send_input_foreground" } | ConvertTo-Json -Depth 4
`, signal);
    const output = actionResult("open_app", result, startedAt);
    if (resolvedApp) {
      output.finding = output.success
        ? `Started ${resolvedApp.name} from ${resolvedApp.source}.`
        : `${output.finding}\nResolved candidate: ${resolvedApp.name} (${resolvedApp.executablePath || resolvedApp.shortcutPath || "no launch path"})`;
    }
    if (!output.success && requested) {
      const candidates = await this.findApps({ query: requested, limit: 5 }, signal).catch(() => []);
      if (candidates.length > 0) {
        output.finding = `${output.finding}\nCandidates:\n${candidates.map((candidate) => `- ${candidate.name} [${candidate.source}] ${candidate.executablePath || candidate.shortcutPath || candidate.installLocation || ""}`.trim()).join("\n")}`;
      }
    }
    return output;
  }

  stop() {
    this.refCache.clear();
  }
}

const ensureWindows = () => {
  if (process.platform !== "win32") throw new Error("Computer Use v1 is only available on Windows.");
};

const runPowerShellJson = <T>(script: string, signal?: AbortSignal, timeoutMs = DEFAULT_TIMEOUT_MS) =>
  new Promise<T>((resolve, reject) => {
    const encoded = Buffer.from(script, "utf16le").toString("base64");
    const child = spawn("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded], {
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Computer Use backend timed out."));
    }, timeoutMs);
    timer.unref?.();
    const abort = () => {
      child.kill();
      reject(new Error("Computer Use action was stopped."));
    };
    signal?.addEventListener("abort", abort, { once: true });
    child.stdout.on("data", (chunk) => { stdout += String(chunk); });
    child.stderr.on("data", (chunk) => { stderr += String(chunk); });
    child.on("error", (error) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      reject(error);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (exitCode !== 0 && !stdout.trim()) {
        reject(new Error(stderr.trim() || `PowerShell exited with code ${exitCode}.`));
        return;
      }
      try {
        resolve(JSON.parse(stdout.trim()) as T);
      } catch (error) {
        reject(new Error(`Could not parse Computer Use backend output: ${error instanceof Error ? error.message : String(error)} ${stderr.trim()}`.trim()));
      }
    });
  });

const win32TypeDefinition = () => `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public struct PrivoraRect { public int Left; public int Top; public int Right; public int Bottom; }
public class PrivoraWin32 {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool BringWindowToTop(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetActiveWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SetFocus(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);
  [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
  [DllImport("user32.dll")] public static extern bool AttachThreadInput(uint idAttach, uint idAttachTo, bool fAttach);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr hWnd, out PrivoraRect lpRect);
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(int dwFlags, int dx, int dy, int dwData, UIntPtr dwExtraInfo);
}
'@
`;

const foregroundFocusHelpers = () => `
function PrivoraWindowReady($hwnd) {
  if ($hwnd -eq [IntPtr]::Zero) { return $true }
  return ([PrivoraWin32]::GetForegroundWindow() -eq $hwnd)
}
function PrivoraForceForeground($hwnd) {
  if ($hwnd -eq [IntPtr]::Zero) { return $false }
  if (PrivoraWindowReady $hwnd) { return $true }
  [PrivoraWin32]::ShowWindowAsync($hwnd, 9) | Out-Null
  [PrivoraWin32]::BringWindowToTop($hwnd) | Out-Null
  [PrivoraWin32]::SetForegroundWindow($hwnd) | Out-Null
  Start-Sleep -Milliseconds 100
  if (PrivoraWindowReady $hwnd) { return $true }
  $foreground = [PrivoraWin32]::GetForegroundWindow()
  [uint32]$targetPid = 0
  [uint32]$foregroundPid = 0
  $targetThread = [PrivoraWin32]::GetWindowThreadProcessId($hwnd, [ref]$targetPid)
  $foregroundThread = 0
  if ($foreground -ne [IntPtr]::Zero) {
    $foregroundThread = [PrivoraWin32]::GetWindowThreadProcessId($foreground, [ref]$foregroundPid)
  }
  $currentThread = [PrivoraWin32]::GetCurrentThreadId()
  $attached = New-Object System.Collections.Generic.List[uint32]
  foreach ($thread in @($targetThread, $foregroundThread) | Select-Object -Unique) {
    if ($thread -ne 0 -and $thread -ne $currentThread) {
      if ([PrivoraWin32]::AttachThreadInput($currentThread, $thread, $true)) {
        $attached.Add([uint32]$thread) | Out-Null
      }
    }
  }
  try {
    [PrivoraWin32]::ShowWindowAsync($hwnd, 9) | Out-Null
    [PrivoraWin32]::BringWindowToTop($hwnd) | Out-Null
    [PrivoraWin32]::SetActiveWindow($hwnd) | Out-Null
    [PrivoraWin32]::SetFocus($hwnd) | Out-Null
    [PrivoraWin32]::SetForegroundWindow($hwnd) | Out-Null
    Start-Sleep -Milliseconds 160
  } finally {
    foreach ($thread in $attached) {
      [PrivoraWin32]::AttachThreadInput($currentThread, $thread, $false) | Out-Null
    }
  }
  return (PrivoraWindowReady $hwnd)
}
`;

const normalizeWindow = (raw: RawWindowRecord): ComputerWindowRecord | null => {
  const id = String(raw.id || "");
  if (!id) return null;
  const capabilities = Array.isArray(raw.capabilities)
    ? raw.capabilities.map((item) => String(item)).filter(isComputerCapability)
    : ["send_input_foreground" as const];
  return {
    id,
    title: redactComputerText(String(raw.title || ""), 500),
    processName: String(raw.processName || ""),
    processId: Number(raw.processId) || 0,
    executablePath: typeof raw.executablePath === "string" && raw.executablePath ? raw.executablePath : undefined,
    bounds: normalizeRect(raw.bounds),
    focused: raw.focused === true,
    elevated: raw.elevated === true,
    capabilities,
    updatedAt: Date.now(),
  };
};

const normalizeApp = (raw: RawAppRecord): ComputerAppRecord | null => {
  const name = redactComputerText(String(raw.name || ""), 300);
  if (!name) return null;
  const source = String(raw.source || "");
  const normalizedSource = ["start_menu", "app_paths", "registry", "path", "common_folder"].includes(source)
    ? source as ComputerAppRecord["source"]
    : "registry";
  const executablePath = typeof raw.executablePath === "string" && raw.executablePath.trim() ? raw.executablePath.trim() : undefined;
  const shortcutPath = typeof raw.shortcutPath === "string" && raw.shortcutPath.trim() ? raw.shortcutPath.trim() : undefined;
  const installLocation = typeof raw.installLocation === "string" && raw.installLocation.trim() ? raw.installLocation.trim() : undefined;
  return {
    id: String(raw.id || `${normalizedSource}:${name}:${executablePath || shortcutPath || installLocation || ""}`),
    name,
    source: normalizedSource,
    executablePath,
    shortcutPath,
    arguments: typeof raw.arguments === "string" && raw.arguments.trim() ? raw.arguments.trim() : undefined,
    installLocation,
    score: Number(raw.score) || 0,
  };
};

const resolveDirectLaunchTarget = (requested: string): { launchPath: string; shortcutPath?: string; app: ComputerAppRecord } | null => {
  if (!requested || !path.isAbsolute(requested)) return null;
  if (!fs.existsSync(requested)) return null;
  const stats = fs.statSync(requested);
  const candidate = stats.isDirectory()
    ? findLaunchableFileInDirectory(requested, path.basename(requested))
    : requested;
  if (!candidate) return null;
  return launchCandidateFromPath(candidate, "common_folder");
};

const findStartMenuLaunchCandidate = (query: string): { launchPath: string; shortcutPath?: string; app: ComputerAppRecord } | null => {
  const candidates = findStartMenuApps(query, 20)
    .map((app) => ({
      launchPath: app.shortcutPath || app.executablePath || "",
      shortcutPath: app.shortcutPath,
      app,
    }))
    .filter((item) => item.launchPath);
  return candidates[0] || null;
};

const findStartMenuApps = (query: string, limit: number) =>
  findStartMenuFiles(query, Math.max(1, limit))
    .map((filePath) => launchCandidateFromPath(filePath, "start_menu").app)
    .sort((first, second) => second.score - first.score);

const findLaunchableFileInDirectory = (directory: string, query: string) => {
  const tokens = meaningfulAppTokens(query);
  const files = walkFilesBounded(directory, { maxFiles: 120, maxDepth: 4 })
    .filter((filePath) => [".lnk", ".appref-ms", ".exe"].includes(path.extname(filePath).toLowerCase()));
  return files
    .map((filePath) => ({ filePath, score: scoreAppCandidate(path.basename(filePath, path.extname(filePath)), filePath, tokens) }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)[0]?.filePath || files[0];
};

const findStartMenuFiles = (query: string, limit: number) => {
  const roots = startMenuRoots();
  const tokens = meaningfulAppTokens(query);
  const files = roots.flatMap((root) => walkFilesBounded(root, { maxFiles: 1800, maxDepth: 8 }))
    .filter((filePath) => [".lnk", ".appref-ms"].includes(path.extname(filePath).toLowerCase()));
  return files
    .map((filePath) => ({
      filePath,
      score: scoreAppCandidate(path.basename(filePath, path.extname(filePath)), filePath, tokens),
    }))
    .filter((item) => item.score > 0)
    .sort((first, second) => second.score - first.score)
    .slice(0, limit)
    .map((item) => item.filePath);
};

const launchCandidateFromPath = (filePath: string, source: ComputerAppRecord["source"]) => {
  const extension = path.extname(filePath).toLowerCase();
  const app: ComputerAppRecord = {
    id: `${source}:${filePath}`.toLowerCase(),
    name: path.basename(filePath, extension),
    source,
    executablePath: extension === ".exe" ? filePath : undefined,
    shortcutPath: extension === ".lnk" || extension === ".appref-ms" ? filePath : undefined,
    installLocation: path.dirname(filePath),
    score: scoreAppCandidate(path.basename(filePath, extension), filePath, meaningfulAppTokens(path.basename(filePath, extension))),
  };
  return {
    launchPath: filePath,
    shortcutPath: app.shortcutPath,
    app,
  };
};

const dedupeApps = (apps: ComputerAppRecord[]) => {
  const seen = new Set<string>();
  return apps
    .sort((first, second) => second.score - first.score || first.name.localeCompare(second.name))
    .filter((app) => {
      const key = `${app.name}:${app.executablePath || ""}:${app.shortcutPath || ""}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const startMenuRoots = () => [
  path.join(process.env.APPDATA || "", "Microsoft", "Windows", "Start Menu", "Programs"),
  path.join(process.env.ProgramData || "", "Microsoft", "Windows", "Start Menu", "Programs"),
].filter((root, index, roots) => root && fs.existsSync(root) && roots.indexOf(root) === index);

const meaningfulAppTokens = (query: string) => {
  const generic = new Set(["app", "apps", "desktop", "ide", "editor", "browser", "studio", "tool"]);
  const tokens = query.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !generic.has(token));
  return tokens.length > 0 ? tokens : query.toLowerCase().split(/[^a-z0-9]+/).filter((token) => token.length >= 3);
};

const scoreAppCandidate = (name: string, filePath: string, tokens: string[]) => {
  const normalizedName = name.toLowerCase();
  const haystack = `${normalizedName} ${filePath.toLowerCase()}`;
  let score = 0;
  for (const token of tokens) {
    if (normalizedName === token) score += 90;
    else if (normalizedName.includes(token)) score += 55;
    else if (haystack.includes(token)) score += 25;
  }
  if (/\buninstall\b|remove\s+.+/i.test(haystack)) score -= 100;
  if (/\bupdater\b|\bpending\b|\binstaller\b|setup\.exe/i.test(haystack)) score -= 45;
  if (/^(elevate|crashpad_handler|squirrel|update|installer|setup)$/i.test(normalizedName)) score -= 70;
  return score;
};

const walkFilesBounded = (root: string, options: { maxFiles: number; maxDepth: number }) => {
  const output: string[] = [];
  const visit = (directory: string, depth: number) => {
    if (output.length >= options.maxFiles || depth > options.maxDepth) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (output.length >= options.maxFiles) break;
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(fullPath, depth + 1);
      else if (entry.isFile()) output.push(fullPath);
    }
  };
  visit(root, 0);
  return output;
};

const normalizeRect = (value: Partial<ComputerUseRectRecord> | undefined): ComputerUseRectRecord | undefined => {
  if (!value) return undefined;
  const rect = {
    x: Math.trunc(Number(value.x) || 0),
    y: Math.trunc(Number(value.y) || 0),
    width: Math.max(0, Math.trunc(Number(value.width) || 0)),
    height: Math.max(0, Math.trunc(Number(value.height) || 0)),
  };
  return rect.width || rect.height ? rect : undefined;
};

const normalizeNodes = (nodes: ComputerSnapshotNodeRecord[]): ComputerSnapshotNodeRecord[] =>
  (Array.isArray(nodes) ? nodes : []).map((node) => ({
    ref: String(node.ref || ""),
    role: String(node.role || "element"),
    name: redactComputerText(String(node.name || ""), 800),
    value: node.sensitive ? undefined : typeof node.value === "string" ? redactComputerText(node.value, 800) : undefined,
    automationId: typeof node.automationId === "string" ? redactComputerText(node.automationId, 300) : undefined,
    enabled: node.enabled,
    focused: node.focused,
    sensitive: node.sensitive,
    bounds: normalizeRect(node.bounds),
    capability: isComputerCapability(node.capability) ? node.capability : "uia_direct",
    children: normalizeNodes(node.children || []),
  })).filter((node) => node.ref);

const flattenNodes = (nodes: ComputerSnapshotNodeRecord[]): ComputerSnapshotNodeRecord[] =>
  nodes.flatMap((node) => [node, ...flattenNodes(node.children || [])]);

const compactNodes = (nodes: ComputerSnapshotNodeRecord[]) =>
  flattenNodes(nodes)
    .slice(0, 120)
    .map((node) => `${node.ref} ${node.role}${node.name ? ` "${node.name}"` : ""}${node.enabled === false ? " disabled" : ""}`)
    .join("\n");

const resolvePoint = (input: ComputerUseActionInput, cached?: ComputerSnapshotNodeRecord) => {
  const x = Number(input.x);
  const y = Number(input.y);
  if (Number.isFinite(x) && Number.isFinite(y)) return { x: Math.trunc(x), y: Math.trunc(y) };
  const bounds = cached?.bounds;
  if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null;
  return {
    x: Math.trunc(bounds.x + bounds.width / 2),
    y: Math.trunc(bounds.y + bounds.height / 2),
  };
};

const actionResult = (action: string, result: PowerShellActionResult, startedAt: number): ComputerUseActionResultRecord => {
  const success = result.ok === true;
  const message = redactComputerText(String(result.message || (success ? "Action completed." : "Action failed.")), 1_000);
  return {
    backend: BACKEND_ID,
    action,
    success,
    finding: message,
    diagnosis: {
      kind: (result.diagnosis || (success ? "ok" : "unsupported_surface")) as ComputerUseDiagnosisKind,
      message,
      capability: result.capability,
    },
    window: result.window ? normalizeWindow(result.window) || undefined : undefined,
    startedAt,
    endedAt: Date.now(),
  };
};

const escapePowerShellString = (value: string) =>
  value.replace(/'/g, "''");

const sendKeysToken = (key: string) => {
  const normalized = key.trim().toLowerCase();
  const map: Record<string, string> = {
    enter: "{ENTER}",
    escape: "{ESC}",
    esc: "{ESC}",
    tab: "{TAB}",
    backspace: "{BACKSPACE}",
    delete: "{DELETE}",
    up: "{UP}",
    down: "{DOWN}",
    left: "{LEFT}",
    right: "{RIGHT}",
    home: "{HOME}",
    end: "{END}",
    pageup: "{PGUP}",
    pagedown: "{PGDN}",
    space: " ",
  };
  return escapePowerShellString(map[normalized] || key);
};

const isComputerCapability = (value: unknown): value is ComputerUseCapability =>
  typeof value === "string" && [
    "uia_direct",
    "window_message",
    "send_input_foreground",
    "blocked_by_uipi",
    "elevated",
    "secure_desktop",
    "unsupported_canvas",
  ].includes(value);
