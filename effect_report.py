"""Assemble per-material effect explanations, authored values and verified UE images."""
import json


BUFFER_NAMES = {
    'BaseColor': '基础色 · Base Color',
    'Specular': '高光输入 · Specular',
    'Metallic': '金属度 · Metallic',
    'Roughness': '粗糙度 · Roughness',
    'Normal': '世界法线 · World Normal',
    'MaterialAO': '材质环境遮蔽 · Material AO',
}
MASKED = {'Clothes', 'Hair', 'Eyelash'}


def short(path):
    return path.rsplit('.', 1)[-1]


def labelled(entry, title):
    return {'mode': 'Lit', **entry, 'title': title} if entry and entry.get('file') else None


def stages(row):
    return {step['id']: step for step in row.get('stages', [])}


def images_for(effect, row, render):
    if not row.get('triangles') or effect['status'] == 'absent':
        return [], 'graph'
    family, identifier = row['family'], effect['id']
    step = stages(row)
    actual = row.get('isolated')
    pairs = {
        ('Color', 'matcap'): ('matcap-off', 'MatcapIntensity = 0'),
        ('Color', 'fresnel'): ('fresnel-on', '实验 · 边缘强度 = 1'),
        ('Skin', 'sss'): ('sss-off', '实验 · 3SIntensity = 0'),
        ('Eye', 'specular'): ('specular-off', '实验 · EyeSpecularIntensity = 0'),
        ('Hair', 'metallic'): ('scatter-off', '实验 · 散射度 = 0'),
        ('Brow', 'specular'): ('specular-off', '实验 · SpecularIntensity = 0'),
        ('Brow', 'roughness'): ('roughness-low', '实验 · RoughnessIntensity = 0.25'),
        ('Brow', 'alpha'): ('alpha-low', '实验 · AlphaIntensity = 0.25'),
        ('Feather', 'specular'): ('specular-off', '实验 · 高光度 = 0'),
        ('Feather', 'roughness'): ('roughness-low', '实验 · 粗糙度 = 0.25'),
        ('Feather', 'normal'): ('normal-off', '实验 · 法线强度 = 0'),
    }
    if family == 'Color' and identifier in {'matcap', 'fresnel'}:
        other = 'matcap-close-off' if identifier == 'matcap' else 'fresnel-close-on'
        label = 'MatcapIntensity = 0' if identifier == 'matcap' else '实验 · 边缘强度 = 1'
        if render.get('matcap-close-original') and render.get(other):
            return [labelled(render['matcap-close-original'], '饰件近景 · 原实例 Base Color'),
                    labelled(render[other], f'饰件近景 · {label}')], 'override'
    if (family, identifier) in pairs:
        capture, title = pairs[family, identifier]
        if render.get(capture) and actual:
            return [labelled(actual, '原实例 · UE Lit'), labelled(render[capture], title)], 'override'
    if family == 'CorneaBlur' and identifier == 'alpha':
        return [labelled(step.get('cornea-off'), '同场景 · 遮罩 G 置零'),
                labelled(step.get('final'), '同场景 · 恢复角膜遮罩')], 'override'
    if family == 'Eye' and identifier == 'eye-light':
        return [labelled(step.get('eye-base'), '亮斑纹理 A/B 均关闭'),
                labelled(step.get('eye-b'), '恢复亮斑 A/B · 法线和高光保持关闭')], 'override'
    if family == 'Clothes' and identifier in {'tile-normal', 'secondary'} and effect['status'] == 'connected':
        if identifier == 'tile-normal':
            before = step.get('cloth-deal') or step.get('cloth-normal')
            return [labelled(before, '平铺法线权重为 0'), labelled(step.get('cloth-tile'), '仅恢复平铺法线')], 'override'
        return [labelled(step.get('cloth-normal'), '第二层 Alpha 置零'),
                labelled(step.get('cloth-deal'), '恢复第二层纹理与混合')], 'override'
    if family in MASKED and identifier == 'alpha' and effect['status'] == 'connected':
        return [labelled(row.get('geometry'), '中性几何 · 完整网格'),
                labelled(actual, '原材质 · 启用遮罩')], 'compare'

    buffer = 'MaterialAO' if family == 'Hair' and identifier == 'ao' else effect.get('mode')
    if buffer in BUFFER_NAMES and render.get(buffer) and effect['status'] != 'inactive':
        return [labelled(actual, '原实例 · UE Lit'), labelled(render[buffer], BUFFER_NAMES[buffer])], 'diagnostic'
    if family in {'CorneaBlur', 'Brow', 'Feather'} and effect['status'] != 'inactive':
        return [labelled(actual, '原实例 · UE Lit 参考')], 'graph'
    return [], 'graph'


