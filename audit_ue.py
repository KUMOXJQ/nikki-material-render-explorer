import unreal
from pathlib import Path
import json
import re
U=unreal
lib=U.MaterialEditingLibrary
reg=U.AssetRegistryHelpers.get_asset_registry()
base=Path(U.Paths.project_dir()).joinpath('NikkiRenderReport')
inv=json.loads(base.joinpath('inventory.json').read_text(encoding='utf-8'))
def p(o,k,d=None):
    try: return o.get_editor_property(k)
    except Exception: return d
def f(o,k,*args,d=None):
    try: return getattr(o,k)(*args)
    except Exception: return d
def path(o): return o.get_path_name() if o else None
def val(x):
    if isinstance(x,U.Object):return path(x)
    if isinstance(x,(bool,int,float,str)) or x is None:return x
    if isinstance(x,U.LinearColor):return [x.r,x.g,x.b,x.a]
    return str(x)
def props(o,names):
    return {k:val(p(o,k)) for k in names.split() if p(o,k) is not None}
def mesh_slots(mesh):
    result=[]
    for m in p(mesh,'materials',p(mesh,'static_materials',[])):
        result.append({'slot':str(p(m,'material_slot_name')),'material':path(p(m,'material_interface'))})
    return result
assets={}; materials={}; textures={}; meshes={}; graphs={}
pending=set(x['path'] for x in inv['inventory'] if x['type'] in ['Material','MaterialInstanceConstant','Texture2D','StaticMesh','SkeletalMesh','SubsurfaceProfile'])
seen=set()
actorlist=U.get_editor_subsystem(U.EditorActorSubsystem).get_all_level_actors()
components=[]; lighting=[]
for a in actorlist:
    cls=a.get_class().get_name()
    comps=[]
    for c in a.get_components_by_class(U.ActorComponent):
        mesh=f(c,'get_skeletal_mesh_asset') or p(c,'static_mesh')
        if mesh:
            slots=[]
            defaults=mesh_slots(mesh)
            for i in range(c.get_num_materials()):
                material=path(c.get_material(i))
                stock=defaults[i]['material'] if i<len(defaults) else None
                slots.append({'index':i,'slot':str(c.get_material_slot_names()[i]) if i<len(c.get_material_slot_names()) else str(i),'material':material,'meshDefault':stock,'differs':material!=stock})
                if material:pending.add(material.split('.')[0])
            pending.add(path(mesh).split('.')[0])
            if 'nikki' in a.get_actor_label().lower():
                components.append({'name':c.get_name(),'actor':a.get_actor_label(),'path':path(c),'mesh':path(mesh),'visible':f(c,'is_visible'),'settings':props(c,'cast_shadow render_in_main_pass render_in_depth_pass render_custom_depth custom_depth_stencil_value translucency_sort_priority forced_lod_model'),'slots':slots})
        if cls!='BP_Nikki_熠熠舞曲':
            settings=props(c,'intensity light_color use_temperature temperature cast_shadows source_angle source_soft_angle mobility source_type cubemap real_time_capture fog_density fog_height_falloff start_distance volumetric_fog atmosphere_sun_light indirect_lighting_intensity volumetric_scattering_intensity')
            if settings: comps.append({'class':c.get_class().get_name(),'properties':settings})
    extra=props(a,'enabled unbound blend_weight priority')
    settings=p(a,'settings')
    if settings:
        for k in dir(settings):
            if k.startswith('override_') and p(settings,k,False):
                extra[k[9:]]=val(p(settings,k[9:]))
    if 'nikki' not in a.get_actor_label().lower():lighting.append({'label':a.get_actor_label(),'class':cls,'actor':extra,'components':comps})
opts=U.AssetRegistryDependencyOptions()
def deps(pkg):
    return sorted(str(s) for s in reg.get_dependencies(pkg,opts) or [])
def enqueue(d):
    if d.startswith(('/Game/','/Engine/')):
        a=reg.get_assets_by_package_name(d)
        if a and str(a[0].asset_class_path.asset_name).startswith(('Material','Texture','Subsurface')):pending.add(d)
settings='blend_mode shading_model material_domain two_sided opacity_mask_clip_value use_material_attributes tangent_space_normal dithered_lod_transition translucency_pass translucency_lighting_mode disable_depth_test shading_rate cast_dynamic_shadow_as_masked blendable_location blendable_priority subsurface_profile toon_profile'
def params(o):
    result={}
    for typ in ('scalar','vector','texture','static_switch'):
        entries=[]
        names=f(lib,'get_'+typ+'_parameter_names',o,d=[])
        for n in names:
            method='get_material_instance_'+typ+'_parameter_value' if isinstance(o,U.MaterialInstanceConstant) else 'get_material_default_'+typ+'_parameter_value'
            v=val(f(lib,method,o,n))
            if typ=='texture' and v:pending.add(v.split('.')[0])
            entries.append({'name':str(n),'value':v})
        result[typ]=entries
    return result
