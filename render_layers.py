"""Generate per-material mesh-isolation and material-ablation evidence with UE MCP."""
import base64
import io
import json
import math
from pathlib import Path
import sys

import numpy as np
from PIL import Image

from capture_hd import call
from ue_layer_client import run
from layer_plans import make, FINAL

ROOT=Path(__file__).resolve().parent
OUTPUT=ROOT/'layer-renders'
MANIFEST=ROOT/'layer-evidence.json'
W,H=1440,1440
X_OFFSET=1350
INIT="""import builtins
from pathlib import Path
import sys
p=Path(unreal.Paths.project_dir()).resolve()/'NikkiRenderReport'
if str(p) not in sys.path:sys.path.insert(0,str(p))
import ue_layer_scene
if hasattr(builtins,'_nikki_stage'):
    builtins._nikki_stage.close()
builtins._nikki_stage=ue_layer_scene.Stage()
{'clones':len(builtins._nikki_stage.clones),'dirtyMapsBefore':builtins._nikki_stage.dirty_before}
"""
CLOSE="""import builtins
if hasattr(builtins,'_nikki_stage'):
    out=builtins._nikki_stage.close()
    del builtins._nikki_stage
else:
    out={'notActive':True}
out
"""
CODES=np.arange(256,dtype=np.float32)/255
LINEAR=np.where(CODES<=0.04045,CODES/12.92,((CODES+0.055)/1.055)**2.4)

def load(filename):
    return json.loads((ROOT/filename).read_text(encoding='utf-8-sig'))

def short(path):
    return path.split('.')[-1]

def camera(slots):
    visible=[s for s in slots if s['triangles']]
    low=[min(s['min'][dim] for s in visible) for dim in range(3)]
    high=[max(s['max'][dim] for s in visible) for dim in range(3)]
    center=[(a+b)*.5 for a,b in zip(low,high)]
    extent=[(b-a)*.5 for a,b in zip(low,high)]
    fov=38
    view=math.tan(math.radians(fov/2))
    distance=max(extent[0],extent[2])*1.28/view+extent[1]+3
    return {'location':{'x':center[0]+X_OFFSET,'y':center[1]+distance,'z':center[2]},
            'rotation':{'pitch':0,'yaw':-90,'roll':0},'fOV':fov,
            'perspectiveNearClipPlane':max(.3,min(8,distance*.1)),
            'projectionMode':'Perspective'}

def configure(slots,step,context=()):
    args=json.dumps([slots,step,context],ensure_ascii=True,separators=(',',':'))
    return run('import builtins\nimport json\nslots,plan,ctx=json.loads('+repr(args)+')\n'+
               'builtins._nikki_stage.configure(slots,plan,ctx)\nTrue')

def grab(tag,cam,count=1):
    image=None
    total=np.zeros((H,W,3),dtype=np.float32) if count>1 else None
    for i in range(count):
        result=call('Lit',cam,W,H)
        data=next((e['data'] for e in result.get('content',[]) if e['type']=='image'),None)
        if not data:
            raise RuntimeError(str(result)[:1000])
        with Image.open(io.BytesIO(base64.b64decode(data))) as source:
            if source.size!=(W,H):
                raise RuntimeError(f'Unexpected frame {source.size}')
            image=source.convert('RGB')
        if total is not None:
            total+=LINEAR[np.asarray(image)]
    if total is not None:
        total/=count
        rgb=np.where(total<=.0031308,total*12.92,1.055*np.power(total,1/2.4)-.055)
        image=Image.fromarray(np.rint(rgb*255).clip(0,255).astype(np.uint8))
    file='layer-renders/'+tag+'.png'
    preview='layer-renders/'+tag+'.webp'
    image.save(ROOT/file)
    image.thumbnail((900,900),Image.Resampling.LANCZOS)
    image.save(ROOT/preview,'WEBP',quality=94,method=4)
    return {'file':file,'preview':preview,'width':W,'height':H,'camera':cam,
            'frameCount':count,'method':'UE 官方 MCP · Lit 离屏'+(f' · 同机位 {count} 帧合成' if count>1 else ' · 单帧')}

def save(report):
    tmp=MANIFEST.with_suffix('.tmp')
    tmp.write_text(json.dumps(report,ensure_ascii=False,indent=2),encoding='utf-8')
    tmp.replace(MANIFEST)

def group(audit,geom):
    grouped={}
    for c in audit['components']:
        for s in c['slots']:
            k=s['material']
            grouped.setdefault(k,[]).append({'component':c['name'],'index':s['index'],
                'slot':s['slot'],'mesh':c['mesh'],**geom[c['name']][str(s['index'])]})
    return grouped

