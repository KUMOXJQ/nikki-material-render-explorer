import unreal
from pathlib import Path
import json
root=Path(unreal.Paths.project_dir()).joinpath('NikkiRenderReport')
out=root/'textures'
out.mkdir(exist_ok=True)
d=json.loads((root/'audit.json').read_text(encoding='utf-8'))
result={}
for i,(k,v) in enumerate(d['textures'].items()):
    t=unreal.load_asset(k)
    if not isinstance(t,unreal.Texture2D):continue
    task=unreal.AssetExportTask()
    task.object=t
    task.filename=str(out/('%03d.png'%i))
    task.automated=True
    task.prompt=False
    task.replace_identical=True
    task.exporter=unreal.TextureExporterPNG()
    try:
        ok=unreal.Exporter.run_asset_export_task(task)
        result[k]={'file':'textures/%03d.png'%i} if ok and Path(task.filename).is_file() else {'error':str(task.errors)}
    except Exception as e:
        result[k]={'error':str(e)}
    await asyncio.sleep(0)
(root/'texture_images.json').write_text(json.dumps(result,ensure_ascii=False),encoding='utf-8')
{'ok':sum('file' in x for x in result.values()),'total':len(result)}

