# Config Editor Fullpage

全頁沉浸式 YAML 編輯器，適用於 Home Assistant Panel Mode Dashboard。

基於 [junkfix/config-editor-card](https://github.com/junkfix/config-editor-card) 改造，
將編輯區撐滿整個畫面可用空間。

## 安裝前提

需要先安裝 Backend 元件：[config-editor](https://github.com/junkfix/config-editor)

## 安裝方式

### HACS（推薦）

1. HACS → Frontend → 自訂存儲庫
2. 貼上本 repo URL，類別選 Lovelace
3. 安裝 Config Editor Fullpage

### 手動安裝

1. 下載 `config-editor-fullpage.js`
2. 放入 `<HA config>/www/config-editor-fullpage.js`
3. 前往 設定 → 儀表板 → 資源，新增：
   - URL：`/local/config-editor-fullpage.js`
   - 類型：JavaScript Module

## 使用方式

建立一個 **Panel Mode** 的 Dashboard，加入此 card：

```yaml
views:
  - title: Config Editor
    panel: true
    cards:
      - type: custom:config-editor-fullpage
        depth: 3
```

## 設定選項

| 選項 | 預設 | 說明 |
|------|------|------|
| depth | 2 | 子資料夾搜尋深度 |
| file | — | 自動開啟指定檔案 |
| readonly | false | 唯讀模式 |
| basic | false | 強制使用 textarea 編輯器 |
| size | 100 | 字體大小 (%) |

## 快捷鍵

- `Ctrl+S` / `Cmd+S`：儲存

## 授權

MIT — 基於 junkfix/config-editor-card 改作
