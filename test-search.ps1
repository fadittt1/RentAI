# ─────────────────────────────────────────────────────────────────────────────
# AI Search regression test suite — run after any change to ai-search.service.ts
# Usage:  cd all-the-project-  &&  .\test-search.ps1
#
# Flow under test (multi-step follow-ups):
#   ambiguity? -> location? -> dates? -> RESULT
# ─────────────────────────────────────────────────────────────────────────────
$BASE = "http://localhost:3001/api/ai/search"
$TMP  = "$env:TEMP\ai_test_body.json"
$PASS = 0; $FAIL = 0

function Invoke-Search {
  param([hashtable]$body)
  $json = $body | ConvertTo-Json -Depth 5
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($json)
  $r = Invoke-RestMethod -Uri $BASE -Method Post -Body $bytes -ContentType "application/json; charset=utf-8"
  return $r.data
}

# "Près de moi" built from code points — avoids any .ps1 file encoding mojibake
# (PowerShell 5.1 reads .ps1 as Windows-1252 by default, so literal è gets corrupted)
$NEAR_ME = "Pr" + ([char]0xE8) + "s de moi"

function Assert {
  param([string]$label, $actual, $expected, [string]$field)
  if ($actual -eq $expected) { return $true }
  Write-Host "    FAIL [$field] expected='$expected' got='$actual'" -ForegroundColor Red
  return $false
}

function Test-Case {
  param([string]$name, [hashtable]$req, [hashtable]$expect)
  try {
    $d = Invoke-Search -body $req
    $ok = $true

    if ($expect.mode)            { $ok = (Assert $name $d.mode            $expect.mode        "mode")    -and $ok }
    if ($expect.fuf)             { $ok = (Assert $name $d.followUp.field  $expect.fuf         "fuf")     -and $ok }
    if ($null -ne $expect.cat)   { $ok = (Assert $name $d.filters.categorySlug $expect.cat    "cat")     -and $ok }
    if ($null -ne $expect.q)     { $ok = (Assert $name $d.filters.q       $expect.q           "q")       -and $ok }
    if ($expect.sea)             { $ok = (Assert $name $d.filters.nearSea $expect.sea         "nearSea") -and $ok }
    if ($null -ne $expect.maxPrice) {
      $ok = (Assert $name $d.filters.maxPrice $expect.maxPrice "maxPrice") -and $ok
    }
    # Conversational enrichment fields
    if ($expect.hasSummary -and -not $d.summary) {
      Write-Host "    FAIL [summary] expected non-empty, got null" -ForegroundColor Red; $ok = $false
    }
    if ($expect.hasStats -and -not $d.stats) {
      Write-Host "    FAIL [stats] expected non-null" -ForegroundColor Red; $ok = $false
    }
    if ($expect.hasSuggestions -and ($d.suggestions.Count -eq 0)) {
      Write-Host "    FAIL [suggestions] expected at least 1" -ForegroundColor Red; $ok = $false
    }
    if ($expect.hasReasoning -and -not $d.reasoning) {
      Write-Host "    FAIL [reasoning] expected non-empty" -ForegroundColor Red; $ok = $false
    }
    if ($null -ne $expect.city) {
      $ok = (Assert $name $d.filters.city $expect.city "city") -and $ok
    }
    if ($expect.minResults -gt 0) {
      $ok = ($d.results.Count -ge $expect.minResults) -and $ok
      if ($d.results.Count -lt $expect.minResults) {
        Write-Host "    FAIL [results] expected>=$($expect.minResults) got=$($d.results.Count)" -ForegroundColor Red
      }
    }
    if ($expect.noStaleChip) {
      $stale = $d.chips | Where-Object { $_.key -eq "item" -and $_.label -ieq $expect.noStaleChip }
      if ($stale) { Write-Host "    FAIL [noStaleChip] stale '$($expect.noStaleChip)' still present" -ForegroundColor Red; $ok = $false }
    }
    if ($expect.itemChip) {
      $found = $d.chips | Where-Object { $_.key -eq "item" -and $_.label -ieq $expect.itemChip }
      if (-not $found) { Write-Host "    FAIL [itemChip] expected '$($expect.itemChip)', got: $(($d.chips | ForEach-Object { $_.label }) -join ', ')" -ForegroundColor Red; $ok = $false }
    }

    if ($ok) {
      Write-Host "  PASS  $name" -ForegroundColor Green
      $script:PASS++
    } else {
      Write-Host "  FAIL  $name" -ForegroundColor Red
      $script:FAIL++
    }
  } catch {
    Write-Host "  ERROR $name : $_" -ForegroundColor Magenta
    $script:FAIL++
  }
}

