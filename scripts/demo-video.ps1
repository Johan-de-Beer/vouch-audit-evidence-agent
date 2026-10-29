param(
    [switch]$PrepareOnly,
    [string]$ScreensDirectory = '',
    [string]$OutputDirectory = ''
)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $ScreensDirectory) { $ScreensDirectory = Join-Path $projectRoot 'artifacts\demo-video\screens' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $projectRoot 'artifacts\demo-video' }
$ScreensDirectory = [System.IO.Path]::GetFullPath($ScreensDirectory)
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

# System.Speech is supplied by the installed Windows desktop runtime. No voice is downloaded.
if ($PSVersionTable.PSEdition -ne 'Desktop') {
    $desktopArguments = @('-NoProfile', '-File', $PSCommandPath, '-ScreensDirectory', $ScreensDirectory, '-OutputDirectory', $OutputDirectory)
    if ($PrepareOnly) { $desktopArguments += '-PrepareOnly' }
    & powershell.exe @desktopArguments
    if ($LASTEXITCODE -ne 0) { throw 'Windows desktop narration/video workflow failed.' }
    exit 0
}

$ffmpeg = (Get-Command ffmpeg.exe -ErrorAction Stop).Source
$ffprobe = (Get-Command ffprobe.exe -ErrorAction Stop).Source
$storyboardPath = Join-Path $PSScriptRoot 'demo-video-storyboard.json'
$storyboard = Get-Content -LiteralPath $storyboardPath -Raw | ConvertFrom-Json
$totalSeconds = [int](($storyboard.segments | Measure-Object -Property seconds -Sum).Sum)
if ($totalSeconds -ne 180 -or $storyboard.segments.Count -ne 8) { throw 'The storyboard must contain exactly eight segments totaling 180 seconds.' }
$audioDirectory = Join-Path $OutputDirectory 'audio'
$captionDirectory = Join-Path $OutputDirectory 'caption-text'
New-Item -ItemType Directory -Force -Path $OutputDirectory, $audioDirectory, $captionDirectory | Out-Null
$utf8 = New-Object System.Text.UTF8Encoding($false)
$culture = [System.Globalization.CultureInfo]::InvariantCulture

