"""Capture a fixed-camera Matcap close-up on a matching accessory slot."""
from render_effects import FOLDER, MANIFEST, save
from render_layers import CLOSE, INIT, camera, configure, grab, load
from ue_layer_client import run


def main():
    report = load(MANIFEST.name)
    row = next(row for row in load('layer-evidence.json')['materials'] if row['family'] == 'Color')
    entries = report['materials'][row['key']]
    slots = [slot for slot in row['slots'] if slot['component'].startswith('S0142AEA')]
    cam = camera(slots)
    variants = {
        'matcap-close-original': {},
        'matcap-close-off': {'MatcapIntensity': 0},
        'fresnel-close-on': {'Matcap边缘强度 (S)': 1},
    }
    try:
        run(INIT)
        for label, overrides in variants.items():
            configure(slots, {'overrides': overrides})
            entries[label] = {**grab(f"MI_Nikki_Color-{label}", cam, mode='BaseColor', folder=FOLDER),
                              'overrides': overrides, 'slots': [slot['slot'] for slot in slots]}
        print('Matcap close-up ready', flush=True)
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
