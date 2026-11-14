import { ImageAttachment } from '../types/live';

export function readImageFile(file: File, maxDimension = 1280): Promise<ImageAttachment> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read selected image file.'));
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const img = new Image();
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.onload = () => {
        const scale = Math.min(1, maxDimension / Math.max(img.width, img.height));
        const width = Math.max(1, Math.round(img.width * scale));
        const height = Math.max(1, Math.round(img.height * scale));

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          const base64 = dataUrl.split(',')[1] ?? '';
          resolve({
            data: base64,
            mimeType: file.type || 'image/jpeg',
            previewUrl: dataUrl,
          });
          return;
        }

        ctx.drawImage(img, 0, 0, width, height);
        const outMime = file.type === 'image/png' ? 'image/png' : 'image/jpeg';
        const resizedUrl = canvas.toDataURL(outMime, 0.9);
        const base64 = resizedUrl.split(',')[1] ?? '';
        resolve({
          data: base64,
          mimeType: outMime,
          previewUrl: resizedUrl,
        });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
  });
}
