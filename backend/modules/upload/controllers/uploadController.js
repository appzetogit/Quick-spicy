import { successResponse, errorResponse } from "../../../shared/utils/response.js";
import { uploadToCloudinary } from "../../../shared/utils/cloudinaryService.js";
import { initializeCloudinary } from "../../../config/cloudinary.js";

export const uploadSingleMedia = async (req, res) => {
  try {
    await initializeCloudinary();

    if (!req.file) {
      return errorResponse(res, 400, "No file provided");
    }

    if (!req.file.buffer || req.file.buffer.length === 0) {
      return errorResponse(res, 400, "File buffer is empty or invalid");
    }

    const folder = req.body.folder || "appzeto/uploads";

    const result = await uploadToCloudinary(req.file.buffer, {
      folder,
      resource_type: "image",
      ...(req.file.mimetype && {
        context: {
          alt: req.file.originalname,
          caption: req.file.originalname,
        },
      }),
    });

    if (!result || !result.secure_url) {
      throw new Error("Local image storage failed: No secure_url in response");
    }

    return successResponse(res, 200, "File uploaded successfully", {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      bytes: result.bytes,
      format: result.format,
    });
  } catch (error) {
    console.error("Local image upload error:", {
      message: error.message,
      stack: error.stack,
      errorType: error.constructor.name,
      hasFile: !!req.file,
      fileName: req.file?.originalname,
      fileSize: req.file?.size,
      bufferSize: req.file?.buffer?.length,
    });

    const errorMessage = error.message || "Failed to upload file";
    return errorResponse(res, 500, `File upload failed: ${errorMessage}`);
  }
};
