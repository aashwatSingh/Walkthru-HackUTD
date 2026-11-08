// Resize + compress a photo before upload: max 1024 px, JPEG quality 0.75 (~80–150 KB).
// Required, not optional: NVIDIA's API rejects full-size phone photos with HTTP 415 (spec Sections 6, 8.1).
export async function compressImage(file, maxSide = 1024, quality = 0.75) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // modern browsers apply the photo's rotation here
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (!blob) throw new Error('Could not compress the photo.');
    return blob;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const MAX_VIDEO_BYTES = 50 * 1024 * 1024;
