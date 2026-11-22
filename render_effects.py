"""Capture isolated UE buffer views and one-parameter material comparisons."""
import argparse
import json
from pathlib import Path

from render_layers import CLOSE, INIT, ROOT, configure, grab, load
from ue_layer_client import run


MANIFEST = ROOT / 'effect-captures.json'
FOLDER = 'effect-renders'
COMMON_BUFFERS = ('BaseColor', 'Specular', 'Metallic', 'Roughness', 'Normal')
TRANSLUCENT = {'Brow', 'CorneaBlur', 'Feather'}


def save(report):
    temp = MANIFEST.with_suffix('.tmp')
    temp.write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temp.replace(MANIFEST)


def snapshot(row, label, mode='Lit', count=1):
    tag = f"{row['label']}-{label}"
    return grab(tag, row['isolated']['camera'], count, mode=mode, folder=FOLDER)


def capture_row(row, entries):
    slots = [slot for slot in row['slots'] if slot['triangles']]
    family = row['family']
    configure(slots, {})
    if family not in TRANSLUCENT:
        modes = COMMON_BUFFERS + (('MaterialAO',) if family == 'Hair' else ())
        for mode in modes:
            if mode not in entries:
                entries[mode] = snapshot(row, mode, mode)
                print(row['label'], mode, flush=True)

    variants = {}
    if family == 'Color':
        variants = {
            'matcap-off': {'MatcapIntensity': 0},
            'fresnel-on': {'Matcap边缘强度 (S)': 1},
        }
    elif family == 'Skin':
        variants = {'sss-off': {'3SIntensity': 0}}
    elif family == 'Eye':
        variants = {'specular-off': {'EyeSpecularIntensity': 0}}
    elif family == 'Hair':
        variants = {'scatter-off': {'散射度': 0}}
    elif family == 'Brow':
        variants = {
            'specular-off': {'SpecularIntensity': 0},
            'roughness-low': {'RoughnessIntensity': 0.25},
            'alpha-low': {'AlphaIntensity': 0.25},
        }
    elif family == 'Feather':
        variants = {
            'specular-off': {'高光度': 0},
            'roughness-low': {'粗糙度': 0.25},
            'normal-off': {'法线强度': 0},
        }
    for label, overrides in variants.items():
        if label in entries:
            continue
        configure(slots, {'overrides': overrides})
        entries[label] = {**snapshot(row, label, count=3), 'overrides': overrides}
        print(row['label'], label, flush=True)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--material', action='append', help='Exact short material name to capture')
    selected = parser.parse_args().material
    (ROOT / FOLDER).mkdir(exist_ok=True)
    rows = [r for r in load('layer-evidence.json')['materials'] if r['triangles']]
    if selected:
        rows = [row for row in rows if row['label'] in selected]
        if len(rows) != len(set(selected)):
            raise ValueError('Unknown or empty material in --material')
    report = load(MANIFEST.name) if MANIFEST.is_file() else {'materials': {}}
    try:
        print('UE scratch scene:', run(INIT), flush=True)
        for row in rows:
            entries = report['materials'].setdefault(row['key'], {})
            try:
                capture_row(row, entries)
            finally:
                save(report)
            print(f"{row['label']}: {len(entries)} effect captures", flush=True)
    finally:
        report['cleanup'] = run(CLOSE)
        save(report)
        print('UE cleanup:', report['cleanup'], flush=True)
        if not report['cleanup'].get('actorListRestored') or (
            report['cleanup']['dirtyMapsBefore'] != report['cleanup']['dirtyMapsAfter']
        ):
            raise RuntimeError('Scratch scene cleanup did not restore the editor state')


if __name__ == '__main__':
    main()
