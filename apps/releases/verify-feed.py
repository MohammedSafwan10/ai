"""Check the public Squirrel/website contract without installing or modifying a client."""
import argparse
import json
import re
import urllib.error
import urllib.request

def verify(origin):
    base=origin.rstrip("/")+"/win32/x64/stable"
    def get(path,method="GET",headers=None):
        return urllib.request.urlopen(urllib.request.Request(path,method=method,headers=headers or {}),timeout=30)
    with get(base) as response:
        assert response.status==200
        assert response.headers.get_content_type()=="application/json"
        assert response.headers.get("Access-Control-Allow-Origin")=="https://privora.nexdark.com"
        metadata=json.load(response)
    version=metadata["version"]
    with get(base+"/RELEASES") as response:manifest=response.read().decode("utf-8-sig").strip()
    entries=[line.split() for line in manifest.splitlines()]
    current=next(item for item in entries if item[1]==f"Privora-{version}-full.nupkg")
    assert re.fullmatch(r"[A-Fa-f0-9]{40}",current[0])
    for filename,length,prefix in [(f"Privora-{version}-full.nupkg",int(current[2]),b"PK"),("PrivoraSetup.exe",metadata["size"],b"MZ"),(f"PrivoraSetup-{version}.exe",metadata["size"],b"MZ")]:
        with get(base+"/"+filename,"HEAD") as response:
            assert int(response.headers["Content-Length"])==length
            assert response.headers.get_content_type()=="application/octet-stream"
        with get(base+"/"+filename,headers={"Range":"bytes=0-127"}) as response:
            assert response.status==206
            assert response.headers["Content-Range"]==f"bytes 0-127/{length}"
            content=response.read()
            assert len(content)==128 and content.startswith(prefix)
    for private in ["/current/metadata.json","/staging/","/promote.py"]:
        try:
            with get(origin.rstrip("/")+private):raise AssertionError("Private storage was exposed")
        except urllib.error.HTTPError as error:assert error.code==404
    print(json.dumps({"version":version,"sha256":metadata["sha256"],"metadata":True,"manifest":True,"installerAndPackageHeaders":True,"rangeRequests":True,"privateStorageHidden":True}))

if __name__=="__main__":
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin",default="https://updates.nexdark.com")
    verify(parser.parse_args().origin)
