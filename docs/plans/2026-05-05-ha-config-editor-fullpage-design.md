# HA Config Editor — 全頁套件設計文件

> 日期：2026-05-05
> 狀態：Draft — 待確認

---

## 1. 專案目標

將 `junkfix/config-editor-card` 改造為 **全頁沉浸式 YAML 編輯器**，
在 HA Panel Mode Dashboard 下，編輯區撐滿整個可用空間。

**不改 Backend**：`junkfix/config-editor` 原封不動安裝即可。
**產出**：單一 `config-editor-fullpage.js`，放入 `www/` 即可使用。

---

## 2. 架構決策

| 項目 | 決定 | 理由 |
|------|------|------|
| 框架 | HA 內建 LitElement（從 runtime 取） | 零依賴、零打包，與原始做法一致 |
| Build tool | 無 | 單檔 < 400 行，不需要 toolchain |
| 編輯器核心 | `ha-code-editor`（HA 內建 CodeMirror） | 保留 syntax highlight、autocomplete |
| 備用編輯器 | 原生 `<textarea>`（Basic 模式） | 保留原始 fallback |
| 註冊方式 | `customElements.define('config-editor-fullpage', ...)` | 避免與原始 card 衝突 |

---

## 3. Layout 設計

### 3.1 整體結構（Flexbox 垂直佈局）

```
┌─────────────────────────────────────────────┐
│  HA Header (56px, 由 HA 控制)                │
├─────────────────────────────────────────────┤
│  Toolbar (sticky top)                        │
│  ┌─────────────────────────────────────────┐│
│  │ [Reload] [ext▾]  |  [-] [A] [+] [Basic] ││
│  │ [Save] [file-selector▾] [Get List]       ││
│  └─────────────────────────────────────────┘│
├─────────────────────────────────────────────┤
│                                             │
│              Editor Area                     │
│           (flex: 1, 填滿剩餘)                │
│                                             │
│                                             │
│                                             │
│                                             │
├─────────────────────────────────────────────┤
│  Status Bar (fixed bottom, 單行)             │
│  #info-line / alert                          │
└─────────────────────────────────────────────┘
```

### 3.2 關鍵 CSS 策略

```
:host {
  display: flex;
  flex-direction: column;
  height: calc(100vh - var(--header-height, 56px));
  overflow: hidden;
  background: var(--primary-background-color);
  color: var(--primary-text-color);
}

.toolbar { ... sticky / flex-wrap }
.editor  { flex: 1; min-height: 0; overflow: hidden; }
.status  { ... fixed bottom bar }
```

**重點**：
- **不再使用 `<ha-card>`** — Panel Mode 下不需要 card 外框
- **不再寫死 `80vh`** — 用 `flex: 1` 自動填滿
- `ha-code-editor` 需要設定 `height: 100%` 讓它撐滿 `.editor` 容器
- `min-height: 0` 防止 flex item 溢出

### 3.3 RWD 斷點

| 寬度 | Toolbar 行為 |
|------|-------------|
| ≥ 768px (桌機/平板) | 單行：左側操作按鈕，右側設定 |
| < 768px (手機) | 兩行：第一行按鈕，第二行選單 |

手機時 file selector `width: 100%`，字體按鈕縮小。

---

## 4. 與原始版本的差異對照

| 面向 | 原始 (config-editor-card) | 全頁版 |
|------|--------------------------|--------|
| 外殼 | `<ha-card>` | 無，直接 `:host` flex |
| 高度 | `80vh` 固定 / `.top { min-height: calc(95vh - ...) }` | `flex: 1` 自動填滿 |
| Toolbar | `.pin` sticky + `.bar` sticky bottom | `.toolbar` flex-wrap + `.status` fixed |
| Element 名稱 | `config-editor-card` | `config-editor-fullpage` |
| localStorage key | `config_editor*` | `config_editor_fp_*`（避免衝突） |
| WebSocket | `config_editor/ws` | 不變（共用 backend） |
| 檔案選單位置 | 底部 bar | 頂部 toolbar（更直覺） |
| Ctrl+S | 有 | 保留 |
| 副檔名切換 | 有 | 保留 |
| Basic 模式 | 有 | 保留 |
| Font size 調整 | 有 | 保留 |
| 未儲存提示 | 有 | 保留 |
| readonly 模式 | 有 | 保留 |

