/**
 * Image Preprocessing Module for NDLOCR-Lite Web AI
 * Provides comprehensive image manipulation using Canvas API
 * Optimized for historical Japanese document OCR
 */

export interface PreprocessOptions {
  brightness: number;      // -100 to 100, default 0
  contrast: number;        // -100 to 100, default 0
  grayscale: boolean;      // convert to grayscale
  binarize: boolean;       // convert to black & white
  binarizeThreshold: number; // 0-255, default 128
  sharpen: number;         // 0 to 100, default 0
  rotation: number;        // degrees, -180 to 180
  denoise: boolean;        // simple noise removal
  invert: boolean;         // invert colors
}

export const DEFAULT_PREPROCESS_OPTIONS: PreprocessOptions = {
  brightness: 0,
  contrast: 0,
  grayscale: false,
  binarize: false,
  binarizeThreshold: 128,
  sharpen: 0,
  rotation: 0,
  denoise: false,
  invert: false,
};

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Load image from dataUrl into HTMLImageElement
 */
async function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = dataUrl;
  });
}

/**
 * Create a canvas with 2D context
 */
function createCanvas(
  width: number,
  height: number
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to get 2D context');
  }
  return { canvas, ctx };
}

/**
 * Load image from dataUrl and get ImageData
 */
async function getImageData(
  dataUrl: string
): Promise<{ imageData: ImageData; width: number; height: number }> {
  const img = await loadImage(dataUrl);
  const { ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);
  const imageData = ctx.getImageData(0, 0, img.width, img.height);
  return { imageData, width: img.width, height: img.height };
}

/**
 * Convert canvas to dataUrl (JPEG, quality 0.92)
 */
function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL('image/jpeg', 0.92);
}

// ============================================================================
// Pixel Manipulation Functions
// ============================================================================

/**
 * Apply brightness adjustment to ImageData
 * @param imageData - Source ImageData
 * @param brightness - Value from -100 to 100
 */
function applyBrightness(imageData: ImageData, brightness: number): void {
  const data = imageData.data;
  const delta = (brightness / 100) * 255;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i] + delta));     // R
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] + delta)); // G
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] + delta)); // B
    // A unchanged
  }
}

/**
 * Apply contrast adjustment to ImageData
 * @param imageData - Source ImageData
 * @param contrast - Value from -100 to 100
 */
function applyContrast(imageData: ImageData, contrast: number): void {
  const data = imageData.data;
  const factor = (contrast + 100) / 100;
  const intercept = 128 * (1 - factor);

  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, data[i] * factor + intercept));     // R
    data[i + 1] = Math.max(0, Math.min(255, data[i + 1] * factor + intercept)); // G
    data[i + 2] = Math.max(0, Math.min(255, data[i + 2] * factor + intercept)); // B
    // A unchanged
  }
}

/**
 * Convert ImageData to grayscale (weighted average method)
 * Formula: 0.299R + 0.587G + 0.114B
 */
function applyGrayscale(imageData: ImageData): void {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    data[i] = gray;     // R
    data[i + 1] = gray; // G
    data[i + 2] = gray; // B
    // A unchanged
  }
}

/**
 * Apply inversion to ImageData
 */
function applyInvert(imageData: ImageData): void {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - data[i];         // R
    data[i + 1] = 255 - data[i + 1]; // G
    data[i + 2] = 255 - data[i + 2]; // B
    // A unchanged
  }
}

/**
 * Apply sharpening using 3x3 convolution kernel
 */
function applySharpen(imageData: ImageData, amount: number): void {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;
  const factor = amount / 100;

  // Sharpening kernel
  const kernel = [
    0, -1, 0,
    -1, 5, -1,
    0, -1, 0,
  ];

  // Create a copy of the original data
  const originalData = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        let sum = 0;

        // Apply kernel
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx =
              ((y + ky) * width + (x + kx)) * 4 + c;
            const k = kernel[(ky + 1) * 3 + (kx + 1)];
            sum += originalData[idx] * k;
          }
        }

        // Blend with original
        const idx = (y * width + x) * 4 + c;
        const original = originalData[idx];
        const sharpened = sum;
        data[idx] = Math.max(
          0,
          Math.min(255, original + (sharpened - original) * factor)
        );
      }
    }
  }
}

