import json
from pathlib import Path
from PIL import Image

root=Path(__file__).resolve().parent
folder=root/'channels'
folder.mkdir(exist_ok=True)
manifest=root/'texture_images.json'
data=json.loads(manifest.read_text(encoding='utf8'))
for item in data.values():
    if 'file' not in item:
        continue
    source=root/item['file']
    with Image.open(source) as image:
        rgba=image.convert('RGBA')
        rgba.thumbnail((600,600))
        item['channels']={}
        for channel in 'RGBA':
            target=folder/(source.stem+'-'+channel+'.png')
            rgba.getchannel(channel).save(target)
            item['channels'][channel]=target.relative_to(root).as_posix()
manifest.write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf8')
