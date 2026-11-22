import urllib.request,json,sys
from pathlib import Path
url='http://127.0.0.1:8000/mcp'
opener=urllib.request.build_opener(urllib.request.ProxyHandler({}))
headers={'Content-Type':'application/json','Accept':'application/json, text/event-stream'}
def send(method,params=None,id=None):
 d={'jsonrpc':'2.0','method':method}
 if params is not None:d['params']=params
 if id is not None:d['id']=id
 with opener.open(urllib.request.Request(url,json.dumps(d).encode(),headers,method='POST'),timeout=180) as r:
  body=r.read()
  return r.headers,json.loads(body) if body else {}
h,j=send('initialize',{'protocolVersion':'2025-11-25','capabilities':{},'clientInfo':{'name':'nikki-report','version':'1'}},1)
headers['Mcp-Session-Id']=h['Mcp-Session-Id']
headers['MCP-Protocol-Version']=j['result']['protocolVersion']
assert next(iter(j['result']['_meta'].values()))['projectName']=='Testitem'
send('notifications/initialized')
name=sys.argv[1]
args=json.loads(Path(sys.argv[2]).read_text(encoding='utf-8-sig')) if len(sys.argv)>2 else {}
print(json.dumps(send('tools/call',{'name':name,'arguments':args},2)[1],ensure_ascii=True))