def capture_material(k,slots,audit,groups):
    label=short(k)
    parent=audit['materials'][k]['parent']
    family=short(parent).removeprefix('M_Nikki_') if parent else 'Other'
    used=[s for s in slots if s['triangles']]
    row={'key':k,'family':family,'label':label,'graphKey':parent or k,'slots':slots,
         'triangles':sum(s['triangles'] for s in slots),'stages':[]}
    if not used:
        row['notes']='绑定保留在材质槽。当前静态网格 LOD0 没有渲染节与三角面可供单独捕捉。'
        return row
    if not parent:
        raise RuntimeError(f'Unexpected renderable parentless binding {label}')
    cam=camera(used)
    configure(used,{'geometry':True})
    row['geometry']=grab(label+'-mesh',cam)
    row['geometry']['title']='目标槽 · 中性几何'
    row['geometry']['body']='仅用中性灰显示该槽原始三角面。示意几何，保留贴图裁切前的网格范围。'
    configure(used,{})
    row['isolated']=grab(label+'-isolated',cam,3)
    cam_context=[]
    if family=='CorneaBlur':
        cam_context=[s for path,v in groups.items() if short(path) in ('MI_Nikki_Eye','MI_Nikki_SkinFace') for s in v]
        row['notes']='独立图只含角膜透明壳。分层过程同时保留眼球和脸部，让透明层的合成差异可以对比。'
    else:
        row['notes']='此材质关联的所有有三角面的槽一起显示。中间图沿用原实例着色模型和静态开关，按步骤暂时覆盖参数。'
    params=audit['materials'][k]['parameters']
    switches={p['name']:p['value'] for p in params['static_switch']}
    by_type={p['name']:p['value'] for item in params.values() for p in item}
    stages=make(family,switches)
    for step in stages:
        overrides=step['overrides']
        missing=set(overrides)-set(by_type)
        if missing: raise RuntimeError(f'{label}: missing parameters {missing}')
        configure(used,step,cam_context)
        detail=grab(label+'-'+step['id'],cam)
        step.update(detail)
        step['changes']=[f'{n} = '+('RGBA(0,0,0,0)' if v=='ZERO_RGBA' else str(v)) for n,v in overrides.items()]
        step['changes'] += [f'{n} 恢复到实例值' for n in stages[0]['overrides'] if n not in overrides]
        step['graphKey']=parent
    final=row['isolated']
    if cam_context:
        configure(used,{},cam_context)
        final=grab(label+'-context-final',cam,3)
    stages.append({'id':'final','title':'原始材质 · 完整结果','body':FINAL[family],
                   'changes':['全部参数恢复为此槽绑定实例的原值'],**final})
    row['stages']=stages
    return row

def main():
    OUTPUT.mkdir(exist_ok=True)
    audit=load('audit.json')
    geom=load('slot-geometry.json')
    groups=group(audit,geom)
    report=load(MANIFEST.name) if MANIFEST.is_file() else {'version':3,'materials':[]}
    done={r['key'] for r in report['materials']}
    order=['SkinFace','Eye','Hair','ClothesA','CorneaBlur','FeatherA','Brow','Eyelash','Color','SkinBody']
    def priority(k):
        key=short(k).removeprefix('MI_Nikki_')
        return (order.index(key) if key in order else len(order),key)
    try:
        print('UE stage:',run(INIT),flush=True)
        for k in sorted(groups,key=priority):
            if k in done: continue
            row=capture_material(k,groups[k],audit,groups)
            report['materials'].append(row)
            save(report)
            print(short(k),row['triangles'],len(row['stages']),flush=True)
    finally:
        report['cleanup']=run(CLOSE)
        save(report)
        print('UE cleanup:',report['cleanup'],flush=True)

def angled():
    report=load(MANIFEST.name)
    try:
        print('UE angle stage:',run(INIT),flush=True)
        for row in report['materials']:
            if not row.get('isolated') or row.get('angle'):
                continue
            slots=[s for s in row['slots'] if s['triangles']]
            base=camera(slots)
            center=[(min(s['min'][i] for s in slots)+max(s['max'][i] for s in slots))/2 for i in range(3)]
            angle=math.radians(36)
            distance=(base['location']['y']-center[1])*1.08
            cam={**base,'location':{'x':center[0]+X_OFFSET+distance*math.sin(angle),
                 'y':center[1]+distance*math.cos(angle),'z':center[2]},
                 'rotation':{'pitch':0,'yaw':-126,'roll':0}}
            configure(slots,{})
            row['angle']=grab(row['label']+'-angle',cam,2)
            save(report)
            print(row['label']+' angle',flush=True)
    finally:
        report['cleanupAngled']=run(CLOSE)
        save(report)
        print('UE angle cleanup:',report['cleanupAngled'],flush=True)


if __name__=='__main__':
    if len(sys.argv)>1 and sys.argv[1]=='--cleanup':
        print(run(CLOSE))
    elif '--angles' in sys.argv:
        angled()
    else:
        main()

