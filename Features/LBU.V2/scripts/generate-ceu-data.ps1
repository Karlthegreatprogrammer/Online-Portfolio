param(
    [string]$InputPath = '',
    [string]$OutputPath = 'assets/js/ceu-data.js'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.IO.Compression.FileSystem

$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).ProviderPath

if (-not $InputPath) {
    $defaultCandidates = @(
        (Join-Path $projectRoot 'data/source-workbooks/FOR OJT.xlsx')
        'C:\Users\roiro\Downloads\FOR OJT.xlsx'
    )

    $InputPath = $defaultCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
    if (-not $InputPath) {
        $InputPath = $defaultCandidates[0]
    }
}

if (-not [System.IO.Path]::IsPathRooted($InputPath)) {
    $InputPath = Join-Path $projectRoot $InputPath
}

if (-not [System.IO.Path]::IsPathRooted($OutputPath)) {
    $OutputPath = Join-Path $projectRoot $OutputPath
}

function Get-ZipXml {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$EntryPath
    )

    $entry = $Archive.GetEntry($EntryPath)
    if (-not $entry) {
        return $null
    }

    $reader = [System.IO.StreamReader]::new($entry.Open())
    try {
        return [xml]$reader.ReadToEnd()
    } finally {
        $reader.Dispose()
    }
}

function Normalize-Text {
    param([object]$Value)

    if ($null -eq $Value) {
        return ''
    }

    $text = [string]$Value
    $text = $text -replace '[\r\n]+', ' '
    $text = $text -replace '\s+', ' '
    return $text.Trim()
}

function Normalize-NumericText {
    param([string]$Value)

    $text = Normalize-Text $Value
    if (-not $text) {
        return ''
    }

    if ($text -match '^[\d]+(\.0+)?$') {
        return ([decimal]$text).ToString('0')
    }

    if ($text -match '^[\d]+(\.\d+)?E[+-]?\d+$') {
        $number = [double]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
        return ('{0:0}' -f $number)
    }

    return $text
}

function Normalize-Contact {
    param([string]$Value)

    $text = Normalize-NumericText $Value
    if (-not $text) {
        return ''
    }

    if ($text -match '^\d{10}$' -and $text.StartsWith('9')) {
        return '0' + $text
    }

    return $text
}

function Normalize-DateishText {
    param([string]$Value)

    $text = Normalize-Text $Value
    if (-not $text) {
        return ''
    }

    if ($text -match '^[\d]+(\.0+)?$') {
        $numeric = [double]::Parse($text, [System.Globalization.CultureInfo]::InvariantCulture)
        if ($numeric -ge 30000 -and $numeric -le 60000) {
            return ([datetime]'1899-12-30').AddDays([math]::Floor($numeric)).ToString('MMM d, yyyy')
        }
        return ([decimal]$text).ToString('0')
    }

    return $text
}

function Convert-NameWord {
    param([string]$Word)

    if (-not $Word) {
        return ''
    }

    if ($Word -notmatch '\p{L}') {
        return $Word
    }

    $match = [regex]::Match($Word, '^([^-\p{L}'']*)(.*?)([^-\p{L}'']*)$')
    $leading = $match.Groups[1].Value
    $core = $match.Groups[2].Value
    $trailing = $match.Groups[3].Value

    if (-not $core) {
        return $Word
    }

    $lower = $core.ToLowerInvariant()

    if ($lower -match '^(jr|sr)$') {
        $label = $lower.Substring(0, 1).ToUpperInvariant() + $lower.Substring(1)
        if (-not $trailing) {
            $trailing = '.'
        }
        return "$leading$label$trailing"
    }

    if ($lower -match '^(ii|iii|iv|v|vi|vii|viii|ix|x)$') {
        return "$leading$($lower.ToUpperInvariant())$trailing"
    }

    if ($core -match '^\p{L}$') {
        return "$leading$($core.ToUpperInvariant())$trailing"
    }

    $segments = $lower -split "([-'])"
    $builder = foreach ($segment in $segments) {
        if ($segment -eq '-' -or $segment -eq "'") {
            $segment
            continue
        }
        if (-not $segment) {
            ''
            continue
        }
        $segment.Substring(0, 1).ToUpperInvariant() + $segment.Substring(1)
    }

    return "$leading$($builder -join '')$trailing"
}

