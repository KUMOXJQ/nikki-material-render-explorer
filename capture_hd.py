"""Capture new native-resolution UE evidence through the official MCP endpoint."""
import base64
import io
import json
import math
from pathlib import Path
import subprocess
import sys
import tempfile
from PIL import Image

ROOT = Path(__file__).resolve().parent
WORLD = '/Game/Character/Character.Character'
MODES = ('BaseColor','Normal','Roughness','Metallic','Specular','ShadingModel',
         'Opacity','SubsurfaceColor','SeparateTranslucencyRGB','DetailLighting',
         'Unlit','SceneDepth','ShaderComplexity')
DETAIL_MODES = ('Lit','BaseColor','Normal','Roughness','Specular','Metallic',
                'ShadingModel','Opacity','SeparateTranslucencyRGB')

def camera(x, y, z, target_y, target_z, fov):
    return {
        'location': {'x':x,'y':y,'z':z},
        'rotation': {'pitch':math.degrees(math.atan2(target_z-z,abs(y-target_y))),
                     'yaw':90 if y<target_y else -90,'roll':0},
        'fOV':fov,'projectionMode':'Perspective',
    }

def call(mode, cam, w, h):
    args = {'world':{'refPath':WORLD},'camera':cam,'mode':mode,
            'options':{'width':w,'height':h,'screenPercentage':1,'visualizationSubMode':''}}
    body = {'toolset_name':'SceneCaptureToolset.SceneCaptureToolset',
            'tool_name':'Capture','arguments':args}
    with tempfile.TemporaryDirectory() as tmp:
        request = Path(tmp)/'request.json'
        request.write_text(json.dumps(body),encoding='utf-8')
        response = subprocess.check_output(
            [sys.executable,str(ROOT/'mcp_client.py'),'call_tool',str(request)],timeout=200)
    return json.loads(response)['result']

def capture(tag, mode, cam, w, h, framing):
    result = call(mode,cam,w,h)
    value = result.get('structuredContent',{}).get('returnValue',{})
    data = next((x['data'] for x in result.get('content',[]) if x['type']=='image'),None) or value.get('image')
    if not isinstance(data,str):
        raise RuntimeError(str(result)[:1200])
    png = base64.b64decode(data.split(',')[-1])
    with Image.open(io.BytesIO(png)) as im:
        im.load()
        if im.size != (w,h):
            raise RuntimeError(f'{tag}: requested {w}x{h}, got {im.size}')
        mini = im.copy()
        mini.thumbnail((1200,1450), Image.Resampling.LANCZOS)
        preview = f'renders-hd/{tag}.preview.webp'
        mini.save(ROOT/preview, 'WEBP',quality=94,method=4)
    file = f'renders-hd/{tag}.png'
    (ROOT/file).write_bytes(png)
    return {'mode':mode,'file':file,'preview':preview,'width':w,'height':h,
            'framing':framing,'metadata':value.get('metadata',{}),'camera':cam,
            'warnings':value.get('warnings',[]),'method':'UE 官方 MCP 离屏单帧 · 100% 渲染比例'}

def main():
    folder = ROOT/'renders-hd'
    folder.mkdir(exist_ok=True)
    manifest = ROOT/'captures-hd.json'
    result = json.loads(manifest.read_text(encoding='utf-8')) if manifest.exists() else {}
    full = camera(73,334,105,86,85,45)
    rear = camera(73,-162,105,86,85,45)
    face = camera(73,205,153,86,141,29)
    fabric = camera(73,255,110,86,90,33)
    jobs = [
        ('front','Lit',full,1920,2400,'full'),
        ('face-Lit','Lit',face,2200,2200,'face'),
        ('dress-Lit','Lit',fabric,1920,2160,'dress'),
        ('reverse','Lit',rear,1760,2200,'rear'),
        *((m,m,full,1600,2000,'full') for m in MODES),
        *((f'face-{m}',m,face,1800,1800,'face') for m in DETAIL_MODES if m!='Lit'),
        *((f'dress-{m}',m,fabric,1600,1800,'dress') for m in
          ('BaseColor','Normal','Roughness','Metallic','SeparateTranslucencyRGB')),
    ]
    for tag,mode,cam,w,h,frame in jobs:
        if result.get(tag,{}).get('width') == w and (folder/(tag+'.png')).is_file():
            continue
        try:
            result[tag] = capture(tag,mode,cam,w,h,frame)
            print(f'{tag} {w}x{h}',flush=True)
        except Exception as exc:
            print(f'{tag} FAILED: {exc}',flush=True)
            continue
        temp = manifest.with_suffix('.tmp')
        temp.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
        temp.replace(manifest)

if __name__ == '__main__':
    main()

