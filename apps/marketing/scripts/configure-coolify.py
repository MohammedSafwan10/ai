"""Configure only Privora's two known Coolify resources and signed push webhook.

Reads the existing protected CLI context in memory. Never prints credentials.
"""
import json
import os
from pathlib import Path
import secrets
import subprocess
import urllib.request
from urllib.parse import urlparse

MARKETING="mxs16g7cy009gy0jxhrtnlxv"
RELEASES="ypmxb6h9rlo5dt62otqgpnoa"
REPOSITORY="MohammedSafwan10/privora-desktop"

def main():
    config=Path(os.environ.get("APPDATA",Path.home()/".config"))/"coolify/config.json"
    contexts=json.loads(config.read_text())["instances"]
    context=next(item for item in contexts if item["name"]=="nexdark")
    base=context["fqdn"].rstrip("/")
    if urlparse(base).hostname!="coolify.nexdark.com" or not base.startswith("https://"):
        raise ValueError("Expected the existing HTTPS Coolify context")
    secret=secrets.token_hex(32)
    def api(method,route,body=None):
        request=urllib.request.Request(base+"/api/v1"+route,data=None if body is None else json.dumps(body).encode(),method=method,headers={"Authorization":"Bearer "+context["token"],"Content-Type":"application/json","Accept":"application/json"})
        with urllib.request.urlopen(request,timeout=30) as response:return json.load(response)
    for app,watch in [(MARKETING,"/apps/marketing/**"),(RELEASES,"/apps/releases/**")]:
        existing=api("GET","/applications/"+app)
        if existing.get("git_repository","").removeprefix("https://github.com/").removesuffix(".git")!=REPOSITORY:
            raise ValueError("Resource repository does not match")
        api("PATCH","/applications/"+app,{"manual_webhook_secret_github":secret,"is_auto_deploy_enabled":True,"watch_paths":watch,"limits_cpus":"0.25","limits_memory":"128M"})
    endpoint=f"repos/{REPOSITORY}/hooks"
    result=subprocess.run(["gh","api",endpoint],capture_output=True,text=True,check=True)
    hooks=json.loads(result.stdout)
    url=base+"/webhooks/source/github/events/manual"
    matches=[hook for hook in hooks if hook.get("config",{}).get("url")==url]
    if len(matches)>1:raise ValueError("Multiple existing Coolify hooks; inspect before changing")
    payload={"active":True,"events":["push"],"config":{"url":url,"content_type":"json","insecure_ssl":"0","secret":secret}}
    method="PATCH" if matches else "POST"
    target=endpoint+"/"+str(matches[0]["id"]) if matches else endpoint
    done=subprocess.run(["gh","api","--method",method,target,"--input","-"],input=json.dumps(payload),capture_output=True,text=True)
    if done.returncode:raise RuntimeError("GitHub webhook configuration failed; credentials were not printed")
    hook=json.loads(done.stdout)
    print(json.dumps({"webhookId":hook["id"],"active":hook["active"],"events":hook["events"],"resources":[MARKETING,RELEASES],"signed":True,"tlsVerification":True}))

if __name__=="__main__":
    try:main()
    except Exception as error:
        # HTTP response bodies and subprocess payloads can contain secrets.
        print(f"Configuration failed ({type(error).__name__}); no credential values logged.")
        raise SystemExit(1)
