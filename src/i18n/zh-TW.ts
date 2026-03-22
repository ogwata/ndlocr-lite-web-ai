import type { Translations } from './ja'

export const zhTW: Translations = {
  app: {
    title: 'NDLOCR-Lite Web',
    subtitle: '瀏覽器端日語OCR工具',
  },
  upload: {
    dropzone: '拖放檔案到此處，或點擊選擇',
    directoryButton: '選擇資料夾',
    acceptedFormats: '支援格式: JPG, PNG, PDF',
    startButton: '開始OCR',
    clearButton: '清除',
  },
  progress: {
    initializing: '初始化中...',
    loadingLayoutModel: '正在載入版面偵測模型... {percent}%',
    loadingRecognitionModel: '正在載入文字辨識模型... {percent}%',
    layoutDetection: '正在偵測版面... {percent}%',
    textRecognition: '正在辨識文字 ({current}/{total} 區域)',
    readingOrder: '處理閱讀順序...',
    generatingOutput: '產生輸出...',
    processing: '處理中: {current}/{total} 檔案',
    done: '完成',
  },
  results: {
    copy: '複製',
    download: '下載',
    downloadAll: '下載全部文字',
    copied: '已複製！',
    noResult: '無結果',
    regions: '{count} 個區域',
    processingTime: '處理時間: {time}秒',
  },
  history: {
    title: '處理紀錄',
    clearCache: '清除快取',
    confirmClear: '刪除所有處理紀錄？',
    yes: '刪除',
    cancel: '取消',
    empty: '暫無處理紀錄',
    noText: '無文字',
  },
  settings: {
    title: '設定',
    modelCache: '模型快取',
    clearModelCache: '清除模型快取',
    confirmClearModel: '刪除快取的ONNX模型？下次啟動時需要重新下載。',
    clearDone: '已清除',
  },
  info: {
    privacyNotice: '本應用完全在瀏覽器中運行。所選圖片檔案和OCR結果不會傳送到任何外部伺服器。',
    author: '作者: 橋本雄太（國立歷史民俗博物館、國立國會圖書館）',
    githubLink: 'GitHub儲存庫',
  },
  language: {
    switchTo: '繁體中文',
  },
  error: {
    generic: '發生錯誤',
    modelLoad: '模型載入失敗',
    ocr: 'OCR處理過程中發生錯誤',
    fileLoad: '檔案載入失敗',
    clipboardNotSupported: '無法存取剪貼簿',
  },
}
