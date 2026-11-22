import unreal
from pathlib import Path
import json
r=unreal.AssetRegistryHelpers.get_asset_registry()
root='/Game/Character/Nikki'
inventory=[{'path':str(a.package_name),'type':str(a.asset_class_path.asset_name)} for a in r.get_assets_by_path(root,recursive=True)]
world=unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem).get_editor_world()
actors=unreal.get_editor_subsystem(unreal.EditorActorSubsystem).get_all_level_actors()
out={'world':world.get_path_name(),'actors':[{'label':a.get_actor_label(),'class':a.get_class().get_name(),'path':a.get_path_name()} for a in actors], 'inventory':inventory}
Path(unreal.Paths.project_dir()).joinpath('NikkiRenderReport/inventory.json').write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
{'world':out['world'],'actors':len(actors),'assets':len(inventory)}

