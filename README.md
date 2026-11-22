# Nikki / 熠熠舞曲 · 材质拆解

直接用浏览器打开 index.html。预览图、原始 PNG、通道图和工程数据都使用相对路径，移动时保留目录结构。

## 报告内容

- 材质图解覆盖九套母材质。解说按实际实例值追踪常用 UV、通道、着色属性和静态开关。点击正文中的节点号可直接定位接线图。
- 材质接线图支持按输出和分支查阅。选择实例时，当前实例的纹理与静态开关用于解读母图。具名转接来自 UE 的 MaterialEditingLibrary 查询。
- 实例对照可只看差异。instance-render.json 保留 33 个材质的有效渲染属性、显式覆盖与来源。参数图的小样均从 UE 导出的 PNG 拆通道，最长边 600 像素。
- 关卡槽位核对范围是 Character 关卡中 Nikki 蓝图实例的组件和网格资产默认值。纹理页分别记录有效参数引用与资产注册表包依赖。

## 渲染图

captures-hd.json 保存 30 个 UE 官方 SceneCaptureToolset 原生高清缓冲与 Lit 捕捉。captures-stable.json 保存正面、面部、礼服的三张高清 Lit 合成图。每张合成图使用 12 次相同机位、相同分辨率的 UE 离屏渲染，将 8 位 sRGB 显示图转到线性显示空间求均值，再编码为 PNG。对应的独立单帧仍可切换查看。主图分别为 2560×3200、2600×2600、2240×2520。默认加载轻量预览图，点图时加载全尺寸 PNG，1:1 模式按原像素滚动。

捕捉来自当前编辑器世界的静态姿态。诊断图为 UE 8 位显示编码，适用于对照观察。滑动布局要求相同机位及比例，其他组合可双栏查看。Lit 合成用于减少随机颗粒，不能代表原始场景线性 GBuffer 或 Movie Render Queue 结果。

## 数据更新

inventory.json、audit.json、named-reroutes.json、lessons.json、instance-render.json、texture_images.json 和捕捉清单是资料来源。运行 python build.py 更新 data.js。capture_hd.py 与 capture_stable.py 通过本机 UE 官方 MCP 重采集画面，需要当前 Testitem 编辑器世界、Python、Pillow 和 NumPy。
## 材质隔离与实际分层

从「材质图解」选中母材质专题，再在「网格隔离与渲染分层」中切换绑定实例。也可从槽位或实例详情点「单独看网格与效果」直达对应实例。

- UE 原生 LOD0 与 GeometryScript 提取逐网格核对，共 9 个静态网格组件、37 个材质槽、30 个实际渲染截面、60,430 个三角形。21 个材质实例有实际网格，7 个 WorldGridMaterial 绑定槽在 LOD0 没有截面。
- 隔离图用同一静态网格资产的临时副本，在 Character 关卡中沿 X 平移 1350 cm 后等量移动相机。无关槽分配零裁切掩码材质。中性几何使用双面灰材质，展示裁切前的原三角面。正面和斜前方图使用实际槽材质。
- 中间图用原材质实例派生的动态材质实例，临时调整列表中的参数。机位与灯光在同组阶段保持一致。最终图使用原实例，衣料第二层与眼部亮点的关断实验使用透明黑临时纹理。角膜阶段额外保留眼球与皮肤，以观察合成。
- 隔离图与完整角色的背后遮挡、投影和反射会有差异。所有分层图为 UE Lit 离屏输出，保留 1440×1440 PNG；部分图片采用同机位合成，方法标注在页面。效果小的材质可按 1:1 看或滑动对照。
- 临时几何和材质不保存为 UE 资产。采集结束核对 Actor 列表和关卡脏标记。证据清单在 layer-evidence.json，LOD0 数据在 slot-geometry.json。采集命令为 python render_layers.py 与 python render_layers.py --angles，结束后运行 python build.py。

## 材质效果

在「材质图解」中选择实例，再切换「实际材质效果」。条目包含各效果的接线状态、有效参数、贴图与节点入口。「材质与节点」也可查看母材质和未绑定资产的效果说明。

图注区分 UE Lit、缓冲视图和临时参数实验。Fresnel 与 Matcap 近景采用同一饰件槽、相机和 Base Color 缓冲。原实例的 Fresnel UV 修正强度为零，强度为 1 的图是实验对照。使用透明着色路径的材质以原 Lit 或参数对照为主。

效果说明来自 effect-definitions.json，截图清单来自 effect-captures.json。用 python render_effects.py 重采集隔离缓冲，python render_matcap_closeup.py 重采集饰件近景，再运行 python build.py。
