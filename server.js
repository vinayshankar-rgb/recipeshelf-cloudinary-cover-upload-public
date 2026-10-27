
import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { v2 as cloudinary } from "cloudinary";
import upload from "./config/upload.js";

const app = express();
const port = process.env.PORT || 5000;

// Cloudinary configuration uses environment variables.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

app.use(cors());
app.use(express.json());

// No local /uploads static route is needed with Cloudinary.

const recipes = [
  {
    id: "r1",
    title: "Roasted Tomato Pasta",
    coverUrl: null,
    coverPublicId: null,
  },
  {
    id: "r2",
    title: "Lemon Rice Bowl",
    coverUrl: null,
    coverPublicId: null,
  },
];

app.get("/health", (req, res) => {
  res.json({ status: "ok", app: "RecipeShelf" });
});

app.get("/api/recipes", (req, res) => {
  res.json({ recipes });
});

app.get("/api/recipes/:recipeId", (req, res) => {
  const recipe = recipes.find((item) => item.id === req.params.recipeId);

  if (!recipe) {
    return res.status(404).json({ message: "Recipe not found" });
  }

  return res.json({ recipe });
});

// Upload an in-memory buffer to Cloudinary.
function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "recipeshelf/covers",
        resource_type: "image",
      },
      (error, result) => {
        if (error) {
          return reject(error);
        }

        if (!result) {
          return reject(new Error("Cloudinary returned no result"));
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
}

app.post(
  "/api/recipes/:recipeId/cover",
  upload.single("cover"),
  async (req, res) => {
    // 1. Check the recipe before uploading anything.
    const recipe = recipes.find((item) => item.id === req.params.recipeId);

    if (!recipe) {
      return res.status(404).json({ message: "Recipe not found" });
    }

    // 2. A file must be provided using the "cover" field.
    if (!req.file) {
      return res.status(400).json({
        message: 'Cover image is required in the "cover" field',
      });
    }

    // 3. Verify the actual file signature, not only the MIME type.
    try {
      const detectedType = await fileTypeFromBuffer(req.file.buffer);

      if (!detectedType || !["jpg", "png"].includes(detectedType.ext)) {
        return res.status(400).json({
          message: "Only valid JPG and PNG images are allowed",
        });
      }
    } catch (error) {
      return res.status(400).json({
        message: "Invalid image file",
      });
    }

    // 4. Upload the new cover to Cloudinary.
    let result;

    try {
      result = await uploadToCloudinary(req.file.buffer);
    } catch (error) {
      console.error("Cloudinary upload failed:", error.message);

      return res.status(502).json({
        message: "Cloudinary upload failed",
      });
    }

    // 5. Preserve the old public ID, then save the new cover.
    const previousPublicId = recipe.coverPublicId;

    recipe.coverUrl = result.secure_url;
    recipe.coverPublicId = result.public_id;

    // 6. Delete the previous cover only after the new cover is saved.
    if (previousPublicId && previousPublicId !== result.public_id) {
      try {
        await cloudinary.uploader.destroy(previousPublicId);
      } catch (error) {
        // The new cover is already saved. Log cleanup failures.
        console.error("Previous cover cleanup failed:", error.message);
      }
    }

    // 7. Return the required response.
    return res.status(200).json({
      recipeId: recipe.id,
      coverUrl: recipe.coverUrl,
    });
  }
);

// Centralized Multer and input error handling.
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({
        message: "Cover image must not exceed 4 MB",
      });
    }

    return res.status(400).json({ message: error.message });
  }

  if (error.status === 400) {
    return res.status(400).json({ message: error.message });
  }

  console.error(error);
  return res.status(500).json({ message: "Unexpected server error" });
});

app.listen(port, () => {
  console.log(`RecipeShelf API running on http://localhost:${port}`);
});
