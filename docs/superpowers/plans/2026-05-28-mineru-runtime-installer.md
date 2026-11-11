# MinerU 本地运行时一键安装实施计划

规格：`docs/superpowers/specs/2026-05-28-mineru-runtime-installer-sdd.md`

## 任务

- [x] 扩展 Tauri material 模块，新增 runtime 状态与安装返回类型。
- [x] 实现 managed `.venv` 路径解析和系统 PATH 回退。
- [x] 实现 `material_get_mineru_runtime_status`。
- [x] 实现 `material_install_mineru_runtime`。
- [x] 修改 PDF 解析命令，优先使用 managed MinerU。
- [x] 修改 PDF 解析策略为文本抽取优先、OCR 回退、ModelScope 模型源。
- [x] 扩展前端 material parser runtime API。
- [x] 上传 PDF 时检测 MinerU 状态，缺失时展示一键安装入口。
- [x] 安装成功后自动继续处理待解析 PDF。
- [x] 增加前端和 Rust 测试。
- [x] 运行全量验证和桌面打包。

## 安装策略

默认安装到应用本地数据目录：

```text
<app-local-data>/mineru-runtime/.venv
```

安装命令链：

```text
python -m venv <runtime>/.venv
<venv-python> -m pip install --upgrade pip
<venv-python> -m pip install uv
<venv-python> -m uv pip install --python <venv-python> -U "mineru[all]"
```

可选使用国内 PyPI 镜像以提高首次安装成功率。