def graph(o):
    is_function=isinstance(o,U.MaterialFunction)
    nodes=f(lib,'get_material_function_expressions' if is_function else 'get_material_expressions',o,d=None)
    if nodes is None:return {'available':False}
    ids={path(e):i for i,e in enumerate(nodes)}
    rows=[]
    for i,e in enumerate(nodes):
        names=f(lib,'get_material_expression_input_names',e,d=[])
        outnames=f(lib,'get_input_node_output_names_for_material_expression',e,d=[])
        getter='get_inputs_for_material_function_expression' if is_function else 'get_inputs_for_material_expression'
        links=f(lib,getter,o,e,d=[]) or []
        row={'id':i,'type':e.get_class().get_name().removeprefix('MaterialExpression'),'name':e.get_name(),'position':f(lib,'get_material_expression_node_position',e),'properties':props(e,'desc parameter_name group texture sampler_type const_coordinate material_function default_value const_a const_b const_alpha r g b a code output_type input_name output_name sort_priority mask r_mask g_mask b_mask a_mask attribute_set_types'),'inputs':[]}
        for index,upstream in enumerate(links):
            if upstream:
                row['inputs'].append({'pin':names[index] if len(names)==len(links) else '', 'source':ids.get(path(upstream)), 'output':outnames[index] if len(outnames)==len(links) else ''})
        rows.append(row)
    outputs={}
    for key in ([] if is_function else dir(U.MaterialProperty)):
        if key.startswith('MP_'):
            src=f(lib,'get_material_property_input_node',o,getattr(U.MaterialProperty,key))
            if src: outputs[key]={'node':ids.get(path(src)),'pin':f(lib,'get_material_property_input_node_output_name',o,getattr(U.MaterialProperty,key))}
    return {'available':True,'nodes':rows,'outputs':outputs}
while pending:
    pkg=sorted(pending)[0]
    pending.remove(pkg)
    if pkg in seen:continue
    seen.add(pkg)
    o=U.load_asset(pkg)
    if not o:continue
    k=path(o)
    d=deps(pkg)
    cls=o.get_class().get_name()
    assets[k]={'package':pkg,'type':cls,'dependencies':d}
    if isinstance(o,U.MaterialInterface):
        for x in d: enqueue(x)
        parent=p(o,'parent')
        if parent:pending.add(path(parent).split('.')[0])
        textures_used=f(lib,'get_used_textures',o,d=[]) if isinstance(o,U.Material) else []
        for t in textures_used:pending.add(path(t).split('.')[0])
        overrides={}
        for typ in ('scalar','vector','texture','static_switch'):
            values=p(o,typ+'_parameter_values',[])
            overrides[typ]=[{'name':str(p(p(x,'parameter_info'),'name')),'value':val(p(x,'parameter_value'))} for x in values]
        materials[k]={'parent':path(parent),'settings':props(o,settings),'baseOverrides':str(p(o,'base_property_overrides','')),'parameters':params(o),'overrides':overrides,'usedTextures':[path(t) for t in textures_used]}
        if isinstance(o,U.Material): graphs[k]=graph(o)
    elif isinstance(o,U.Texture):
        textures[k]={'width':f(o,'blueprint_get_size_x'),'height':f(o,'blueprint_get_size_y'),'settings':props(o,'srgb compression_settings lod_group mip_gen_settings lod_bias max_texture_size never_stream virtual_texture_streaming filter address_x address_y compression_no_alpha flip_green_channel')}
    elif isinstance(o,(U.StaticMesh,U.SkeletalMesh)):
        slots=mesh_slots(o)
        for s in slots:
            if s['material']:pending.add(s['material'].split('.')[0])
        meshes[k]={'slots':slots,'settings':props(o,'skeleton physics_asset post_process_anim_blueprint min_lod ray_tracing_min_lod support_ray_tracing')}
    elif isinstance(o,U.MaterialFunctionInterface):
        for x in d:enqueue(x)
        if isinstance(o,U.MaterialFunction):graphs[k]=graph(o)
    elif cls=='SubsurfaceProfile':
        assets[k]['settings']=str(p(o,'settings'))
    await asyncio.sleep(0)
data={'renderer':{line.split('=',1)[0]:line.split('=',1)[1] for line in Path(U.Paths.project_config_dir()).joinpath('DefaultEngine.ini').read_text(encoding='utf-8-sig').splitlines() if line.startswith('r.') and '=' in line},'source':inv,'components':components,'lighting':lighting,'assets':assets,'materials':materials,'textures':textures,'meshes':meshes,'graphs':graphs}
base.joinpath('audit.json').write_text(json.dumps(data,ensure_ascii=False,indent=2),encoding='utf-8')
{k:len(v) for k,v in data.items()}