def clothing_effects(parameters):
    return [
        {
            'id': 'tile-normal', 'title': '平铺微细法线', 'node': 29,
            'status': 'connected' if parameters.get('TileNormal?') else 'inactive',
            'body': '开启时，平铺法线经缩放、FlattenNormal 和角度修正法线混合，叠到主层法线上。',
            'parameters': ['TileNormal?', 'ClothesTileNormal', 'ClothesTileNormalUV', 'Tile法线强度'],
        },
        {
            'id': 'secondary', 'title': '服装第二层混合', 'node': 48,
            'status': 'connected' if parameters.get('DealAlpha?') else 'inactive',
            'body': '第二层的贴图 Alpha 混合两套 Material Attributes，也会改变局部颜色、法线和其他表面参数。',
            'parameters': ['DealAlpha?', 'ClothesDeal', 'ClothesDealNormal', 'ClothesDealM'],
        },
    ]


def facts(effect, family, parameters, surface, material_name):
    effect_id = effect['id']
    status = effect['status']
    detail = ''
    if family == 'Clothes':
        secondary = parameters.get('DealAlpha?', False)
        tile = parameters.get('TileNormal?', False)
        if effect_id == 'normal':
            status = 'connected'
            detail = f"当前使用主层法线。平铺法线{'开启' if tile else '关闭'}，第二层法线{'开启' if secondary else '关闭'}。"
        elif effect_id == 'metallic':
            mapped = parameters.get('ClothesMTex_?', False)
            secondary_text = '第二层读取自己的 M 图或标量，按 Alpha 混合。' if secondary else '第二层没有参与输出。'
            status = 'connected'
            if mapped:
                detail = '主层读取 ClothesM 的 R 通道。' + secondary_text
            else:
                detail = f"主层使用金属度标量 {parameters.get('金属度', 0):g}。" + secondary_text
        elif effect_id == 'roughness':
            status = 'connected'
            if parameters.get('ClothesMTex_?'):
                source = '1−ClothesM.G' if parameters.get('G粗糙度反向?') else 'ClothesM.G'
                detail = f'主层读取 {source} 后乘粗糙度倍率。'
            else:
                detail = f"主层使用粗糙度标量 {parameters.get('粗糙度', 0):g}。"
        elif effect_id == 'alpha':
            status = 'connected' if 'MASKED' in surface else 'inactive'
            detail = '当前实例使用 Masked，透明度遮罩决定裁切区域。' if status == 'connected' else '当前实例使用 Opaque，第二层混合 Alpha 仍由 DealAlpha? 控制。'
    if family == 'Skin' and effect_id in {'metallic', 'lipstick'} and parameters.get('MakeUpLipstick') is False:
        status = 'inactive'
        detail = 'MakeUpLipstick 关闭。底层沿用默认金属度，唇妆分支没有贡献。'
    if family == 'Color' and effect_id in {'fresnel', 'matcap'} and material_name == 'MI_Nikki_Color':
        if effect_id == 'fresnel':
            detail = '以 S0142AEA 上对应的饰件槽为固定机位近景。实验图将边缘强度设为 1，只改变 Matcap 的采样 UV。原值为 0。'
        else:
            detail = '以 S0142AEA 上对应的饰件槽为固定机位近景，单独改变 MatcapIntensity，读取 Base Color 缓冲。'
    if family == 'Eye' and effect_id == 'matcap':
        strength = parameters.get('MatcapIntensity', 0)
        status = 'inactive' if strength == 0 else 'connected'
        detail = f'当前条目的 MatcapIntensity 为 {strength:g}。'
    if family == 'Eye' and effect_id == 'fresnel':
        detail = f"当前 MatcapIntensity = {parameters.get('MatcapIntensity', 0):g}，边缘强度 = {parameters.get('Matcap边缘强度 (S)', 0):g}。"
    if family == 'Hair' and effect_id == 'ao':
        detail = '可对照同机位的 UE Material AO 缓冲。此图读取材质 AO 输入，画面亮度不能直接作为贴图通道值。'
    if family == 'CorneaBlur' and effect_id == 'specular' and parameters.get('SpecularIntensity') == 0:
        status = 'inactive'
        detail = '当前 SpecularIntensity 为 0；画面可见的眼内亮斑来自眼球材质。'
    if family == 'Feather' and effect_id in {'sss', 'ao'}:
        status = 'conditional'
        detail = '图中可追溯该输入。Lit 图包含整套透明着色，无法单独读出这一项。'
    if family == 'Other':
        if material_name == 'WorldGridMaterial':
            if effect_id in {'specular', 'metallic'}:
                status = 'absent'
                effect['body'] = 'WorldGridMaterial 没有对应的显式输出接线，使用引擎默认处理。'
            elif effect_id == 'normal':
                status = 'connected'
            if effect_id == 'normal':
                effect['body'] = 'WorldGridMaterial 从 T_Default_Material_Grid_N 采样并写入 Normal。'
            elif effect_id == 'roughness':
                effect['body'] = 'WorldGridMaterial 把格纹掩码与距离权重合成，再限制在 Roughness 的有效范围。'
            detail = 'Nikki 的 7 个同名绑定槽在 LOD0 均没有渲染截面。'
        else:
            if effect_id in {'specular', 'metallic'}:
                status = 'connected'
            elif effect_id == 'normal':
                status = 'absent'
            if effect_id == 'base':
                effect['body'] = '地面材质使用 Color.RGB 直接输出 Base Color。'
            elif effect_id == 'normal':
                effect['body'] = '地面材质沿用网格表面方向，没有额外的 Normal 输出接线。'
            elif effect_id in {'specular', 'metallic', 'roughness'}:
                outputs = {'specular': 'Specular', 'metallic': 'Metallicity', 'roughness': 'Roughness'}
                channel = {'specular': 'G', 'metallic': 'R', 'roughness': 'B'}
                effect['body'] = f"向量“参数”的 {channel[effect_id]} 分量直接接到 {outputs[effect_id]}。"
            detail = '这是场景地面的材质数据。'
    return status, detail


