"""Controlled UE MID tests. All values refer to the original instance's actual parameter names."""
ZERO='ZERO_RGBA'
WHITE=[1,1,1,1]

def step(id,title,body,overrides=None,node=None,focus=None):
    return {'id':id,'title':title,'body':body,'overrides':overrides or {},
            'graphNode':node,'focus':focus}

def make(family,switches):
    if family=='Skin':
        return [
            step('skin-flat','肤色与贴图底层','保留原 BaseColor 和遮罩；将细节法线与次表面权重置零。材质继续使用当前 Subsurface Profile。',{'NormalIntensity':0,'3SIntensity':0},18,'看暗侧羽化、耳缘和面颊；最终精确差异取决于当前光照。'),
            step('skin-normal','恢复法线纹理','恢复 NormalIntensity 至实例值，切换对照可观察明暗边缘的法线响应；3S 权重仍置零。',{'3SIntensity':0},3),
        ]
    if family=='Eye':
        return [
            step('eye-base','虹膜与瞳孔','保留虹膜、瞳孔和 EyeMask 染色。两张眼部亮点纹理临时换成 RGBA 全零，法线和表面高光权重置零。',{'EyeLightA':ZERO,'EyeLightB':ZERO,'EyeIrisNormalIntensity':0,'EyePupilNormalIntensity':0,'EyeSpecularIntensity':0},29),
            step('eye-a','恢复 EyeLightA','恢复第一张亮斑纹理。它的 R 参与插值，结果进入 Base Color。第二张亮斑仍为零。',{'EyeLightB':ZERO,'EyeIrisNormalIntensity':0,'EyePupilNormalIntensity':0,'EyeSpecularIntensity':0},51,'对照前一步看虹膜上变化的位置。'),
            step('eye-b','恢复 EyeLightB','恢复第二张亮斑纹理。RGB 与 A 参与其遮罩运算，两层亮点都进入 Base Color。法线、高光尚未恢复。',{'EyeIrisNormalIntensity':0,'EyePupilNormalIntensity':0,'EyeSpecularIntensity':0},55),
        ]
    if family=='CorneaBlur':
        return [
            step('cornea-off','关闭角膜透明权重','保留眼球与脸部作为承托层。TearsMask 暂换全零，实际选择的 G 通道归零，透明层在这个实验中不贡献颜色。',{'TearsMask':ZERO},9,'切到最终或左右滑动，看虹膜边缘与泪线。'),
        ]
    if family=='Hair':
        return [
            step('hair-flat','发片底色与裁切','保留真实 Hair RGB、染色和 HairROA.B 的裁切。将法线和高光倍率置零。',{'法线强度':0,'高光度':0},0,'看发束的裁切轮廓；几何展示图可用来辨识发片边界。'),
            step('hair-normal','恢复发丝法线','恢复 HairNormal 的强度。Hair 着色模型、AO、粗糙度和透明遮罩保持实际绑定，高光倍率仍为零。',{'高光度':0},None),
        ]
    if family=='Brow':
        return [
            step('brow-tint','纹理颜色与低透明权重','保留 Brow 的 RGB 与 Alpha，BrowColor 暂为白，AlphaIntensity 暂设 0.25。',{'BrowColor':WHITE,'AlphaIntensity':0.25},11),
            step('brow-alpha','恢复透明度权重','AlphaIntensity 恢复为实例值，对比前一步可看到透明边缘变化；BrowColor 仍为白。',{'BrowColor':WHITE},12),
        ]
    if family=='Eyelash':
        return [
            step('lash-untinted','Alpha 裁切的睫毛','保留 Eyelash.A → Opacity Mask 和实例的双面覆盖，EyelashColor 暂为白，高光暂为零。',{'EyelashColor':WHITE,'SpecularIntensity':0},3,'与几何图对照：可见睫毛轮廓由 Alpha 从发片上剪出。'),
            step('lash-tint','恢复睫毛染色','恢复实例的 EyelashColor；裁切阈值不动，高光仍为零。',{'SpecularIntensity':0},0),
        ]
    if family=='Clothes':
        deal=switches.get('DealAlpha?',False)
        tile=switches.get('TileNormal?',False)
        hold={'ClothesDeal':ZERO} if deal else {}
        skip={'Tile法线强度':0} if tile else {}
        plain={'法线强度':0,'ClothesDeal法线强度':0,'高光度':0,'ClothesDeal高光度':0,**hold,**skip}
        no_spec={'高光度':0,'ClothesDeal高光度':0}
        items=[
            step('cloth-base','主层颜色与材质分区','保留已绑定主层 Base Color、金属度和粗糙度；将细节法线和高光置零。'+('第二层 Alpha 暂置零。' if deal else '这个实例的 DealAlpha? 当前关闭。'),plain,16),
            step('cloth-normal','恢复服装主层法线','恢复 ClothesNormal，保留相同的材质槽、UV、主层的金属度与粗糙度。高光仍暂置零。'+('第二层未开启。' if deal else ''),{**no_spec,**hold,**skip},16),
        ]
        if deal:
            items.append(step('cloth-deal','恢复服装第二层','按当前实例原值恢复 ClothesDeal。它的 A 重新作为两层属性混合权重，同时恢复第二层的原贴图法线。'+('平铺法线暂置零。' if tile else ''),{**no_spec,**skip},48,'靠近装饰、绣纹或布料图案边缘，对照主层与第二层。'))
        if tile:
            items.append(step('cloth-tile','恢复平铺细节法线','恢复 TileNormal? 分支使用的 Tile法线强度；其 UV 和贴图按当前实例。高光仍暂置零。',no_spec,16))
        return items
    if family=='Color':
        return [
            step('color-tint','保留染色底层','保留原实例的 Color.RGB，材质 Matcap 和金属度权重暂置零。',{'MatcapIntensity':0,'MetallicityIntensity':0},15),
            step('color-matcap','恢复 Matcap','恢复实例使用的 MatcapIntensity，使查表结果回到 Base Color。金属度仍暂为零。',{'MetallicityIntensity':0},10),
        ]
    if family=='Feather':
        return [
            step('feather-base','颜色与羽片 Alpha','保留羽片真实颜色和 Feather.A 透明边缘；法线和高光倍率暂置零。',{'法线强度':0,'高光度':0},19),
            step('feather-normal','恢复羽片法线','恢复 FeatherNormal 的实例强度。Alpha、颜色和粗糙度保持实际值，高光仍暂置零。',{'高光度':0},5),
        ]
    return []

FINAL={
    'Skin':'恢复原实例。3SIntensity 和法线按绑定值生效，唇妆静态分支仍保持工程现状。',
    'Eye':'恢复原实例的法线与 Specular。高光纹理已处于实际状态，MatcapIntensity 仍为工程中的零。',
    'CorneaBlur':'恢复原 TearsMask 与其 G 通道。眼球和脸部保持同一机位与材质，透明层重新参与合成。',
    'Hair':'恢复原实例高光。可对照主色、法线与高光阶段观察发丝细节。',
    'Brow':'恢复实际 BrowColor 与 AlphaIntensity。透明层仍按当前实例的 Translucent 混合。',
    'Eyelash':'恢复原实例高光值。保持原 Alpha 裁切和 Two Sided。',
    'Clothes':'回到原始材质绑定及其全部有效参数，保持该实例自己的静态开关与 Blend Mode。与上一步对照原有高光响应。',
    'Feather':'恢复原实例的高光倍率。采样羽片图的 B 通道参与高光和粗糙度，A 通道参与不透明度。',
    'Color':'恢复原实例的金属度。Matcap 已回到 Base Color，两种变化可分开比较。',
}