function Normalize-PersonNameText {
    param([string]$Value)

    $text = Normalize-Text $Value
    if (-not $text) {
        return ''
    }

    return (($text -split '\s+') | ForEach-Object { Convert-NameWord $_ }) -join ' '
}

function Build-FullName {
    param(
        [string]$First,
        [string]$Middle,
        [string]$Last
    )

    $parts = @(
        Normalize-PersonNameText $First
        Normalize-PersonNameText $Middle
        Normalize-PersonNameText $Last
    ) | Where-Object { $_ }

    return ($parts -join ' ').Trim()
}

function Join-SummaryParts {
    param([string[]]$Parts)

    return (($Parts | Where-Object { $_ }) -join ' | ').Trim()
}

function Convert-CellValue {
    param(
        [System.Xml.XmlElement]$Cell,
        [string[]]$SharedStrings
    )

    if (-not $Cell) {
        return ''
    }

    $cellType = $Cell.GetAttribute('t')
    $valueNode = $Cell.SelectSingleNode("./*[local-name()='v']")
    $inlineNode = $Cell.SelectSingleNode("./*[local-name()='is']")

    if ($cellType -eq 's' -and $valueNode) {
        $index = [int]$valueNode.InnerText
        if ($index -ge 0 -and $index -lt $SharedStrings.Count) {
            return $SharedStrings[$index]
        }
        return $valueNode.InnerText
    }

    if ($cellType -eq 'inlineStr' -and $inlineNode) {
        $segments = $inlineNode.SelectNodes(".//*[local-name()='t']") | ForEach-Object { $_.InnerText }
        return ($segments -join '')
    }

    if ($valueNode) {
        return $valueNode.InnerText
    }

    return ''
}

function Read-SheetRows {
    param(
        [System.IO.Compression.ZipArchive]$Archive,
        [string]$TargetPath,
        [string[]]$SharedStrings
    )

    $sheetXml = Get-ZipXml -Archive $Archive -EntryPath $TargetPath
    if (-not $sheetXml) {
        return @()
    }

    $rows = @()

    foreach ($rowNode in $sheetXml.SelectNodes("/*[local-name()='worksheet']/*[local-name()='sheetData']/*[local-name()='row']")) {
        $cells = [ordered]@{}
        foreach ($cellNode in $rowNode.SelectNodes("./*[local-name()='c']")) {
            $reference = $cellNode.GetAttribute('r')
            $column = ($reference -replace '\d', '')
            $cells[$column] = Convert-CellValue -Cell $cellNode -SharedStrings $SharedStrings
        }
        $rows += [pscustomobject]@{
            RowNumber = [int]$rowNode.GetAttribute('r')
            Cells = $cells
        }
    }

    return $rows
}

function New-Record {
    param(
        [hashtable]$Fields
    )

    return [pscustomobject]$Fields
}

if (-not (Test-Path -LiteralPath $InputPath)) {
    throw "Input workbook not found: $InputPath"
}

$inputFullPath = (Resolve-Path -LiteralPath $InputPath).ProviderPath
$outputFullPath = [System.IO.Path]::GetFullPath($OutputPath)
$outputDirectory = Split-Path -Path $outputFullPath -Parent
if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Force -Path $outputDirectory | Out-Null
}

$archive = [System.IO.Compression.ZipFile]::OpenRead($inputFullPath)

