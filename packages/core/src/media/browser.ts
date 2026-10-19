import { normalizeMediaOptimizationOptions, type MediaOptimizationOptions } from './optimization.js';

/**
 * Browser canvas optimization settings; browser helper defaults bounds to 1600 pixels and format to webp.
 */
export type BrowserImageOptimizationOptions = MediaOptimizationOptions;

const passthroughTypes = new Set(['image/gif', 'image/svg+xml']);
const rasterTypes = new Set(['image/avif', 'image/jpeg', 'image/png', 'image/webp']);

function isBrowserImage(file: File): boolean {
  return file.type.startsWith('image/') && !passthroughTypes.has(file.type);
}

function isRasterImage(file: File): boolean {
  return rasterTypes.has(file.type) || file.type === 'image/';
}

/**
 * Resizes supported raster images without upscaling and encodes them through browser canvas APIs.
 *
 * @param file - Selected file to optimize before upload.
 * @param options - Output settings; dimensions default to 1600 by 1600, format to webp, and quality to 0.82.
 * @returns A newly encoded File preserving lastModified, or the original file when processing is unavailable, unsupported, or fails.
 * @remarks Uses browser Image, document, canvas, and object-URL APIs. GIF, SVG, unsupported inputs, and original format requests pass through. Encoder MIME support depends on the browser; upload and access control remain host responsibilities.
 * @example
 * ```ts
 * import { optimizeBrowserImageFile } from '@alneas/sitekit/media';
 * const input = document.createElement('input');
 * input.type = 'file';
 * input.onchange = async () => {
 *   const file = input.files?.[0];
 *   if (file) console.log(await optimizeBrowserImageFile(file, { maxWidth: 1200 }));
 * };
 * document.body.append(input);
 * ```
 */
export async function optimizeBrowserImageFile(
  file: File,
  options: BrowserImageOptimizationOptions = {},
): Promise<File> {
  if (!isBrowserImage(file) || !isRasterImage(file)) return file;

  const normalized = normalizeMediaOptimizationOptions({
    maxWidth: options.maxWidth ?? 1600,
    maxHeight: options.maxHeight ?? 1600,
    format: options.format ?? 'webp',
    quality: options.quality ?? 0.82,
  });
  if (normalized.format === 'original') return file;

  const imageConstructor = globalThis.Image;
  const documentObject = globalThis.document;
  if (imageConstructor === undefined || documentObject === undefined) return file;

  const sourceUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const loaded = new imageConstructor();
      loaded.onload = () => resolve(loaded);
      loaded.onerror = () => reject(new Error('Unable to decode image for optimization'));
      loaded.src = sourceUrl;
    });

    const scale = Math.min(
      1,
      (normalized.maxWidth ?? image.naturalWidth) / image.naturalWidth,
      (normalized.maxHeight ?? image.naturalHeight) / image.naturalHeight,
    );
    const width = Math.max(1, Math.round(image.naturalWidth * scale));
    const height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = documentObject.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return file;
    context.drawImage(image, 0, 0, width, height);

    const mimeType = normalized.format === 'jpeg' ? 'image/jpeg' : `image/${normalized.format}`;
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, mimeType, normalized.quality));
    if (!blob) return file;

    const extension = normalized.format === 'jpeg' ? 'jpg' : normalized.format;
    const fileName = file.name.replace(/\.[^./]+$/, '') || 'image';
    return new File([blob], `${fileName}.${extension}`, {
      type: blob.type || mimeType,
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
}
