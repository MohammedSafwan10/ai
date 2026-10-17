[CmdletBinding()]
param([ValidateSet('Cutover','Rollback')][string]$Action='Cutover')
$ErrorActionPreference='Stop'
$credential=Join-Path $env:USERPROFILE '.cloudflare\nexdark_dns_token.dpapi'
$secure=ConvertTo-SecureString (Get-Content -Raw -LiteralPath $credential)
$pointer=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $token=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    $headers=@{Authorization="Bearer $token"}
    function Api($method,$path,$body=$null) {
        $parameters=@{Method=$method;Uri="https://api.cloudflare.com/client/v4$path";Headers=$headers}
        if($null -ne $body){$parameters.ContentType='application/json';$parameters.Body=$body|ConvertTo-Json -Compress}
        $response=Invoke-RestMethod @parameters
        if(-not $response.success){throw 'Cloudflare request failed'}
        return $response.result
    }
    $zones=@(Api GET '/zones?name=nexdark.com')
    if($zones.Count -ne 1){throw 'Expected exactly one nexdark.com zone'}
    $zone=$zones[0].id
    $targets=@(@{name='privora.nexdark.com';legacy='appwrite.network'},@{name='updates.nexdark.com';legacy='sgp.cloud.appwrite.io'})
    $changes=@()
    foreach($target in $targets){
        $records=@(Api GET "/zones/$zone/dns_records?name=$($target.name)")
        if($records.Count -ne 1){throw "Ambiguous DNS records for $($target.name)"}
        $record=$records[0]
        $isLegacy=$record.type -eq 'CNAME' -and $record.content -eq $target.legacy
        $isVps=$record.type -eq 'A' -and $record.content -eq '129.151.44.211'
        if(-not ($isLegacy -or $isVps)){throw "Unexpected DNS target for $($target.name); refusing to overwrite it"}
        $type=if($Action -eq 'Cutover'){'A'}else{'CNAME'}
        $content=if($Action -eq 'Cutover'){'129.151.44.211'}else{$target.legacy}
        $changes+=@{id=$record.id;name=$target.name;type=$type;content=$content}
    }
    foreach($change in $changes){
        # PUT the existing record ID: no delete/create gap when changing CNAME to A.
        Api PUT "/zones/$zone/dns_records/$($change.id)" @{type=$change.type;name=$change.name;content=$change.content;ttl=1;proxied=$false}|Out-Null
        Write-Output "$Action $($change.name) -> $($change.content) (DNS only)"
    }
} finally {
    $headers=$null;$token=$null
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}