function Save-Utf8([string]$FilePath, [string]$Text) { [System.IO.File]::WriteAllText($FilePath, $Text, $utf8) }
function Number-Text([double]$Value) { return $Value.ToString('0.######', $culture) }
function File-Hash([string]$FilePath) { return (Get-FileHash -LiteralPath $FilePath -Algorithm SHA256).Hash.ToLowerInvariant() }
function Probe-Media([string]$FilePath) {
    $probeText = & $ffprobe -v error -show_entries 'format=duration:stream=index,codec_type,codec_name,sample_rate,channels,bits_per_sample,width,height,nb_frames,r_frame_rate,duration' -of json $FilePath
    if ($LASTEXITCODE -ne 0) { throw "ffprobe failed for $FilePath" }
    return (($probeText -join "`n") | ConvertFrom-Json)
}
function Run-FFmpeg([string[]]$Arguments) {
    & $ffmpeg @Arguments
    if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed with exit code $LASTEXITCODE" }
}
function Filter-Path([string]$FilePath) {
    if ($FilePath.Contains("'")) { throw 'The ffmpeg text-filter paths cannot contain apostrophes.' }
    return $FilePath.Replace('\', '/').Replace(':', '\:')
}
function Srt-Time([double]$Seconds) {
    $milliseconds = [long][Math]::Round($Seconds * 1000)
    $hours = [int][Math]::Floor($milliseconds / 3600000)
    $minutes = [int][Math]::Floor(($milliseconds % 3600000) / 60000)
    $secondsPart = [int][Math]::Floor(($milliseconds % 60000) / 1000)
    return ('{0:00}:{1:00}:{2:00},{3:000}' -f $hours, $minutes, $secondsPart, ($milliseconds % 1000))
}
function Caption-Chunks([string]$Text) {
    $chunks = New-Object System.Collections.Generic.List[string]
    $chunk = ''
    foreach ($word in ($Text -split '\s+')) {
        $candidate = ($chunk + ' ' + $word).Trim()
        if ($candidate.Length -gt 78 -and $chunk) { $chunks.Add($chunk); $chunk = $word } else { $chunk = $candidate }
    }
    if ($chunk) { $chunks.Add($chunk) }
    return $chunks.ToArray()
}
function Wrap-Caption([string]$Text) {
    $lines = New-Object System.Collections.Generic.List[string]
    $line = ''
    foreach ($word in ($Text -split '\s+')) {
        $candidate = ($line + ' ' + $word).Trim()
        if ($candidate.Length -gt 47 -and $line) { $lines.Add($line); $line = $word } else { $line = $candidate }
    }
    if ($line) { $lines.Add($line) }
    return ($lines.ToArray() -join "`n")
}

Add-Type -AssemblyName System.Speech
$speechSynth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$speechSynth.Rate = 0
$speechSynth.Volume = 100
$voiceName = $speechSynth.Voice.Name
$format = [System.Speech.AudioFormat.SpeechAudioFormatInfo]::new(24000, [System.Speech.AudioFormat.AudioBitsPerSample]::Sixteen, [System.Speech.AudioFormat.AudioChannel]::Mono)
$segments = @()
$captions = @()
$audioConcat = @()
$offset = [double]0
try {
    foreach ($segment in $storyboard.segments) {
        $rawWave = Join-Path $audioDirectory ($segment.id + '-raw.wav')
        $wave = Join-Path $audioDirectory ($segment.id + '.wav')
        $speechSynth.SetOutputToWaveFile($rawWave, $format)
        $speechSynth.Speak([string]$segment.narration)
        $speechSynth.SetOutputToNull()
        $rawProbe = Probe-Media $rawWave
        $rawAudio = @($rawProbe.streams | Where-Object { $_.codec_type -eq 'audio' })[0]
        if ($rawAudio.codec_name -ne 'pcm_s16le' -or [int]$rawAudio.channels -ne 1 -or [int]$rawAudio.sample_rate -ne 24000) { throw 'Narration must be mono 24 kHz PCM16 WAV.' }
        $rawSeconds = [double]::Parse([string]$rawProbe.format.duration, $culture)
        $maximumSpeechSeconds = [double]$segment.seconds - 0.8
        $speed = [Math]::Max(1.0, $rawSeconds / $maximumSpeechSeconds)
        if ($speed -gt 1.35) { throw "Narration in $($segment.id) is too long for a neutral delivery. Shorten the text." }
        $audioFilter = 'atempo=' + (Number-Text $speed) + ',apad,atrim=duration=' + (Number-Text $segment.seconds) + ',asetpts=PTS-STARTPTS'
        Run-FFmpeg -Arguments @('-hide_banner', '-loglevel', 'error', '-y', '-i', $rawWave, '-af', $audioFilter, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', $wave)
        $audioConcat += "file '$($wave.Replace('\', '/'))'"
        $speechSeconds = [Math]::Min($rawSeconds / $speed, $maximumSpeechSeconds)
        $chunks = @(Caption-Chunks ([string]$segment.narration))
        $totalCharacters = [double](($chunks | ForEach-Object { $_.Length } | Measure-Object -Sum).Sum)
        $captionOffset = [double]0
        foreach ($chunk in $chunks) {
            $captionLength = $speechSeconds * $chunk.Length / $totalCharacters
            $wrappedCaption = Wrap-Caption $chunk
            if (@($wrappedCaption -split "`n").Count -gt 2) { throw 'Caption exceeds the two-line footer. Shorten the narration chunk before rendering.' }
            $captions += [pscustomobject]@{ startSeconds = $offset + $captionOffset; endSeconds = $offset + $captionOffset + $captionLength; text = $wrappedCaption }
            $captionOffset += $captionLength
        }
        $segments += [pscustomobject]@{ id = $segment.id; seconds = [int]$segment.seconds; startSeconds = $offset; narration = $segment.narration; voice = $voiceName; sourceWave = $rawWave; sourceWaveSha256 = (File-Hash $rawWave); sourceSpeechSeconds = $rawSeconds; speechSpeedFactor = $speed; paddedWave = $wave; paddedWaveSha256 = (File-Hash $wave); speechSeconds = $speechSeconds }
        $offset += [double]$segment.seconds
    }
} finally { $speechSynth.Dispose() }

# Hold the final disclosure through the actual final frame of this rehearsal.
$captions[-1].text = "Live validation and the hackathon`nsubmission gate are still pending."
$captions[-1].endSeconds = 180
$concatPath = Join-Path $audioDirectory 'concat.txt'
Save-Utf8 $concatPath (($audioConcat -join "`n") + "`n")
$narrationPath = Join-Path $OutputDirectory 'narration.wav'
Run-FFmpeg -Arguments @('-hide_banner', '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', $concatPath, '-ar', '24000', '-ac', '1', '-c:a', 'pcm_s16le', $narrationPath)
$narrationProbe = Probe-Media $narrationPath
if ([Math]::Abs(([double]::Parse([string]$narrationProbe.format.duration, $culture)) - 180) -gt 0.0001) { throw 'Narration WAV must be exactly 180 seconds.' }
$srt = New-Object System.Text.StringBuilder
for ($index = 0; $index -lt $captions.Count; $index++) {
    [void]$srt.AppendLine([string]($index + 1))
    [void]$srt.AppendLine((Srt-Time $captions[$index].startSeconds) + ' --> ' + (Srt-Time $captions[$index].endSeconds))
    [void]$srt.AppendLine($captions[$index].text)
    [void]$srt.AppendLine()
    Save-Utf8 (Join-Path $captionDirectory ('caption-{0:000}.txt' -f $index)) $captions[$index].text
}
$srtPath = Join-Path $OutputDirectory 'captions.srt'
Save-Utf8 $srtPath $srt.ToString()
$titlePath = Join-Path $captionDirectory 'title.txt'
$disclosurePath = Join-Path $captionDirectory 'disclosure.txt'
Save-Utf8 $titlePath ('VOUCH / ' + $storyboard.label)
Save-Utf8 $disclosurePath ([string]$storyboard.disclosure)
$commit = (& git -C $projectRoot rev-parse HEAD 2>$null | Select-Object -First 1)
$version = (& $ffmpeg -version | Select-Object -First 1)
$manifest = [ordered]@{ schemaVersion = 1; status = 'narration-prepared'; purpose = 'Local narrated offline synthetic screenshot rehearsal. Not a live recording or a completed hackathon submission.'; durationSeconds = 180; framesPerSecond = 30; resolution = '1920x1080'; persistentLabel = $storyboard.label; providerCalls = 0; voice = $voiceName; voiceSource = 'Installed Windows default System.Speech voice; no impersonation or downloaded voice'; narrationFormat = 'mono 24000 Hz signed PCM16 WAV'; narrationSha256 = (File-Hash $narrationPath); captionsSha256 = (File-Hash $srtPath); captionTiming = 'Character-weighted alignment to measured local speech duration; final disclosure held to final frame'; gitCommit = $commit; scriptSha256 = (File-Hash $PSCommandPath); storyboardSha256 = (File-Hash $storyboardPath); ffmpegVersion = $version; segments = $segments; screenshots = @() }
$manifestPath = Join-Path $OutputDirectory 'build-manifest.json'
Save-Utf8 $manifestPath ($manifest | ConvertTo-Json -Depth 9)
if ($PrepareOnly) { Write-Output "Prepared exactly180-second monoPCM16 narration and captions in $OutputDirectory. No video rendered."; exit 0 }

$screenshots = @()
foreach ($segment in $storyboard.segments) {
    $imagePath = Join-Path $ScreensDirectory ($segment.id + '.png')
    if (-not (Test-Path -LiteralPath $imagePath -PathType Leaf)) { throw "Real app screenshot missing: $imagePath. Capture it before rendering, or use -PrepareOnly." }
    $screenshots += [pscustomobject]@{ id = $segment.id; path = $imagePath; sha256 = (File-Hash $imagePath); seconds = [int]$segment.seconds; provenance = 'Human/agent-captured real application screenshot; never generated by this workflow' }
}
$fontBold = Join-Path $env:WINDIR 'Fonts\segoeuib.ttf'
$fontRegular = Join-Path $env:WINDIR 'Fonts\segoeui.ttf'
if (-not (Test-Path -LiteralPath $fontBold)) { throw 'Installed Segoe UI fonts are required.' }
$filterParts = @()
$renderArguments = @('-hide_banner', '-loglevel', 'error', '-y')
for ($index = 0; $index -lt $screenshots.Count; $index++) {
    $renderArguments += @('-loop', '1', '-framerate', '30', '-t', [string]$screenshots[$index].seconds, '-i', $screenshots[$index].path)
    $filterParts += ('[{0}:v]scale=1920:864:force_original_aspect_ratio=decrease:flags=lanczos,pad=1920:864:(ow-iw)/2:(oh-ih)/2:color=0x101a16,pad=1920:1080:0:84:color=0x101a16,setsar=1,fps=30,format=yuv420p,setpts=PTS-STARTPTS[v{0}]' -f $index)
}
$renderArguments += @('-i', $narrationPath)
$concatInputs = ((0..7 | ForEach-Object { '[v' + $_ + ']' }) -join '')
$filterParts += ($concatInputs + 'concat=n=8:v=1:a=0[slides]')
$overlay = "[slides]drawtext=fontfile='$(Filter-Path $fontBold)':textfile='$(Filter-Path $titlePath)':x=24:y=15:fontsize=27:fontcolor=white,drawtext=fontfile='$(Filter-Path $fontRegular)':textfile='$(Filter-Path $disclosurePath)':x=24:y=50:fontsize=20:fontcolor=0xc9dccf"
for ($index = 0; $index -lt $captions.Count; $index++) {
    $captionPath = Join-Path $captionDirectory ('caption-{0:000}.txt' -f $index)
    $start = Number-Text $captions[$index].startSeconds
    $end = Number-Text $captions[$index].endSeconds
    $overlay += ",drawtext=fontfile='$(Filter-Path $fontRegular)':textfile='$(Filter-Path $captionPath)':x=(w-text_w)/2:y=970:fontsize=30:fontcolor=white:line_spacing=8:enable='gte(t,$start)*lt(t,$end)'"
}
$filterParts += ($overlay + '[video]')
$outputPath = Join-Path $OutputDirectory 'vouch-offline-rehearsal.mp4'
$renderArguments += @('-filter_complex', ($filterParts -join ';'), '-filter_complex_threads', '2', '-map', '[video]', '-map', '8:a', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '18', '-threads', '2', '-pix_fmt', 'yuv420p', '-r', '30', '-frames:v', '5400', '-c:a', 'aac', '-b:a', '128k', '-ar', '24000', '-ac', '1', '-t', '180', '-movflags', '+faststart', $outputPath)
Run-FFmpeg -Arguments $renderArguments
$videoProbe = Probe-Media $outputPath
$duration = [double]::Parse([string]$videoProbe.format.duration, $culture)
$videoStream = @($videoProbe.streams | Where-Object { $_.codec_type -eq 'video' })[0]
if ([Math]::Abs($duration - 180) -gt 0.0001 -or [int]$videoStream.nb_frames -ne 5400) { throw "Video must be exactly180seconds and5400frames; observed duration=$duration frames=$($videoStream.nb_frames)." }
$manifest.status = 'rendered-local-offline-rehearsal'
$manifest.screenshots = $screenshots
$manifest.output = [ordered]@{ path = $outputPath; sha256 = (File-Hash $outputPath); durationSeconds = $duration; videoFrames = [int]$videoStream.nb_frames; probe = $videoProbe }
Save-Utf8 $manifestPath ($manifest | ConvertTo-Json -Depth 10)
$frameDirectory = Join-Path $OutputDirectory 'frames'
New-Item -ItemType Directory -Force -Path $frameDirectory | Out-Null
foreach ($frame in @(@{name='overview';second=10}, @{name='transposition';second=30}, @{name='integrity';second=125}, @{name='live-gate-pending';second=179.5})) {
    Run-FFmpeg -Arguments @('-hide_banner', '-loglevel', 'error', '-y', '-ss', (Number-Text $frame.second), '-i', $outputPath, '-frames:v', '1', (Join-Path $frameDirectory ($frame.name + '.png')))
}
Write-Output "Rendered local offline rehearsal: $outputPath (exactly180seconds /5400frames)."
