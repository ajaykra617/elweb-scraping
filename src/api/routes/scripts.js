import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import Script from "../models/Script.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

// temp dir
const upload = multer({ dest: "/tmp" });

/**
 * UPLOAD SCRIPT (AUTH REQUIRED)
 */
router.post(
  "/upload",
  requireAuth,               // <<<<<<<<<< ADD THIS
  upload.single("scriptFile"),
  async (req, res) => {
    try {
      const file = req.file;

      if (!file) {
        return res.status(400).json({ error: "scriptFile required" });
      }

      const timestamp = Date.now();
      const original = file.originalname;
      const destPath = `/data/scripts/${timestamp}_${original}`;

      // FIX EXDEV: cannot rename across filesystems
      fs.copyFileSync(file.path, destPath);
      fs.unlinkSync(file.path);

      // Create DB record — NOW req.user is available
      const script = await Script.create({
        name: original,
        file_path: destPath,
        language: req.body.language || "node",
        userId: req.user.id,            // <— this now works!
      });

      return res.json({ success: true, script });
    } catch (err) {
      console.error("Script upload error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);

/**
 * LIST USER SCRIPTS
 */
router.get("/list", requireAuth, async (req, res) => {
  try {
    const userId = req.user.id;

    const scripts = await Script.findAll({
      where: { userId },
      order: [["id", "DESC"]],
    });

    res.json({ scripts });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/**
 * DELETE USER SCRIPT
 */
router.delete("/delete/:id", requireAuth, async (req, res) => {
  const userId = req.user.id;
  const script = await Script.findByPk(req.params.id);

  if (!script) return res.status(404).json({ error: "Not found" });
  if (script.userId !== userId)
    return res.status(403).json({ error: "Not allowed" });

  try {
    if (fs.existsSync(script.file_path)) fs.unlinkSync(script.file_path);
  } catch {}

  await script.destroy();
  res.json({ success: true });
});

export default router;