try {
    $workbookXml = Get-ZipXml -Archive $archive -EntryPath 'xl/workbook.xml'
    $relationshipsXml = Get-ZipXml -Archive $archive -EntryPath 'xl/_rels/workbook.xml.rels'
    $sharedStringsXml = Get-ZipXml -Archive $archive -EntryPath 'xl/sharedStrings.xml'

    $sharedStrings = @()
    if ($sharedStringsXml) {
        foreach ($stringItem in $sharedStringsXml.SelectNodes("/*[local-name()='sst']/*[local-name()='si']")) {
            $segments = $stringItem.SelectNodes(".//*[local-name()='t']") | ForEach-Object { $_.InnerText }
            $sharedStrings += ($segments -join '')
        }
    }

    $relationshipMap = @{}
    foreach ($relationship in $relationshipsXml.SelectNodes("/*[local-name()='Relationships']/*[local-name()='Relationship']")) {
        $relationshipMap[$relationship.Id] = $relationship.Target
    }

    $sheetMap = @{}
    foreach ($sheet in $workbookXml.SelectNodes("/*[local-name()='workbook']/*[local-name()='sheets']/*[local-name()='sheet']")) {
        $relationshipId = $sheet.GetAttribute('id', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        if (-not $relationshipId) {
            $relationshipId = $sheet.GetAttribute('r:id')
        }
        if (-not $relationshipId) {
            continue
        }

        $target = $relationshipMap[$relationshipId]
        if (-not $target) {
            continue
        }

        $sheetMap[$sheet.GetAttribute('name')] = 'xl/' + $target
    }

    $sheetRows = @{}
    foreach ($sheetName in $sheetMap.Keys) {
        $sheetRows[$sheetName] = Read-SheetRows -Archive $archive -TargetPath $sheetMap[$sheetName] -SharedStrings $sharedStrings
    }

    $officials = @()
    foreach ($row in $sheetRows['BARANGAY OFFICIALS']) {
        if ($row.RowNumber -le 1) { continue }
        $cells = $row.Cells
        $name = Build-FullName -First $cells['D'] -Middle $cells['E'] -Last $cells['C']
        $barangay = Normalize-Text $cells['A']
        if (-not $barangay -or -not $name) { continue }

        $fiesta = Normalize-DateishText $cells['M']
        $yearEndParty = Normalize-DateishText $cells['N']
        $barangayAssembly = Normalize-DateishText $cells['O']
        $availableData = Join-SummaryParts @(
            $(if ($fiesta) { "Fiesta: $fiesta" })
            $(if ($yearEndParty) { "Year End Party: $yearEndParty" })
            $(if ($barangayAssembly) { "Barangay Assembly: $barangayAssembly" })
        )

        $officials += New-Record @{
            id = "officials-$($row.RowNumber)"
            barangay = $barangay
            position = Normalize-Text $cells['B']
            name = $name
            purok = Normalize-Text $cells['G']
            contact = Normalize-Contact $cells['H']
            email = Normalize-Text $cells['J']
            committee = Normalize-Text $cells['K']
            votes = Normalize-NumericText $cells['L']
            fiesta = $fiesta
            yearEndParty = $yearEndParty
            barangayAssembly = $barangayAssembly
            availableData = $availableData
            sheet = 'BARANGAY OFFICIALS'
        }
    }

    $lupon = @()
    foreach ($row in $sheetRows['LUPON']) {
        if ($row.RowNumber -le 2) { continue }
        $cells = $row.Cells
        $name = Build-FullName -First $cells['E'] -Middle $cells['F'] -Last $cells['D']
        $barangay = Normalize-Text $cells['A']
        if (-not $barangay -or -not $name) { continue }

        $lupon += New-Record @{
            id = "lupon-$($row.RowNumber)"
            barangay = $barangay
            position = Normalize-Text $cells['C']
            name = $name
            purok = Normalize-Text $cells['H']
            contact = Normalize-Contact $cells['I']
            email = Normalize-Text $cells['J']
            availableData = ''
            sheet = 'LUPON'
        }
    }

    $leaders = @()

    foreach ($row in $sheetRows['SK OFFICIALS']) {
        if ($row.RowNumber -le 1) { continue }
        $cells = $row.Cells
        $name = Build-FullName -First $cells['D'] -Middle $cells['E'] -Last $cells['C']
        $barangay = Normalize-Text $cells['A']
        if (-not $barangay -or -not $name) { continue }

        $sessionSchedule = Normalize-DateishText $cells['M']
        $kkAssembly = Normalize-DateishText $cells['N']
        $availableData = Join-SummaryParts @(
            $(if ($sessionSchedule) { "Session: $sessionSchedule" })
            $(if ($kkAssembly) { "KK Assembly: $kkAssembly" })
        )

        $leaders += New-Record @{
            id = "leaders-sk-$($row.RowNumber)"
            barangay = $barangay
            leaderGroup = 'SK Officials'
            position = Normalize-Text $cells['B']
            name = $name
            location = Normalize-Text $cells['G']
            contact = Normalize-Contact $cells['H']
            notes = Normalize-Text $cells['K']
            votes = Normalize-NumericText $cells['L']
            sessionSchedule = $sessionSchedule
            kkAssembly = $kkAssembly
            availableData = $availableData
            sheet = 'SK OFFICIALS'
        }
    }

    foreach ($row in $sheetRows['BPSO']) {
        if ($row.RowNumber -le 1) { continue }
        $cells = $row.Cells
        $name = Build-FullName -First $cells['E'] -Middle $cells['F'] -Last $cells['D']
        $barangay = Normalize-Text $cells['A']
        if (-not $barangay -or -not $name) { continue }

        $leaders += New-Record @{
            id = "leaders-bpso-$($row.RowNumber)"
            barangay = $barangay
            leaderGroup = 'BPSO'
            position = Normalize-Text $cells['C']
            name = $name
            location = Normalize-Text $cells['I']
            contact = Normalize-Contact $cells['J']
            notes = Normalize-Text $cells['G']
            availableData = ''
            sheet = 'BPSO'
        }
    }

    foreach ($row in $sheetRows['BQRT']) {
        if ($row.RowNumber -le 1) { continue }
        $cells = $row.Cells
        $name = Build-FullName -First $cells['D'] -Middle $cells['E'] -Last $cells['C']
        $barangay = Normalize-Text $cells['A']
        if (-not $barangay -or -not $name) { continue }

        $position = Normalize-Text $cells['B']
        if (-not $position) {
            $position = 'BQRT Member'
        }

        $leaders += New-Record @{
            id = "leaders-bqrt-$($row.RowNumber)"
            barangay = $barangay
            leaderGroup = 'BQRT'
            position = $position
            name = $name
            location = Normalize-Text $cells['G']
            contact = Normalize-Contact $cells['H']
            notes = ''
            availableData = ''
            sheet = 'BQRT'
        }
    }

    foreach ($row in $sheetRows['BHW']) {
        if ($row.RowNumber -le 1) { continue }
        $cells = $row.Cells
        $name = Build-FullName -First $cells['D'] -Middle $cells['E'] -Last $cells['C']
        $barangay = Normalize-Text $cells['A']
        if (-not $barangay -or -not $name) { continue }

        $leaders += New-Record @{
            id = "leaders-bhw-$($row.RowNumber)"
            barangay = $barangay
            leaderGroup = 'BHW'
            position = Normalize-Text $cells['B']
            name = $name
            location = Normalize-Text $cells['G']
            contact = Normalize-Contact $cells['H']
            notes = ''
            availableData = ''
            sheet = 'BHW'
        }
    }

    foreach ($row in $sheetRows['VAWC']) {
        if ($row.RowNumber -le 1) { continue }
        $cells = $row.Cells
        $name = Build-FullName -First $cells['C'] -Middle $cells['D'] -Last $cells['B']
        $barangay = Normalize-Text $cells['A']
        if (-not $barangay -or -not $name) { continue }

        $leaders += New-Record @{
            id = "leaders-vawc-$($row.RowNumber)"
            barangay = $barangay
            leaderGroup = 'VAWC'
            position = 'VAWC Member'
            name = $name
            location = Normalize-Text $cells['F']
            contact = Normalize-Contact $cells['G']
            notes = ''
            availableData = ''
            sheet = 'VAWC'
        }
    }

    foreach ($row in $sheetRows['BRGY EMPLOYEE']) {
        if ($row.RowNumber -le 1) { continue }
        $cells = $row.Cells
        $name = Build-FullName -First $cells['D'] -Middle $cells['E'] -Last $cells['C']
        $barangay = Normalize-Text $cells['A']
        if (-not $barangay -or -not $name) { continue }

        $leaders += New-Record @{
            id = "leaders-employee-$($row.RowNumber)"
            barangay = $barangay
            leaderGroup = 'Barangay Employee'
            position = Normalize-Text $cells['B']
            name = $name
            location = Normalize-Text $cells['G']
            contact = Normalize-Contact $cells['H']
            notes = ''
            availableData = ''
            sheet = 'BRGY EMPLOYEE'
        }
    }

    $sectoral = @()
    foreach ($row in $sheetRows['SECTORAL ORGS']) {
        if ($row.RowNumber -le 1) { continue }
        $cells = $row.Cells
        $organization = Normalize-Text $cells['B']
        $representative = Build-FullName -First $cells['J'] -Middle $cells['K'] -Last $cells['I']
        $barangay = Normalize-Text $cells['A']
        if (-not $barangay -or -not $organization -or -not $representative) { continue }

        $sectoral += New-Record @{
            id = "sectoral-$($row.RowNumber)"
            barangay = $barangay
            organization = $organization
            sector = Normalize-Text $cells['C']
            established = Normalize-Text $cells['D']
            members = Normalize-NumericText $cells['E']
            officeAddress = Normalize-Text $cells['F']
            organizationPurok = Normalize-Text $cells['G']
            position = Normalize-Text $cells['H']
            representative = $representative
            location = Normalize-Text $cells['M']
            contact = Normalize-Contact $cells['N']
            email = Normalize-Text $cells['O']
            meeting = Normalize-DateishText $cells['Q']
            availableData = $(if (Normalize-DateishText $cells['Q']) { 'Meeting: ' + (Normalize-DateishText $cells['Q']) } else { '' })
            sheet = 'SECTORAL ORGS'
        }
    }

    $allBarangays = @(@(
        $officials | ForEach-Object { $_.barangay }
        $lupon | ForEach-Object { $_.barangay }
        $leaders | ForEach-Object { $_.barangay }
        $sectoral | ForEach-Object { $_.barangay }
    ) | Where-Object { $_ } | Sort-Object -Unique)

    $payload = [ordered]@{
        meta = [ordered]@{
            sourceFile = [System.IO.Path]::GetFileName($inputFullPath)
            generatedAt = (Get-Date).ToString('yyyy-MM-ddTHH:mm:ssK')
            allBarangays = $allBarangays
        }
        categories = [ordered]@{
            officials = $officials
            lupon = $lupon
            leaders = $leaders
            sectoral = $sectoral
        }
    }

    $json = $payload | ConvertTo-Json -Depth 8 -Compress
    $scriptContents = "window.CEUDatabaseData = $json;"
    [System.IO.File]::WriteAllText($outputFullPath, $scriptContents, [System.Text.Encoding]::UTF8)

    Write-Output "Generated $outputFullPath"
    Write-Output "Officials: $(@($officials).Count)"
    Write-Output "Lupon: $(@($lupon).Count)"
    Write-Output "Leaders: $(@($leaders).Count)"
    Write-Output "Sectoral: $(@($sectoral).Count)"
    Write-Output "Barangays: $(@($allBarangays).Count)"
} finally {
    $archive.Dispose()
}
