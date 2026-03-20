
# 尚洗 Gardiner - 財務管理建議及 AppSheet 指南

## 1. 核心功能總結 (App Functions)
您的想法非常完整且具備實踐價值。為了讓系統更穩定，我建議將 App 分為以下三個核心模塊：
1. **收支錄入 (Transaction Entry)**:
   - 包含收據編號（納稅報表關鍵）、日期、金額、分類（洗車/美容/租金/耗材等）。
   - **優化點**: 加入「拍照/AI 識別」功能。即使在 AppSheet 中，也可以利用其原生 OCR 功能自動抓取金額和日期，減少手動輸入錯誤。
2. **合作統計 (Contribution & Split)**:
   - 記錄誰付了錢（Isaac 或 Maise）。
   - 後台自動計算 50/50 的淨利潤（Net Profit）以及各自的分紅金額。
3. **戰略看板 (Strategic Dashboard)**:
   - **Rolling Balance**: 滾動顯示賬戶現金。
   - **ROI 進度條**: 顯示目前的利潤總額距離覆蓋「裝修啟動成本」還有多遠。

## 2. 您的想法中的潛在優化 (Refinements)
- **稅務合規 (Tax Reporting)**: 建議在記錄交易時，強制要求上傳收據照片。AppSheet 的 `File` 或 `Image` 類別可以很好地處理這一點。收據編號建議使用 `REC-YYYYMMDD-XXX` 格式，方便物理存檔查找。
- **預算警報 (Budgeting)**: 既然是 50/50 平分利潤，建議設置一個「應急儲備金」機制（例如利潤的 10% 先留在公司賬戶，剩下的再分），以防未來有大額維修或租金調整。

## 3. 如何將邏輯複製到 AppSheet (Step-by-Step Guide)

### 第一步：準備 Google Sheets 表格
建立一個 Google Sheet，包含以下分頁：
- **Transactions**: `ID`, `ReceiptNum`, `Date`, `Type` (Revenue/Expense/Startup), `Category`, `Amount`, `Contributor`, `Description`, `Image`.
- **Settings**: `InitialStartupCost`, `EmergencyReserve%`.

### 第二步：導入 AppSheet
1. 在 AppSheet 中選擇 "Create App" -> "Start with existing data" -> 選擇你的 Google Sheet。
2. 在 **Data -> Columns** 中，將 `ID` 設置為 `UNIQUEID()`。
3. 將 `Type` 設置為 `Enum` (Revenue, Expense, Startup)。
4. 將 `Image` 設置為 `Image` 類型（這會啟用相機功能）。

### 第三步：設置看板 (UX)
1. **Dashboard View**: 組合多個視圖。
2. **Chart View**: 
   - 選擇 Pie Chart 顯示 Expenses by Category。
   - 選擇 Histogram 顯示 Revenue vs Expense。
3. **ROI 計算**: 
   - 在 AppSheet 中創建一個 **Virtual Column**，公式如下：
     `SUM(SELECT(Transactions[Amount], [Type] = "Revenue")) - SUM(SELECT(Transactions[Amount], [Type] = "Expense"))`
   - 這就是你的累計利潤。將其除以 `InitialStartupCost` 即得到 ROI。

### 第四步：自動化
- 設置 **Automation**: 當錄入新數據時，自動將收據圖片重命名並保存到特定的 Google Drive 文件夾中，文件名包含 `ReceiptNum`。

---
**提示**: 您現在看到的 React Dashboard 是這個系統的「高級視覺版本」。如果 AppSheet 免費版功能受限（如圖表太醜或運算太慢），您可以考慮使用這個 React Web App 作為前端，並對接一個簡單的數據庫（如 Firebase 或 Supabase）。Isaac 是股東 A，Maise 是股東 B。
