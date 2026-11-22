"""Invoke UE's official Python tool and hand back its JSON result."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile

ROOT=Path(__file__).resolve().parent
def run(script,timeout=180):
    body={'toolset_name':'editor_toolset.toolsets.python_scripting.PythonScriptingTools',
          'tool_name':'execute_python','arguments':{'script':{'language':'Python','content':script}}}
    with tempfile.TemporaryDirectory() as tmp:
        req=Path(tmp)/'request.json'
        req.write_text(json.dumps(body),encoding='utf8')
        raw=subprocess.check_output([sys.executable,str(ROOT/'mcp_client.py'),'call_tool',str(req)],
                                    timeout=timeout)
    result=json.loads(raw)['result']
    if result.get('isError'):
        raise RuntimeError(str(result.get('content')))
    returned=result.get('structuredContent',{}).get('returnValue')
    try:
        return json.loads(returned)
    except (ValueError,TypeError):
        return returned

if __name__=='__main__':
    print(json.dumps(run(Path(sys.argv[1]).read_text(encoding='utf-8-sig')),ensure_ascii=True))

