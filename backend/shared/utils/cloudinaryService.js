import { deleteStoredImage, storeImageBuffer, uploadMiddleware } from "./imageStorage.js";

export { uploadMiddleware };

/**
 * Legacy wrapper retained to avoid touching every controller.
 * The app now stores images locally on VPS storage.
 */
export async function uploadToCloudinary(buffer, options = {}) {
  return storeImageBuffer(buffer, options);
}

/**
 * Legacy wrapper retained for local storage deletes.
 */
export function deleteFromCloudinary(publicId) {
  return deleteStoredImage(publicId);
}