---

## 5. Toolbar 配置（上方合併為單行區塊）

### 桌機版（≥ 768px）

```
┌──────────────────────────────────────────────────────────────┐
│ [Save] [Reload] | [▾ file-selector (flex-grow)] [Get List]  │
│                 | [ext▾] [-][A][+] [☐ Basic]                │
└──────────────────────────────────────────────────────────────┘
```

設計考量：
- **Save / Reload** 在最左側，最常用的操作最容易點到
- **檔案選單** 佔最大空間（flex-grow），方便看長路徑
- **設定類按鈕**（ext、字體、basic）放右側，不常用

### 手機版（< 768px）

```
┌─────────────────────────────────┐
│ [Save] [Reload] [ext▾] [-A+]   │
│ [▾ file-selector       ] [List] │
└─────────────────────────────────┘
```

靠 `flex-wrap` 自動換行。

---

## 6. 保留的所有功能

從原始碼逐一確認，以下功能全部保留：

1. **WebSocket 通訊** — `cmd(action, data, file)` 不變
2. **檔案列表** — `List()` / `Load()` / `Save()`
3. **副檔名切換** — yaml, py, json, conf, js, txt, log, jinja, all
4. **Ctrl+S 快捷鍵** — `saveKey()`
5. **字體大小調整** — `txtSize()` 三段式
6. **Basic 模式切換** — textarea fallback
7. **ha-code-editor 動態載入** — `Coder()`
8. **未儲存偵測** — 切檔提示 + localStorage 恢復
9. **Toast 通知** — `hass-notification` event
10. **新檔建立** — Save 時 prompt 輸入檔名
11. **readonly 模式** — config 參數
12. **depth 參數** — 子資料夾深度
13. **Backend 版本檢查** — `edit.cver` 比對

---

## 7. Config 參數（使用方式）

```yaml
# 在 Panel Mode Dashboard 中使用
views:
  - title: Config Editor
    panel: true
    cards:
      - type: custom:config-editor-fullpage
        depth: 3          # 子資料夾深度（預設 2）
        # file: secrets.yaml  # 自動開啟指定檔案
        # readonly: true      # 唯讀模式
        # basic: true         # 強制 textarea 模式
        # size: 120           # 初始字體大小 %
```

---

## 8. 檔案結構

```
Woow_ha_config_component/
├── config-editor-fullpage.js    # 主要產出（單檔）
├── hacs.json                     # HACS 前端元件描述
├── README.md                     # 安裝說明
└── docs/
    └── plans/
        └── 2026-05-05-ha-config-editor-fullpage-design.md
```

### hacs.json

```json
{
  "name": "Config Editor Fullpage",
  "render_readme": true,
  "filename": "config-editor-fullpage.js"
}
```

---

## 9. HA CSS Variables 使用

完全跟隨 HA 主題，不 hardcode 任何顏色：

| 用途 | CSS Variable |
|------|-------------|
| 背景 | `--primary-background-color` |
| 文字 | `--primary-text-color` |
| Toolbar 背景 | `--secondary-background-color` |
| Status bar 背景 | `--app-header-background-color` |
| Status bar 文字 | `--app-header-text-color` |
| 按鈕 | `--mdc-theme-primary` |
| 按鈕 hover | `--primary-color` |
| 分隔線 | `--divider-color` |
| 輸入框 | `--card-background-color` |

---

## 10. 不做的事

- **不寫 Backend** — 直接用 `junkfix/config-editor`
- **不加 build toolchain** — 無 npm/rollup/webpack
- **不加新功能** — 不加 git diff、多 tab、terminal 等
- **不改 WebSocket protocol** — 完全相容
- **不加 TypeScript** — 保持原生 JS 一致性
