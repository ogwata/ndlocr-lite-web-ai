import type { Translations } from './ja'

export const ko: Translations = {
  app: {
    title: 'NDLOCR-Lite Web',
    subtitle: '브라우저 기반 일본어 OCR 도구',
  },
  upload: {
    dropzone: '파일을 여기에 드래그 앤 드롭하거나 클릭하여 선택',
    directoryButton: '폴더 선택',
    acceptedFormats: '지원 형식: JPG, PNG, PDF',
    startButton: 'OCR 시작',
    clearButton: '초기화',
  },
  progress: {
    initializing: '초기화 중...',
    loadingLayoutModel: '레이아웃 감지 모델 로드 중... {percent}%',
    loadingRecognitionModel: '문자 인식 모델 로드 중... {percent}%',
    layoutDetection: '레이아웃 감지 중... {percent}%',
    textRecognition: '문자 인식 중 ({current}/{total} 영역)',
    readingOrder: '읽기 순서 처리 중...',
    generatingOutput: '출력 생성 중...',
    processing: '처리 중: {current}/{total} 파일',
    done: '완료',
  },
  results: {
    copy: '복사',
    download: '다운로드',
    downloadAll: '전체 텍스트 다운로드',
    copied: '복사됨!',
    noResult: '결과 없음',
    regions: '{count}개 영역',
    processingTime: '처리 시간: {time}초',
  },
  history: {
    title: '처리 기록',
    clearCache: '캐시 삭제',
    confirmClear: '모든 처리 기록을 삭제하시겠습니까?',
    yes: '삭제',
    cancel: '취소',
    empty: '처리 기록이 없습니다',
    noText: '텍스트 없음',
  },
  settings: {
    title: '설정',
    modelCache: '모델 캐시',
    clearModelCache: '모델 캐시 삭제',
    confirmClearModel: '캐시된 ONNX 모델을 삭제하시겠습니까? 다음 시작 시 다시 다운로드됩니다.',
    clearDone: '삭제 완료',
  },
  info: {
    privacyNotice: '이 앱은 웹 브라우저에서 완전히 실행됩니다. 선택한 이미지 파일과 OCR 결과는 외부 서버로 전송되지 않습니다.',
    author: '제작자: 하시모토 유타 (국립역사민속박물관, 국립국회도서관)',
    githubLink: 'GitHub 저장소',
  },
  language: {
    switchTo: '한국어',
  },
  error: {
    generic: '오류가 발생했습니다',
    modelLoad: '모델 로드 실패',
    ocr: 'OCR 처리 중 오류 발생',
    fileLoad: '파일 로드 실패',
    clipboardNotSupported: '클립보드에 접근할 수 없습니다',
  },
}