def assemble(data, definitions, captures):
    captures_by_material = captures.get('materials', {})
    bound_rows = {row['key']: row for row in data['layerEvidence'].get('materials', [])}
    functions = {short(key):key for key in data['graphs']}
    output = {}
    for key, material in data['materials'].items():
        graph_key = material.get('parent') or key
        family = short(graph_key).removeprefix('M_Nikki_') if '.M_Nikki_' in graph_key else 'Other'
        params = {p['name']: p['value'] for kind in material.get('parameters', {}).values() for p in kind}
        if family == 'CorneaBlur':
            params['TearsMaskRGBA'] = 'G'
        if family == 'Skin':
            params['LipstickMaskRGBA'] = 'B'
        surface = str(data['instanceRender'].get(key, {}).get('effective', {}).get('blend_mode', ''))
        definitions_for_material = definitions[family] + (clothing_effects(params) if family == 'Clothes' else [])
        effects = []
        for template in definitions_for_material:
            effect = dict(template)
            status, detail = facts(effect, family, params, surface, short(key))
            effect.update(status=status, detail=detail, graphKey=graph_key)
            if effect['id'] == 'fresnel' and family in {'Clothes','Eye','Color'} and 'MF_Matcap' in functions:
                effect.update(graphKey=functions['MF_Matcap'], node=17)
            if family == 'Other':
                if short(key) == 'WorldGridMaterial' and effect['id'] == 'base':
                    effect['body'] = '引擎格纹由掩码和距离混合驱动。'
                properties = {'base': 'MP_BASE_COLOR', 'specular': 'MP_SPECULAR',
                              'metallic': 'MP_METALLIC', 'roughness': 'MP_ROUGHNESS', 'normal': 'MP_NORMAL'}
                prop = properties.get(effect['id'])
                target = data['graphs'].get(graph_key, {}).get('outputs', {}).get(prop)
                if target is not None:
                    effect['node'] = target['node']
            preview, evidence_type = images_for(effect, bound_rows.get(key, {}), captures_by_material.get(key, {}))
            effect['mode'] = evidence_type
            effect['images'] = [item for item in preview if item]
            effect['parameters'] = [{'name': name, 'value': params[name]} for name in template['parameters'] if name in params]
            effects.append(effect)
        output[key] = {'family': family, 'effects': effects}
    return output