/**
 * Otsu's method for automatic threshold calculation
 * Returns the optimal threshold value (0-255)
 */
function calculateOtsuThreshold(imageData: ImageData): number {
  const data = imageData.data;
  const histogram = new Array(256).fill(0);

  // Build histogram (for grayscale data, R=G=B)
  for (let i = 0; i < data.length; i += 4) {
    const gray = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    histogram[gray]++;
  }

  const total = imageData.width * imageData.height;
  let sumB = 0;
  let wB = 0;
  let maxVar = 0;
  let threshold = 0;

  for (let t = 0; t < 256; t++) {
    wB += histogram[t];
    if (wB === 0) continue;

    const wF = total - wB;
    if (wF === 0) break;

    sumB += t * histogram[t];
    const mB = sumB / wB;
    const mF = (total * t - sumB) / wF;
    const varBetween = wB * wF * Math.pow(mB - mF, 2);

    if (varBetween > maxVar) {
      maxVar = varBetween;
      threshold = t;
    }
  }

  return threshold;
}

/**
 * Apply binarization (threshold) to ImageData
 * Converts to black & white
 */
function applyBinarize(imageData: ImageData, threshold: number): void {
  const data = imageData.data;

  for (let i = 0; i < data.length; i += 4) {
    // Calculate grayscale if not already grayscale
    const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    const value = gray >= threshold ? 255 : 0;
    data[i] = value;     // R
    data[i + 1] = value; // G
    data[i + 2] = value; // B
    // A unchanged
  }
}

/**
 * Apply denoise using 3x3 median filter
 */
function applyDenoise(imageData: ImageData): void {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Create a copy
  const originalData = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      for (let c = 0; c < 3; c++) {
        const values: number[] = [];

        // Collect 3x3 neighborhood
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const idx = ((y + ky) * width + (x + kx)) * 4 + c;
            values.push(originalData[idx]);
          }
        }

        // Find median
        values.sort((a, b) => a - b);
        const median = values[4]; // Middle value of 9 elements

        const idx = (y * width + x) * 4 + c;
        data[idx] = median;
      }
    }
  }
}

// ============================================================================
// Geometric Transformation Functions
// ============================================================================

/**
 * Apply rotation to canvas
 * @param canvas - Source canvas
 * @param angleDegrees - Rotation angle in degrees (-180 to 180)
 */
function applyRotation(
  canvas: HTMLCanvasElement,
  angleDegrees: number
): HTMLCanvasElement {
  if (angleDegrees === 0) return canvas;

  const angleRadians = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angleRadians);
  const sin = Math.sin(angleRadians);

  const { width, height } = canvas;

  // Calculate new canvas size
  const newWidth = Math.ceil(
    Math.abs(width * cos) + Math.abs(height * sin)
  );
  const newHeight = Math.ceil(
    Math.abs(width * sin) + Math.abs(height * cos)
  );

  const { canvas: newCanvas, ctx } = createCanvas(newWidth, newHeight);

  // Translate to center
  ctx.translate(newWidth / 2, newHeight / 2);
  ctx.rotate(angleRadians);
  ctx.drawImage(canvas, -width / 2, -height / 2);

  return newCanvas;
}

/**
 * Find vertical gap with least content using column projection
 * Returns the x-coordinate of the split position
 */
