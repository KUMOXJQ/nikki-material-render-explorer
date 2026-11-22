"""Read static LOD0 section coverage and exact world bounds without editing the world."""

import json
from pathlib import Path

import unreal

actor_subsystem = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
nikki = next(actor for actor in actor_subsystem.get_all_level_actors()
             if 'nikki' in actor.get_actor_label().lower())
lod = unreal.GeometryScriptMeshReadLOD(
    lod_type=unreal.GeometryScriptLODType.RENDER_DATA, lod_index=0)
copy_options = unreal.GeometryScriptCopyMeshFromAssetOptions()
geometry = {}

def as_tuple(vector):
    return [vector.x, vector.y, vector.z]

for component in nikki.get_components_by_class(unreal.StaticMeshComponent):
    asset = component.get_editor_property('static_mesh')
    if not asset:
        continue
    source, outcome = unreal.GeometryScript_AssetUtils.copy_mesh_from_static_mesh_v2(
        asset, unreal.new_object(unreal.DynamicMesh), copy_options, lod, True)
    if outcome != unreal.GeometryScriptOutcomePins.SUCCESS:
        raise RuntimeError(f'GeometryScript did not copy LOD0 of {asset.get_path_name()}')
    slot_count = component.get_num_materials()
    if slot_count == 1:
        pieces = {0: source}
    else:
        pool = unreal.new_object(unreal.DynamicMeshPool)
        _, meshes, material_ids = unreal.GeometryScript_MeshDecomposition.split_mesh_by_material_i_ds(
            source, pool)
        pieces = dict(zip(material_ids, meshes))
    triangle_sum = sum(piece.get_triangle_count() for piece in pieces.values())
    if triangle_sum != source.get_triangle_count() or triangle_sum != asset.get_num_triangles(0):
        raise RuntimeError(f'Split of {asset.get_path_name()} did not conserve triangles')
    section_count = sum(piece.get_triangle_count() > 0 for piece in pieces.values())
    if section_count != asset.get_num_sections(0):
        raise RuntimeError(f'LOD0 section count differs for {asset.get_path_name()}')
    transform = component.get_world_transform()
    slots = {}
    for slot in range(slot_count):
        piece = pieces.get(slot)
        triangles = piece.get_triangle_count() if piece else 0
        if triangles:
            piece.transform_mesh(transform)
            bounds = piece.get_mesh_bounding_box()
            slots[slot] = {'triangles': triangles, 'min': as_tuple(bounds.min),
                           'max': as_tuple(bounds.max)}
        else:
            slots[slot] = {'triangles': 0, 'min': None, 'max': None}
    geometry[component.get_name()] = slots

output_path = Path(unreal.Paths.project_dir()).resolve() / 'NikkiRenderReport' / 'slot-geometry.json'
output_path.write_text(json.dumps(geometry, indent=2, ensure_ascii=False), encoding='utf-8')
{'components': len(geometry), 'slots': sum(map(len, geometry.values())),
 'triangles': sum(value['triangles'] for entry in geometry.values() for value in entry.values())}


