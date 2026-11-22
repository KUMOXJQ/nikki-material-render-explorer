import json
from pathlib import Path

from effect_report import assemble

root=Path(__file__).resolve().parent
def read(name):
    path=root/name
    return json.loads(path.read_text(encoding='utf-8-sig')) if path.exists() else {}

data=read('audit.json')
data['images']=read('texture_images.json')
native=read('captures-hd.json')
stable=read('captures-stable.json')
data['captures']={**read('captures.json'),**native,**stable}
for key in stable:
    if key in native:
        data['captures'][key+'-native']={**native[key], 'variant':'native'}
for family, routes in read('named-reroutes.json').items():
    graph = next(g for k,g in data['graphs'].items() if k.endswith('.M_Nikki_'+family))
    for use,decl in routes.items():
        graph['nodes'][int(use)]['inputs'].append({'pin':'具名转接','source':decl,'output':'声明'})
data['lessons']=read('lessons.json')
data['instanceRender']=read('instance-render.json')
data['layerEvidence']=read('layer-evidence.json')
for row in data['layerEvidence'].get('materials',[]):
    material=data['materials'][row['key']]
    effective=data['instanceRender'].get(row['key'],{}).get('effective',{})
    row['surface']={name:effective[name] for name in ('blend_mode','shading_model','two_sided') if name in effective}
    original={p['name']:p['value'] for kind in material['parameters'].values() for p in kind}
    names=list(dict.fromkeys(name for step in row['stages'] for name in step.get('overrides',{})))
    for step in row['stages']:
        overrides=step.get('overrides',{})
        step['values']=[{'name':n, 'current':overrides.get(n,original[n]),'authored':original[n],
                         'modified':n in overrides} for n in names]

definitions=read('effect-definitions.json')
data['effects']=assemble(data,definitions,read('effect-captures.json')) if definitions else {}

(root/'data.js').write_text('window.NIKKI = '+json.dumps(data,ensure_ascii=False,separators=(',',':'))+';\n',encoding='utf-8')

