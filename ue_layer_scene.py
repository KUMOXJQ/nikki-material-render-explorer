"""Runs inside Testitem through UE's own Python MCP tool."""
import unreal as U

OFFSET = U.Vector(1350,0,0)
M = U.MaterialEditingLibrary

def dirty_maps():
    return sorted(x.get_name() for x in U.EditorLoadingAndSavingUtils.get_dirty_map_packages())

def constant_material(value, masked=False):
    m=U.new_object(U.Material)
    m.set_editor_property('two_sided',True)
    m.set_editor_property('blend_mode',U.BlendMode.BLEND_MASKED if masked else U.BlendMode.BLEND_OPAQUE)
    expression=M.create_material_expression(m,U.MaterialExpressionConstant,-200,0)
    expression.set_editor_property('r',value)
    pin=U.MaterialProperty.MP_OPACITY_MASK if masked else U.MaterialProperty.MP_BASE_COLOR
    if not M.connect_material_property(expression,'',pin):
        raise RuntimeError('Could not connect scratch material')
    problems=M.recompile_material(m)
    if problems:
        raise RuntimeError(f'Scratch material errors: {problems}')
    return m

class Stage:
    def __init__(self):
        self.actors=U.get_editor_subsystem(U.EditorActorSubsystem)
        self.world=U.get_editor_subsystem(U.UnrealEditorSubsystem).get_editor_world()
        if self.world.get_path_name()!='/Game/Character/Character.Character':
            raise RuntimeError('Expected Testitem Character editor world')
        self.dirty_before=dirty_maps()
        self.original=next(a for a in self.actors.get_all_level_actors() if 'nikki' in a.get_name().lower())
        self.before=sorted(a.get_path_name() for a in self.actors.get_all_level_actors())
        self.clones={}
        self.spawned=[]
        self.empty=constant_material(0.0,True)
        self.gray=constant_material(0.35)
        self.blank=U.RenderingLibrary.create_render_target2d(
            self.world, 4, 4, U.TextureRenderTargetFormat.RTF_RGBA8, U.LinearColor(0,0,0,0))
        U.RenderingLibrary.clear_render_target2d(self.world,self.blank,U.LinearColor(0,0,0,0))
        self.active_mids=[]
        try:
            for source in self.original.get_components_by_class(U.StaticMeshComponent):
                actor=self.actors.spawn_actor_from_class(U.StaticMeshActor,
                    source.get_world_location()+OFFSET, source.get_world_rotation(), transient=True)
                if not actor:
                    raise RuntimeError(f'Unable to clone {source.get_name()}')
                self.spawned.append(actor)
                actor.set_actor_label('NikkiReportPreview_'+source.get_name())
                comp=actor.get_component_by_class(U.StaticMeshComponent)
                comp.set_mobility(U.ComponentMobility.MOVABLE)
                comp.set_static_mesh(source.get_editor_property('static_mesh'))
                actor.set_actor_transform(source.get_world_transform(),False,True)
                actor.set_actor_location(source.get_world_location()+OFFSET,False,True)
                comp.set_mobility(source.get_editor_property('mobility'))
                comp.set_visibility(False,False)
                comp.set_collision_enabled(U.CollisionEnabled.NO_COLLISION)
                self.clones[source.get_name()]=(actor,comp,source)
        except Exception:
            self.close()
            raise

    def configure(self,slots,variant,context=None):
        if self.world != U.get_editor_subsystem(U.UnrealEditorSubsystem).get_editor_world():
            raise RuntimeError('The active editor world changed')
        targets={(slot['component'],slot['index']) for slot in slots}
        supporting={(slot['component'],slot['index']) for slot in context or []}
        gray=variant.get('geometry',False)
        self.active_mids=[]
        for key,(actor,comp,source) in self.clones.items():
            needed=any(a==key for a,b in targets|supporting)
            comp.set_visibility(needed,False)
            if not needed: continue
            for index in range(source.get_num_materials()):
                target=(key,index) in targets
                if not target:
                    comp.set_material(index,source.get_material(index) if (key,index) in supporting else self.empty)
                    continue
                orig=source.get_material(index)
                if gray:
                    comp.set_material(index,self.gray)
                    continue
                comp.set_material(index,orig)
                overrides=variant.get('overrides',{})
                if not overrides:
                    continue
                mid=comp.create_dynamic_material_instance(index,orig)
                self.active_mids.append(mid)
                for parameter,val in overrides.items():
                    if val=='ZERO_RGBA':
                        mid.set_texture_parameter_value(parameter,self.blank)
                    elif isinstance(val,list):
                        mid.set_vector_parameter_value(parameter,U.LinearColor(*val))
                    else:
                        mid.set_scalar_parameter_value(parameter,float(val))

    def close(self):
        for a in self.spawned:
            a.destroy_actor()
        self.spawned.clear()
        after=sorted(a.get_path_name() for a in self.actors.get_all_level_actors())
        return {'actorListRestored':after==self.before,
                'dirtyMapsBefore':self.dirty_before,'dirtyMapsAfter':dirty_maps()}

