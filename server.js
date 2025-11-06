import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import path from "path";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const POLLO_VIDEO_API_BASE = process.env.POLLO_VIDEO_API_BASE;
const POLLO_VIDEO_API_KEY = process.env.POLLO_VIDEO_API_KEY;
const PORT = process.env.PORT || 4000;

// simple in-memory job tracking
const jobs = {};

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// Engines that will appear in your UI
const ENGINES = [
  { id: "veo-2", label: "Veo 2", supportsSeed: true },
  { id: "veo-3", label: "Veo 3", supportsSeed: true },
  { id: "veo-3.1", label: "Veo 3.1", supportsSeed: true },
  { id: "sora-2", label: "Sora 2", supportsSeed: false },
];

const ASPECT_RATIOS = ["1:1", "9:16", "16:9"];

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

// Return engines + aspect ratios to UI
app.get("/api/meta", (req, res) => {
  res.json({
    engines: ENGINES,
    aspectRatios: ASPECT_RATIOS,
  });
});

// Create a new video job
app.post("/api/generate", async (req, res) => {
  try {
    const { engineId, prompt, aspectRatio, seed } = req.body;

    const engine = ENGINES.find(e => e.id === engineId);
    if (!engine) return res.status(400).json({ error: "Bad engine" });

    if (!prompt.trim()) return res.status(400).json({ error: "Prompt required" });

    // MAP aspect ratio
    const providerAspect = aspectRatio;

    // ✅ Replace this with your REAL API
    const response = await axios.post(
      `${POLLO_VIDEO_API_BASE}/jobs`,
      {
        model: engineId,
        prompt,
        aspect_ratio: providerAspect,
        duration_seconds: 5,
        seed: engine.supportsSeed ? seed : undefined,
      },
      {
        headers: { Authorization: `Bearer ${POLLO_VIDEO_API_KEY}` }
      }
    );

    const jobId = response.data.job_id || response.data.id;

    jobs[jobId] = {
      id: jobId,
      engineId,
      prompt,
      aspectRatio,
      seed,
      status: "queued",
      createdAt: new Date().toISOString(),
      localPath: null,
      videoUrl: null,
    };

    res.json({ jobId });

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "API error" });
  }
});

// Download helper
async function downloadFile(url, filePath) {
  const writer = fs.createWriteStream(filePath);
  const response = await axios.get(url, { responseType: "stream" });
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on("finish", resolve);
    writer.on("error", reject);
  });
}

// Poll job status
app.get("/api/status/:jobId", async (req, res) => {
  try {
    const jobId = req.params.jobId;
    const job = jobs[jobId];
    if (!job) return res.status(404).json({ error: "Unknown job" });

    const response = await axios.get(
      `${POLLO_VIDEO_API_BASE}/jobs/${jobId}`,
      { headers: { Authorization: `Bearer ${POLLO_VIDEO_API_KEY}` } }
    );

    const data = response.data;
    job.status = data.status;

    if (data.status === "succeeded" && !job.localPath) {
      const videoUrl = data.output_url || data.video_url;

      const dir = path.join(
        DOWNLOAD_DIR,
        job.engineId,
        slugify(job.prompt),
        job.aspectRatio.replace(":", "x")
      );

      fs.mkdirSync(dir, { recursive: true });

      const filename = `${job.engineId}_${Date.now()}.mp4`;
      const fullPath = path.join(dir, filename);

      await downloadFile(videoUrl, fullPath);

      job.localPath = fullPath;
      job.videoUrl = videoUrl;
    }

    res.json(job);

  } catch (err) {
    console.error(err.response?.data || err.message);
    res.status(500).json({ error: "Status error" });
  }
});

// List all jobs
app.get("/api/jobs", (req, res) => {
  res.json(Object.values(jobs));
});

app.listen(PORT, () => {
  console.log(`✅ Server running on http://localhost:${PORT}`);
});
