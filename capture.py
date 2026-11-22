import base64,json,subprocess,sys,tempfile,math
from pathlib import Path
root=Path(__file__).resolve().parent
def call(name,args):
    with tempfile.TemporaryDirectory() as tmp:
        request=Path(tmp)/'request.json'
        request.write_text(json.dumps({'toolset_name':'SceneCaptureToolset.SceneCaptureToolset','tool_name':name,'arguments':args}),encoding='utf8')
        return json.loads(subprocess.check_output([sys.executable,str(root/'mcp_client.py'),'call_tool',str(request)]))['result']
def capture(cam,mode,tag,w,h):
    result=call('Capture',{'world':{'refPath':'/Game/Character/Character.Character'},'camera':cam,'mode':mode,'options':{'width':w,'height':h,'screenPercentage':1,'visualizationSubMode':''}})
    entries=result.get('content',[])
    item=next((x for x in entries if x['type']=='image'),{})
    value=result.get('structuredContent',{}).get('returnValue',{})
    data=item.get('data') or value.get('image')
    if not isinstance(data,str) or len(data)<200:
        return {'mode':mode,'error':str(result)[:1200]}
    file='renders/'+tag+'.png'
    (root/file).write_bytes(base64.b64decode(data.split(',')[-1]))
    return {'mode':mode,'file':file,'metadata':value.get('metadata',{}),'camera':cam,'warnings':value.get('warnings',[])}
def camera(x,y,z,ty,tz,fov):
    return {'location':{'x':x,'y':y,'z':z},'rotation':{'pitch':math.degrees(math.atan2(tz-z,abs(y-ty))),'yaw':90 if y<ty else -90,'roll':0},'fOV':fov,'projectionMode':'Perspective'}
(root/'renders').mkdir(exist_ok=True)
result=json.loads((root/'captures.json').read_text(encoding='utf8')) if (root/'captures.json').exists() else {}
jobs=[('front',camera(73,385,105,86,83,45),'Lit',640,800),('reverse',camera(73,-213,105,86,83,45),'Lit',640,800)]
front=camera(73,385,105,86,83,45)
detail=camera(73,205,153,86,141,29)
jobs += [(mode,front,mode,640,800) for mode in ('BaseColor','Normal','Roughness','Metallic','Specular','ShadingModel','Opacity','SubsurfaceColor','SeparateTranslucencyRGB','DetailLighting','Unlit','SceneDepth','ShaderComplexity')]
jobs += [('face-'+mode,detail,mode,640,640) for mode in ('Lit','BaseColor','Normal','Roughness')]
for tag,cam,mode,w,h in jobs:
    if 'file' in result.get(tag,{}):
        continue
    result[tag]=capture(cam,mode,tag,w,h)
    print(tag,str(result[tag])[:190],flush=True)
    (root/'captures.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')
(root/'captures.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf8')