function findVerticalSplitPosition(imageData: ImageData): number {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Calculate black pixel count for each column
  const columnBlackPixels = new Array(width).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      // Count dark pixels (< 128)
      if (gray < 128) {
        columnBlackPixels[x]++;
      }
    }
  }

  // Find the valley with minimum black pixels in a window
  const windowSize = Math.max(20, Math.floor(width / 50));
  let minSum = Infinity;
  let minX = width / 2;

  for (let x = windowSize; x < width - windowSize; x++) {
    let sum = 0;
    for (let i = x - windowSize / 2; i < x + windowSize / 2; i++) {
      sum += columnBlackPixels[i];
    }
    if (sum < minSum) {
      minSum = sum;
      minX = x;
    }
  }

  return Math.round(minX);
}

/**
 * Extract a region from canvas and return as dataUrl
 */
function extractCanvasRegion(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  width: number,
  height: number
): string {
  const { canvas: regionCanvas, ctx } = createCanvas(width, height);
  ctx.drawImage(canvas, -x, -y);
  return canvasToDataUrl(regionCanvas);
}

// ============================================================================
// Auto-detection Functions
// ============================================================================

/**
 * Find content boundaries for auto-crop
 */
function findContentBoundaries(
  imageData: ImageData,
  threshold: number
): { left: number; top: number; right: number; bottom: number } {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];

      if (gray < threshold) {
        left = Math.min(left, x);
        right = Math.max(right, x);
        top = Math.min(top, y);
        bottom = Math.max(bottom, y);
      }
    }
  }

  return { left, top, right, bottom };
}

/**
 * Calculate horizontal projection profile variance
 * Used for deskew detection
 */
function calculateProjectionVariance(imageData: ImageData): number {
  const width = imageData.width;
  const height = imageData.height;
  const data = imageData.data;

  // Count black pixels for each row
  const rowBlackPixels = new Array(height).fill(0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const gray = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (gray < 128) {
        rowBlackPixels[y]++;
      }
    }
  }

  // Calculate variance
  const mean = rowBlackPixels.reduce((a, b) => a + b, 0) / height;
  const variance = rowBlackPixels.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / height;

  return variance;
}

// ============================================================================
// Public API Functions
// ============================================================================

/**
 * Apply all preprocessing to a dataUrl, return new dataUrl
 * @param dataUrl - Source image as data URL
 * @param options - Preprocessing options
 */
export async function applyPreprocess(
  dataUrl: string,
  options: PreprocessOptions
): Promise<string> {
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);

  // Apply rotation first (changes canvas size)
  let workingCanvas = canvas;
  if (options.rotation !== 0) {
    workingCanvas = applyRotation(workingCanvas, options.rotation);
  }

  // Get working imageData
  const workingCtx = workingCanvas.getContext('2d');
  if (!workingCtx) throw new Error('Failed to get 2D context');

  let imageData = workingCtx.getImageData(
    0,
    0,
    workingCanvas.width,
    workingCanvas.height
  );

  // Apply pixel-level transformations
  if (options.brightness !== 0) {
    applyBrightness(imageData, options.brightness);
  }

  if (options.contrast !== 0) {
    applyContrast(imageData, options.contrast);
  }

  if (options.grayscale) {
    applyGrayscale(imageData);
  }

  if (options.denoise) {
    applyDenoise(imageData);
  }

  if (options.sharpen > 0) {
    applySharpen(imageData, options.sharpen);
  }

  if (options.binarize) {
    const threshold = options.binarizeThreshold === 128
      ? calculateOtsuThreshold(imageData)
      : options.binarizeThreshold;
    applyBinarize(imageData, threshold);
  }

  if (options.invert) {
    applyInvert(imageData);
  }

  // Put imageData back and return
  workingCtx.putImageData(imageData, 0, 0);
  return canvasToDataUrl(workingCanvas);
}

/**
 * Split a page image at its vertical center line, return [left, right] dataURLs
 * @param dataUrl - Source image as data URL
 */