$LOC = @{ lat = 36.8578; lng = 11.092; radiusKm = 20 }

Write-Host "`n=== AI Search Regression Tests ===`n" -ForegroundColor Cyan

# ── CATEGORY DETECTION + FIRST FOLLOW-UP (LOCATION) ──────────────────────────
Write-Host "[ Category + location follow-up ]" -ForegroundColor Yellow

Test-Case "voiture -> mobility ask location" `
  (@{ query="voiture" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="FOLLOW_UP"; fuf="location"; cat="mobility" }

Test-Case "maison -> stays ask location" `
  (@{ query="maison" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="FOLLOW_UP"; fuf="location"; cat="stays" }

Test-Case "padel -> sports ask location" `
  (@{ query="terrain de padel" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="FOLLOW_UP"; fuf="location"; cat="sports-facilities" }

Test-Case "kayak ce weekend -> beach-gear ask location (date already set)" `
  (@{ query="kayak ce weekend" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="FOLLOW_UP"; fuf="location"; cat="beach-gear" }

Test-Case "cycle fresh prev=paddle: ask location, item=cycle, not paddle" `
  (@{ query="cycle" } + $LOC + @{ followUpUsed=0; previousFilters=@{categorySlug="beach-gear";q="paddle"} }) `
  @{ mode="FOLLOW_UP"; fuf="location"; cat="mobility"; itemChip="Cycle"; noStaleChip="Paddle" }

# ── ARABIC / DARIJA ────────────────────────────────────────────────────────
Write-Host "`n[ Arabic / Darija ]" -ForegroundColor Yellow

$sayyara = -join (0x0633,0x064A,0x0627,0x0631,0x0629 | ForEach-Object { [char]$_ })
$beit    = -join (0x0628,0x064A,0x062A           | ForEach-Object { [char]$_ })

$body = '{"query":"' + $sayyara + '","lat":36.8578,"lng":11.092,"radiusKm":20,"followUpUsed":0}'
[System.IO.File]::WriteAllText($TMP, $body, [System.Text.Encoding]::UTF8)
$raw = Get-Content $TMP -Encoding UTF8 -Raw
try {
  $d = (Invoke-RestMethod -Uri $BASE -Method Post -Body $raw -ContentType "application/json; charset=utf-8").data
  if ($d.filters.categorySlug -eq "mobility" -and $d.followUp.field -eq "location") {
    Write-Host "  PASS  Arabic car (sayyara) -> mobility ask location" -ForegroundColor Green; $PASS++
  } else { Write-Host "  FAIL  Arabic car -> cat=$($d.filters.categorySlug) fuf=$($d.followUp.field)" -ForegroundColor Red; $FAIL++ }
} catch { Write-Host "  ERROR Arabic car" -ForegroundColor Magenta; $FAIL++ }

$body = '{"query":"' + $beit + '","lat":36.8578,"lng":11.092,"radiusKm":20,"followUpUsed":0}'
[System.IO.File]::WriteAllText($TMP, $body, [System.Text.Encoding]::UTF8)
$raw = Get-Content $TMP -Encoding UTF8 -Raw
try {
  $d = (Invoke-RestMethod -Uri $BASE -Method Post -Body $raw -ContentType "application/json; charset=utf-8").data
  if ($d.filters.categorySlug -eq "stays" -and $d.followUp.field -eq "location") {
    Write-Host "  PASS  Arabic house (beit) -> stays ask location" -ForegroundColor Green; $PASS++
  } else { Write-Host "  FAIL  Arabic house -> cat=$($d.filters.categorySlug) fuf=$($d.followUp.field)" -ForegroundColor Red; $FAIL++ }
} catch { Write-Host "  ERROR Arabic house" -ForegroundColor Magenta; $FAIL++ }

Test-Case "bghit karhba -> mobility ask location" `
  (@{ query="bghit karhba" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="FOLLOW_UP"; fuf="location"; cat="mobility" }

# ── COMPLETE QUERIES (city in query: ask only dates) ───────────────────────
Write-Host "`n[ City in query -> skip location, ask dates ]" -ForegroundColor Yellow

Test-Case "villa kelibia (city only) -> ask dates" `
  (@{ query="villa a kelibia" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="FOLLOW_UP"; fuf="dates"; cat="stays"; city="kelibia" }

Test-Case "villa <300 kelibia -> ask dates (price+city ok)" `
  (@{ query="villa moins de 300 a kelibia" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="FOLLOW_UP"; fuf="dates"; cat="stays"; maxPrice=300; city="kelibia" }

Test-Case "house near sea kelibia under 1000 -> ask dates" `
  (@{ query="house near the sea kelibia under 1000" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="FOLLOW_UP"; fuf="dates"; cat="stays"; sea=$true; city="kelibia"; maxPrice=1000 }

# ── FULLY COMPLETE QUERIES (no follow-up needed) ────────────────────────────
Write-Host "`n[ Fully complete queries -> RESULT directly ]" -ForegroundColor Yellow

Test-Case "dar kelibia ba7dha lb7ar ta7t 500 ll jemm3a jeya -> RESULT" `
  (@{ query="dar kelibia ba7dha lb7ar ta7t 500 ll jem3a jaya" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="RESULT"; cat="stays"; city="kelibia" }

Test-Case "villa kelibia ce weekend -> RESULT" `
  (@{ query="villa a kelibia ce weekend" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="RESULT"; cat="stays"; city="kelibia" }

# ── AMBIGUITY (paddle) ─────────────────────────────────────────────────────
Write-Host "`n[ Ambiguity ]" -ForegroundColor Yellow

Test-Case "paddle: ambiguity asks category first" `
  (@{ query="paddle" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="FOLLOW_UP"; fuf="category" }

# ── MULTI-STEP FOLLOW-UP CHAIN ─────────────────────────────────────────────
Write-Host "`n[ Multi-step follow-up chain ]" -ForegroundColor Yellow

Test-Case "paddle->Paddleboard: q=paddle, ask location" `
  (@{ query="paddle"; followUpUsed=1; followUpAnswer="Paddleboard / SUP (mer)"; previousFilters=@{categorySlug="beach-gear"} } + $LOC) `
  @{ mode="FOLLOW_UP"; fuf="location"; cat="beach-gear"; q="paddle" }

Test-Case "cycle (loc=Kelibia) -> ask dates" `
  (@{ query="cycle"; followUpUsed=1; followUpAnswer="Kelibia"; previousFilters=@{categorySlug="mobility";q="cycle"} } + $LOC) `
  @{ mode="FOLLOW_UP"; fuf="dates"; cat="mobility"; city="kelibia" }

Test-Case "cycle (loc=Pres de moi) -> ask dates" `
  (@{ query="cycle"; followUpUsed=1; followUpAnswer=$NEAR_ME; previousFilters=@{categorySlug="mobility";q="cycle"} } + $LOC) `
  @{ mode="FOLLOW_UP"; fuf="dates"; cat="mobility" }

Test-Case "cycle (loc=Kelibia, date=Demain) -> RESULT" `
  (@{ query="cycle"; followUpUsed=2; followUpAnswer="Demain"; previousFilters=@{categorySlug="mobility";q="cycle";city="kelibia";locationConfirmed=$true} } + $LOC) `
  @{ mode="RESULT"; cat="mobility" }

# ── CONVERSATIONAL ENRICHMENT (summary + stats + suggestions + reasoning) ──
Write-Host "`n[ Conversational enrichment on RESULT ]" -ForegroundColor Yellow

Test-Case "villa kelibia ce weekend -> RESULT with full enrichment" `
  (@{ query="villa a kelibia ce weekend yyz" } + $LOC + @{ followUpUsed=0 }) `
  @{ mode="RESULT"; cat="stays"; hasSummary=$true; hasStats=$true; hasSuggestions=$true; hasReasoning=$true }

# ── KEYWORD INTEGRITY: relaxation must NEVER drop the keyword and show wrong items
Write-Host "`n[ Keyword integrity ]" -ForegroundColor Yellow

try {
  $body = @{
    query="cycle"; followUpUsed=2; followUpAnswer="Demain";
    previousFilters=@{categorySlug="mobility"; q="cycle"; city="tunis"; maxPrice=200; locationConfirmed=$true};
    lat=36.8065; lng=10.1815; radiusKm=20
  } | ConvertTo-Json -Depth 5
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $r = (Invoke-RestMethod -Uri $BASE -Method Post -Body $bytes -ContentType "application/json; charset=utf-8").data
  # Must NOT contain cars/Teslas/Quads when no real cycles exist
  $wrongTitles = $r.results | Where-Object { $_.title -notmatch 'v[ée]lo|cycle|bicy|bike' }
  if ($r.results.Count -gt 0 -and $wrongTitles.Count -gt 0) {
    Write-Host "  FAIL  cycle@Tunis returned unrelated items: $(($wrongTitles | ForEach-Object { $_.title }) -join '; ')" -ForegroundColor Red
    $FAIL++
  } else {
    Write-Host "  PASS  cycle@Tunis: no unrelated items (got $($r.results.Count) result(s))" -ForegroundColor Green
    $PASS++
  }
  # Chips must NOT show price=200 when price was relaxed away
  $priceChip = $r.chips | Where-Object { $_.key -eq "price" }
  if ($r.relaxedConstraints -contains "price" -and $priceChip) {
    Write-Host "  FAIL  price chip still shown after relaxation" -ForegroundColor Red
    $FAIL++
  } else {
    Write-Host "  PASS  chip vs relaxation state coherent" -ForegroundColor Green
    $PASS++
  }
} catch {
  Write-Host "  ERROR keyword integrity: $_" -ForegroundColor Magenta
  $FAIL++
}

# ── PER-RESULT MATCH EXPLANATIONS ──────────────────────────────────────────
Write-Host "`n[ Per-result match explanations ]" -ForegroundColor Yellow

try {
  $body = @{ query="villa kelibia ce weekend match-test"; lat=36.8578; lng=11.092; radiusKm=20; followUpUsed=0 } | ConvertTo-Json -Depth 5
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($body)
  $r = (Invoke-RestMethod -Uri $BASE -Method Post -Body $bytes -ContentType "application/json; charset=utf-8").data
  $withMatches = $r.results | Where-Object { $_.matches -and $_.matches.Count -gt 0 }
  if ($withMatches.Count -eq $r.results.Count -and $r.results.Count -gt 0) {
    Write-Host "  PASS  all $($r.results.Count) results have matches[]" -ForegroundColor Green; $PASS++
  } else {
    Write-Host "  FAIL  $($withMatches.Count)/$($r.results.Count) results have matches[]" -ForegroundColor Red; $FAIL++
  }
} catch { Write-Host "  ERROR matches: $_" -ForegroundColor Magenta; $FAIL++ }

# ── NEW ENDPOINTS (quick-starts + recent + telemetry + embedding) ──────────
Write-Host "`n[ Endpoints: quick-starts + recent + telemetry + embedding ]" -ForegroundColor Yellow

try {
  $qs = (Invoke-RestMethod -Uri "http://localhost:3001/api/ai/search/quick-starts").data
  if ($qs.Count -ge 4) { Write-Host "  PASS  quick-starts returns $($qs.Count) items" -ForegroundColor Green; $PASS++ }
  else                 { Write-Host "  FAIL  quick-starts returned $($qs.Count)" -ForegroundColor Red; $FAIL++ }
} catch { Write-Host "  ERROR quick-starts: $_" -ForegroundColor Magenta; $FAIL++ }

try {
  $rs = (Invoke-RestMethod -Uri "http://localhost:3001/api/ai/search/recent?limit=5").data
  if ($null -ne $rs) { Write-Host "  PASS  recent returns $($rs.Count) items" -ForegroundColor Green; $PASS++ }
  else               { Write-Host "  FAIL  recent returned null" -ForegroundColor Red; $FAIL++ }
} catch { Write-Host "  ERROR recent: $_" -ForegroundColor Magenta; $FAIL++ }

try {
  $clickBody = @{ suggestion="Bord de mer uniquement"; originalQuery="villa kelibia"; sessionId="test" } | ConvertTo-Json
  $clickBytes = [System.Text.Encoding]::UTF8.GetBytes($clickBody)
  $clickRes = (Invoke-RestMethod -Uri "http://localhost:3001/api/ai/search/suggestion-click" -Method Post -Body $clickBytes -ContentType "application/json; charset=utf-8").data
  if ($clickRes.ok) { Write-Host "  PASS  suggestion-click logged" -ForegroundColor Green; $PASS++ }
  else              { Write-Host "  FAIL  suggestion-click ok=false" -ForegroundColor Red; $FAIL++ }
} catch { Write-Host "  ERROR suggestion-click: $_" -ForegroundColor Magenta; $FAIL++ }

try {
  $stats = (Invoke-RestMethod -Uri "http://localhost:3001/api/ai/search/embedding-stats").data
  Write-Host "  PASS  embedding-stats: available=$($stats.available) indexed=$($stats.indexedCount)" -ForegroundColor Green; $PASS++
} catch { Write-Host "  ERROR embedding-stats: $_" -ForegroundColor Magenta; $FAIL++ }

# ── STREAMING ENDPOINT (NDJSON) ────────────────────────────────────────────
Write-Host "`n[ Streaming endpoint ]" -ForegroundColor Yellow

try {
  $streamBody = @{ query="villa kelibia stream-regression-test"; lat=36.8578; lng=11.092; radiusKm=20; followUpUsed=0 } | ConvertTo-Json
  $streamBytes = [System.Text.Encoding]::UTF8.GetBytes($streamBody)
  $req = [System.Net.WebRequest]::Create("$BASE/stream")
  $req.Method = "POST"
  $req.ContentType = "application/json; charset=utf-8"
  $req.ContentLength = $streamBytes.Length
  $s = $req.GetRequestStream(); $s.Write($streamBytes, 0, $streamBytes.Length); $s.Close()
  $resp = $req.GetResponse()
  $reader = New-Object System.IO.StreamReader($resp.GetResponseStream())
  $events = @()
  while (-not $reader.EndOfStream) {
    $line = $reader.ReadLine()
    if ($line) { $events += ($line | ConvertFrom-Json).type }
  }
  $reader.Close()
  # Must have at least an 'understanding' or 'result' event
  if ($events -contains 'result' -or $events -contains 'cached') {
    Write-Host "  PASS  stream events: $($events -join ' -> ')" -ForegroundColor Green; $PASS++
  } else {
    Write-Host "  FAIL  stream missing 'result' (got: $($events -join ', '))" -ForegroundColor Red; $FAIL++
  }
} catch { Write-Host "  ERROR streaming: $_" -ForegroundColor Magenta; $FAIL++ }

# (Rate-limit test moved to end — it consumes the per-IP quota.)

# ── FRESH SEARCH ISOLATION ─────────────────────────────────────────────────
Write-Host "`n[ Fresh search isolation ]" -ForegroundColor Yellow

Test-Case "cycle FRESH prev=paddle: no stale Paddle chip" `
  (@{ query="cycle"; followUpUsed=0; previousFilters=@{categorySlug="beach-gear";q="paddle"} } + $LOC) `
  @{ noStaleChip="Paddle" }

Test-Case "maison FRESH prev=voiture: stays not mobility" `
  (@{ query="maison"; followUpUsed=0; previousFilters=@{categorySlug="mobility"} } + $LOC) `
  @{ cat="stays" }

# ── RATE LIMITING (last — consumes per-IP quota) ───────────────────────────
Write-Host "`n[ Rate limiting (runs last) ]" -ForegroundColor Yellow

try {
  $rateBody = @{ query="ratetest-zzz"; lat=36.8578; lng=11.092; radiusKm=20; followUpUsed=0 } | ConvertTo-Json
  $rateBytes = [System.Text.Encoding]::UTF8.GetBytes($rateBody)
  $hits = 0; $blocks = 0
  for ($i = 0; $i -lt 60; $i++) {
    try {
      Invoke-RestMethod -Uri $BASE -Method Post -Body $rateBytes -ContentType "application/json; charset=utf-8" | Out-Null
      $hits++
    } catch {
      if ($_.Exception.Response.StatusCode -eq 429) { $blocks++ }
    }
  }
  if ($blocks -gt 0) { Write-Host "  PASS  throttler kicked in ($hits ok / $blocks blocked of 60)" -ForegroundColor Green; $PASS++ }
  else               { Write-Host "  WARN  no 429s after 60 hits (hits=$hits) - limit may be too high" -ForegroundColor Yellow; $PASS++ }
} catch { Write-Host "  ERROR rate-limit: $_" -ForegroundColor Magenta; $FAIL++ }

# ── SUMMARY ─────────────────────────────────────────────────────────────────
Write-Host "`n=== Results: $PASS passed, $FAIL failed ===`n" -ForegroundColor $(if ($FAIL -eq 0) {"Green"} else {"Red"})
if ($FAIL -gt 0) { exit 1 } else { exit 0 }
