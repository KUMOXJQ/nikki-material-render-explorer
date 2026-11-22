import unreal
a=next(a for a in unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors() if 'nikki' in a.get_actor_label().lower())
b,e=a.get_actor_bounds(False)
{'origin':[b.x,b.y,b.z],'extent':[e.x,e.y,e.z],'rotation':str(a.get_actor_rotation()),'location':str(a.get_actor_location()),'components':[(c.get_name(),str(c.get_component_bounds()) if hasattr(c,'get_component_bounds') else str(c.get_world_location())) for c in a.get_components_by_class(unreal.MeshComponent)]}

