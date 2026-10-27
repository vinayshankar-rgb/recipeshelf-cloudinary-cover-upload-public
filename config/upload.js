
import multer from "multer";

const upload = multer({
  // Store uploaded files in memory instead of on local disk.
  storage: multer.memoryStorage(),

  // Maximum file size: 4 MB.
  limits: {
    fileSize: 4 * 1024 * 1024,
    files: 1,
  },

  // Accept only JPEG and PNG images.
  fileFilter: (req, file, callback) => {
    const allowedTypes = ["image/jpeg", "image/png"];

    if (!allowedTypes.includes(file.mimetype)) {
      const error = new Error("Only JPG and PNG files are allowed");
      error.status = 400;
      return callback(error);
    }

    callback(null, true);
  },
});

export default upload;