export async function splitPageCenter(dataUrl: string): Promise<[string, string]> {
  const { imageData, width } = await getImageData(dataUrl);
  const splitX = width / 2;

  const leftDataUrl = extractCanvasRegion(
    (() => {
      const { canvas, ctx } = createCanvas(width, imageData.height);
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    })(),
    0,
    0,
    splitX,
    imageData.height
  );

  const rightDataUrl = extractCanvasRegion(
    (() => {
      const { canvas, ctx } = createCanvas(width, imageData.height);
      ctx.putImageData(imageData, 0, 0);
      return canvas;
    })(),
    splitX,
    0,
    width - splitX,
    imageData.height
  );

  return [leftDataUrl, rightDataUrl];
}

/**
 * Auto-detect page split position (finds vertical gap with least content)
 * @param dataUrl - Source image as data URL
 */
export async function splitPageAuto(dataUrl: string): Promise<[string, string]> {
  const { imageData, width, height } = await getImageData(dataUrl);

  // Find the vertical gap
  const splitX = findVerticalSplitPosition(imageData);

  // Create working canvas
  const { canvas, ctx } = createCanvas(width, height);
  ctx.putImageData(imageData, 0, 0);

  const leftDataUrl = extractCanvasRegion(canvas, 0, 0, splitX, height);
  const rightDataUrl = extractCanvasRegion(canvas, splitX, 0, width - splitX, height);

  return [leftDataUrl, rightDataUrl];
}

/**
 * Deskew: detect text angle and rotate to straighten
 * @param dataUrl - Source image as data URL
 */
export async function deskewImage(
  dataUrl: string
): Promise<{ dataUrl: string; angle: number }> {
  const img = await loadImage(dataUrl);
  const { canvas, ctx } = createCanvas(img.width, img.height);
  ctx.drawImage(img, 0, 0);

  // Convert to grayscale for analysis
  let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  applyGrayscale(imageData);

  // Try different angles and find the one with maximum variance
  let maxVariance = -Infinity;
  let bestAngle = 0;

  for (let angle = -5; angle <= 5; angle += 0.25) {
    const rotatedCanvas = applyRotation(canvas, angle);
    const rotatedCtx = rotatedCanvas.getContext('2d');
    if (!rotatedCtx) continue;

    const rotatedImageData = rotatedCtx.getImageData(
      0,
      0,
      rotatedCanvas.width,
      rotatedCanvas.height
    );

    const variance = calculateProjectionVariance(rotatedImageData);
    if (variance > maxVariance) {
      maxVariance = variance;
      bestAngle = angle;
    }
  }

  // Apply best rotation
  const finalCanvas = applyRotation(canvas, bestAngle);
  const finalDataUrl = canvasToDataUrl(finalCanvas);

  return { dataUrl: finalDataUrl, angle: bestAngle };
}

/**
 * Auto-crop: remove white margins
 * @param dataUrl - Source image as data URL
 * @param threshold - Grayscale threshold for content detection (default 240)
 */
export async function autoCrop(dataUrl: string, threshold = 240): Promise<string> {
  const { imageData, width, height } = await getImageData(dataUrl);

  // Find content boundaries
  const boundaries = findContentBoundaries(imageData, threshold);

  // Add small padding
  const padding = 5;
  const left = Math.max(0, boundaries.left - padding);
  const top = Math.max(0, boundaries.top - padding);
  const right = Math.min(width, boundaries.right + padding);
  const bottom = Math.min(height, boundaries.bottom + padding);

  const cropWidth = right - left;
  const cropHeight = bottom - top;

  if (cropWidth <= 0 || cropHeight <= 0) {
    // No content found, return original
    return dataUrl;
  }

  // Create working canvas
  const { canvas, ctx } = createCanvas(width, height);
  ctx.putImageData(imageData, 0, 0);

  return extractCanvasRegion(canvas, left, top, cropWidth, cropHeight);
}

export default {
  applyPreprocess,
  splitPageCenter,
  splitPageAuto,
  deskewImage,
  autoCrop,
};
