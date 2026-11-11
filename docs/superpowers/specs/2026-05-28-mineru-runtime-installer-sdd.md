# MinerU 本地运行时一键安装 SDD

日期：2026-05-28

## 背景

用户首次使用 PDF 真题入库时，电脑上可能没有安装 MinerU。现有实现会直接调用 `mineru` 命令，缺少运行时检测、安装引导和可恢复路径，导致首次使用体验中断。

## 目标

1. 应用能检测 MinerU 是否可用。
2. 未安装时，用户可在素材库上传 PDF 的路径上一键安装本地 MinerU 运行时。
3. 安装运行时使用应用私有目录，不污染系统 Python 环境。
4. 安装完成后自动重新检测，并可继续解析刚才选择的 PDF。
5. 解析 PDF 时优先使用应用内置 MinerU 运行时，其次回退系统 PATH 中的 `mineru`。
6. 解析默认使用 ModelScope 模型源，避免国内网络下 HuggingFace 下载失败。
7. 解析默认先使用文本抽取，抽不到文字时再回退 OCR。

## 非目标

- 不把 MinerU、Python、模型直接打进安装包。
- 不承诺所有 CUDA/GPU 环境自动配置成功。
- 不在浏览器网页模式安装本地依赖，只在 Tauri 桌面端提供。

## 桌面端契约

新增 Tauri 命令：

### `material_get_mineru_runtime_status`

返回：

- `ready`: 是否可用。
- `source`: `managed | path | missing`。
- `runtime_dir`: 应用私有运行时目录。
- `executable_path?`: 可执行文件路径。
- `version?`: MinerU 版本或 help 输出摘要。
- `message`: 用户可读状态说明。
- `install_command`: 本应用使用的安装策略摘要。

检测顺序：

1. 应用私有目录 `.venv` 中的 `mineru`。
2. 系统 PATH 中的 `mineru`。
3. 均不可用则返回 `missing`。

### `material_install_mineru_runtime`

输入：

- `use_china_mirror?: boolean`

行为：

1. 创建应用私有 runtime 目录。
2. 使用系统 Python 创建 `.venv`。
3. 在 `.venv` 中安装/升级 `pip`。
4. 安装 `uv`。
5. 使用 `uv pip install --python <venv-python> -U "mineru[all]"` 安装 MinerU。
6. 安装后执行检测并返回状态与日志。

失败时必须返回明确日志，不能静默失败。

## 前端契约

- 素材库上传区显示“本地 PDF 解析引擎”状态。
- 未安装时显示“安装本地 PDF 解析引擎”按钮。
- 上传 PDF 时若 MinerU 缺失，不直接报死错，而是保留待处理 PDF，并提示安装。
- 安装成功后自动继续解析待处理 PDF。
- 浏览器网页模式只展示 PDF.js 文字解析回退，不显示安装按钮。

## 验收标准

1. Runtime API 能规范化状态和安装返回值。
2. Rust 端能正确生成 Windows / Unix 的 `.venv` 可执行路径。
3. Rust 端能构造包含 `mineru[all]` 的安装步骤。
4. PDF 解析命令优先使用 managed runtime，系统 PATH 作为回退。
5. PDF 解析命令使用 `pipeline + txt/ocr + ch + cpu + modelscope`，避免 MinerU 2.7 默认 hybrid 后端和 HuggingFace 源导致卡住。
6. 前端上传 PDF 遇到缺失运行时时，用户看到安装按钮，安装成功后继续解析。

## 验证命令

```text
npm run test
npx tsc --noEmit
npm run build
cargo test --no-default-features
npm run desktop:build
```
