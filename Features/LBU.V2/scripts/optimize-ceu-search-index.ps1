param(
    [string]$Pattern = "assets/js/ceu-*-data.js"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")).ProviderPath

function Normalize-SearchText {
    param([object]$Value)

    if ($null -eq $Value) {
        return ""
    }

    $text = [string]$Value
    if (-not $text) {
        return ""
    }

    $text = $text.Replace(([string][char]0x00C5) + ([string][char]0x2021), "N")
    $text = $text.Replace([string][char]0x0147, "N")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00B1), "n")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x0091), "N")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x2018), "N")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00A1), "a")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00A9), "e")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00AD), "i")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00B3), "o")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00BA), "u")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00A3), "a")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00A4), "a")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00B6), "o")
    $text = $text.Replace(([string][char]0x00C3) + ([string][char]0x00BC), "u")
    $text = $text.Replace(([string][char]0x2013), "-")
    $text = $text.Replace(([string][char]0x2014), "-")
    $text = $text.Replace(([string][char]0x00E2) + ([string][char]0x20AC) + ([string][char]0x201D), "-")
    $text = $text.Replace(([string][char]0x00E2) + ([string][char]0x20AC) + ([string][char]0x201C), "-")
    $text = $text.Replace(([string][char]0x00E2) + ([string][char]0x20AC) + ([string][char]0x02DC), "'")
    $text = $text.Replace(([string][char]0x00E2) + ([string][char]0x20AC) + ([string][char]0x2122), "'")
    $text = $text.Replace(([string][char]0x00E2) + ([string][char]0x20AC) + ([string][char]0x0153), '"')
    $text = $text.Replace(([string][char]0x00E2) + ([string][char]0x20AC) + ([string][char]0xFFFD), '"')
    $text = $text.Replace([string][char]0x00C2, "")

    $normalized = $text.Normalize([Text.NormalizationForm]::FormD)
    $builder = New-Object System.Text.StringBuilder

    foreach ($char in $normalized.ToCharArray()) {
        $category = [Globalization.CharUnicodeInfo]::GetUnicodeCategory($char)
        if ($category -ne [Globalization.UnicodeCategory]::NonSpacingMark) {
            [void]$builder.Append($char)
        }
    }

    return ($builder.ToString().Normalize([Text.NormalizationForm]::FormC) `
        -replace "[^a-zA-Z0-9\s]", " " `
        -replace "\s+", " ").Trim().ToLowerInvariant()
}

function Get-PropertyValue {
    param(
        [object]$Object,
        [string]$Name
    )

    if ($null -eq $Object) {
        return $null
    }

    $property = $Object.PSObject.Properties[$Name]
    if ($null -eq $property) {
        return $null
    }

    return $property.Value
}

function Build-SearchIndex {
    param([object]$Record)

    $nameParts = @(
        Get-PropertyValue -Object $Record -Name "lastName"
        Get-PropertyValue -Object $Record -Name "firstName"
        Get-PropertyValue -Object $Record -Name "middleName"
    ) | Where-Object { $_ }

    $rawParts = @(
        Get-PropertyValue -Object $Record -Name "fullName"
        Get-PropertyValue -Object $Record -Name "displayName"
        ($nameParts -join " ")
        Get-PropertyValue -Object $Record -Name "barangay"
        Get-PropertyValue -Object $Record -Name "role"
        Get-PropertyValue -Object $Record -Name "position"
        Get-PropertyValue -Object $Record -Name "organization"
        Get-PropertyValue -Object $Record -Name "representative"
        Get-PropertyValue -Object $Record -Name "sector"
        Get-PropertyValue -Object $Record -Name "place"
        Get-PropertyValue -Object $Record -Name "location"
        Get-PropertyValue -Object $Record -Name "hotline"
        Get-PropertyValue -Object $Record -Name "aorPurok"
        Get-PropertyValue -Object $Record -Name "houseStreet"
        Get-PropertyValue -Object $Record -Name "houseNumber"
        Get-PropertyValue -Object $Record -Name "purokSitioVillage"
        Get-PropertyValue -Object $Record -Name "purokSitioSubd"
        Get-PropertyValue -Object $Record -Name "organizationPurok"
        Get-PropertyValue -Object $Record -Name "officeAddress"
        Get-PropertyValue -Object $Record -Name "contactNumber"
        Get-PropertyValue -Object $Record -Name "contact"
        Get-PropertyValue -Object $Record -Name "emailAddress"
        Get-PropertyValue -Object $Record -Name "email"
        Get-PropertyValue -Object $Record -Name "birthdate"
    )

    $parts = New-Object System.Collections.Generic.List[string]
    $seen = New-Object System.Collections.Generic.HashSet[string] ([StringComparer]::Ordinal)

    foreach ($part in $rawParts) {
        $normalized = Normalize-SearchText $part
        if (-not $normalized) {
            continue
        }

        if ($seen.Add($normalized)) {
            [void]$parts.Add($normalized)
        }
    }

    if ($parts.Count -eq 0) {
        $fallback = Normalize-SearchText (Get-PropertyValue -Object $Record -Name "searchText")
        return $fallback
    }

    return ($parts -join " ").Trim()
}

function Convert-Record {
    param([object]$Record)

    $output = [ordered]@{}

    foreach ($property in $Record.PSObject.Properties) {
        if ($property.Name -eq "searchText" -or $property.Name -eq "searchIndex") {
            continue
        }

        $output[$property.Name] = $property.Value
    }

    $output["searchIndex"] = Build-SearchIndex -Record $Record

    return [pscustomobject]$output
}

$targetPattern = Join-Path $projectRoot $Pattern
$files = Get-ChildItem -Path $targetPattern -File | Sort-Object Name

if (-not $files) {
    throw "No CEU data files found for pattern: $Pattern"
}

$results = foreach ($file in $files) {
    $raw = Get-Content -LiteralPath $file.FullName -Raw
    $match = [regex]::Match(
        $raw,
        "^\s*window\.(?<global>[A-Za-z0-9_]+)\s*=\s*(?<json>\{.*\})\s*;\s*$",
        [Text.RegularExpressions.RegexOptions]::Singleline
    )

    if (-not $match.Success) {
        throw "Unsupported CEU file format: $($file.FullName)"
    }

    $globalName = $match.Groups["global"].Value
    $payload = $match.Groups["json"].Value | ConvertFrom-Json
    $recordCount = @($payload.records).Count

    $optimizedRecords = @($payload.records | ForEach-Object {
        Convert-Record -Record $_
    })

    $meta = [ordered]@{}
    foreach ($property in $payload.meta.PSObject.Properties) {
        $meta[$property.Name] = $property.Value
    }
    $meta["searchIndexVersion"] = 1

    $optimizedPayload = [ordered]@{
        meta = [pscustomobject]$meta
        records = $optimizedRecords
    }

    $json = $optimizedPayload | ConvertTo-Json -Compress -Depth 8
    $updated = "window.$globalName = $json;"
    [System.IO.File]::WriteAllText($file.FullName, $updated, [System.Text.Encoding]::UTF8)

    [pscustomobject]@{
        Name = $file.Name
        Records = $recordCount
        OldKB = [math]::Round($raw.Length / 1KB, 1)
        NewKB = [math]::Round($updated.Length / 1KB, 1)
        SavedKB = [math]::Round(($raw.Length - $updated.Length) / 1KB, 1)
    }
}

$results | Format-Table -AutoSize
