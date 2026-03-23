import type { Translations } from './ja'

export const zhCN: Translations = {
  app: {
    title: 'NDLOCR-Lite Web',
    subtitle: '浏览器端日语OCR工具',
  },
  upload: {
    dropzone: '拖放文件到此处，或点击选择',
    directoryButton: '选择文件夹',
    acceptedFormats: '支持格式: JPG, PNG, PDF',
    startButton: '开始OCR',
    clearButton: '清除',
  },
  progress: {
    initializing: '初始化中...',
    loadingLayoutModel: '正在加载版面检测模型... {percent}%',
    loadingRecognitionModel: '正在加载文字识别模型... {percent}%',
    layoutDetection: '正在检测版面... {percent}%',
    textRecognition: '正在识别文字 ({current}/{total} 区域)',
    readingOrder: '处理阅读顺序...',
    generatingOutput: '生成输出...',
    processing: '处理中: {current}/{total} 文件',
    done: '完成',
  },
  results: {
    copy: '复制',
    download: '下载',
    downloadAll: '下载全部文本',
    copied: '已复制！',
    noResult: '无结果',
    regions: '{count} 个区域',
    processingTime: '处理时间: {time}秒',
  },
  history: {
    title: '处理历史',
    clearCache: '清除缓存',
    confirmClear: '删除所有处理历史？',
    yes: '删除',
    cancel: '取消',
    empty: '暂无处理历史',
    noText: '无文本',
  },
  settings: {
    title: '设置',
    modelCache: '模型缓存',
    clearModelCache: '清除模型缓存',
    confirmClearModel: '删除缓存的ONNX模型？下次启动时需要重新下载。',
    clearDone: '已清除',
  },
  info: {
    privacyNotice: '本应用完全在浏览器中运行。所选图像文件和OCR结果不会发送到任何外部服务器。',
    author: '作者: 桥本雄太（国立历史民俗博物馆、国立国会图书馆）',
    githubLink: 'GitHub仓库',
  },
  language: {
    switchTo: '简体中文',
  },
  error: {
    generic: '发生错误',
    modelLoad: '模型加载失败',
    ocr: 'OCR处理过程中发生错误',
    fileLoad: '文件加载失败',
    clipboardNotSupported: '无法访问剪贴板',
  },
}
