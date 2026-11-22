"""Combine independent UE Lit readbacks in display-linear space at fixed camera."""
import base64
import io
import json
from pathlib import Path
import numpy as np
from PIL import Image
from capture_hd import call

ROOT = Path(__file__).resolve().parent
SOURCE = json.loads((ROOT/'captures-hd.json').read_text(encoding='utf-8'))
MANIFEST = ROOT/'captures-stable.json'
JOBS = [('face-Lit',2600,2600),('front',2560,3200),('dress-Lit',2240,2520)]
SAMPLES = 12
CODES = np.arange(256,dtype=np.float32)/255
LINEAR = np.where(CODES<=0.04045,CODES/12.92,((CODES+0.055)/1.055)**2.4)

def accumulate(key,w,h):
    src = SOURCE[key]
    cam = src['camera']
    total = np.zeros((h,w,3),dtype=np.float32)
    for index in range(SAMPLES):
        result = call('Lit',cam,w,h)
        data = next((part['data'] for part in result.get('content',[]) if part['type']=='image'),None)
        if not data:
            raise ValueError(str(result)[:1000])
        with Image.open(io.BytesIO(base64.b64decode(data))) as image:
            if image.size != (w,h):
                raise ValueError(f'{key}: {image.size} != {(w,h)}')
            pixels = np.asarray(image.convert('RGB'),dtype=np.uint8)
            total += LINEAR[pixels]
        if index % 3 == 2:
            print(f'{key} {index+1}/{SAMPLES}',flush=True)
    total /= SAMPLES
    rgb = np.where(total<=0.0031308,total*12.92,1.055*np.power(total,1/2.4)-0.055)
    im = Image.fromarray(np.rint(rgb*255).clip(0,255).astype(np.uint8))
    file = f'renders-hd/stable-{key}.png'
    im.save(ROOT/file)
    im.thumbnail((1400,1750),Image.Resampling.LANCZOS)
    preview = f'renders-hd/stable-{key}.preview.webp'
    im.save(ROOT/preview,'WEBP',quality=95,method=4)
    result = result.get('structuredContent',{}).get('returnValue',{})
    return {**src,'file':file,'preview':preview,'width':w,'height':h,
            'metadata':result.get('metadata',src['metadata']), 'warnings':result.get('warnings',[]),
            'method':f'UE 官方 MCP 固定机位 · {SAMPLES} 张 Lit 图在线性显示空间合成',
            'frameCount':SAMPLES}

if __name__ == '__main__':
    results = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.is_file() else {}
    for key,w,h in JOBS:
        if key not in results:
            results[key] = accumulate(key,w,h)
            MANIFEST.write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
            print(f'{key} ready {w}x{h}',flush=True)
