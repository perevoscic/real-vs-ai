import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import FormData from "form-data";
import path from "path";
import fs from "fs";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const VIDEO_API_BASE = process.env.VIDEO_API_BASE;
const VIDEO_API_KEY = process.env.VIDEO_API_KEY;
const PORT = process.env.PORT || 4000;
const RUNWAY_API_BASE = process.env.RUNWAY_API_BASE || "https://api.dev.runwayml.com/v1";
const RUNWAY_API_KEY = process.env.RUNWAY_API_KEY;
const RUNWAY_API_VERSION = process.env.RUNWAY_API_VERSION || "2024-11-06";
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_API_BASE = process.env.GEMINI_API_BASE || "https://generativelanguage.googleapis.com/v1beta";

// simple in-memory job tracking
const jobs = {};

const DOWNLOAD_DIR = path.join(process.cwd(), "downloads");
if (!fs.existsSync(DOWNLOAD_DIR)) fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// Engines that will appear in your UI + API wiring
const ENGINE_CONFIG = {
  "pollo-v1-6": {
    label: "Pollo v1.6",
    provider: "pollo",
    apiModel: "pollo-v1-6",
    supportsSeed: true,
    minLength: 5,
    maxLength: 20,
    defaultLength: 10,
  },
  "runway-gen3a": {
    label: "Runway Gen-3 Alpha Turbo",
    provider: "runway",
    apiModel: process.env.RUNWAY_MODEL || "gen3a_turbo",
    supportsSeed: true,
    minLength: 5,
    maxLength: 10,
    defaultLength: 5,
    allowedDurations: [5, 10],
    requiresPromptImage: true,
  },
  "kling-v2-5-turbo": {
    label: "Kling v2.5 Turbo",
    provider: "kling-ai",
    apiModel: "kling-v2-5-turbo",
    supportsSeed: false,
    minLength: 5,
    maxLength: 15,
    defaultLength: 6,
  },
  "kling-v2-1-master": {
    label: "Kling v2.1 Master",
    provider: "kling-ai",
    apiModel: "kling-v2-1-master",
    supportsSeed: false,
    minLength: 5,
    maxLength: 15,
    defaultLength: 6,
  },
  "pika-v2-2": {
    label: "Pika v2.2",
    provider: "pika",
    apiModel: "pika-v2-2",
    supportsSeed: true,
    minLength: 5,
    maxLength: 20,
    defaultLength: 6,
  },
  "pika-v2-1": {
    label: "Pika v2.1",
    provider: "pika",
    apiModel: "pika-v2-1",
    supportsSeed: true,
    minLength: 5,
    maxLength: 20,
    defaultLength: 6,
  },
  "wan-v2-5-preview": {
    label: "Wanx v2.5 Preview",
    provider: "wanx",
    apiModel: "wan-v2-5-preview",
    supportsSeed: true,
    minLength: 5,
    maxLength: 20,
    defaultLength: 8,
  },
  "wan-v2-2-flash": {
    label: "Wanx v2.2 Flash",
    provider: "wanx",
    apiModel: "wan-v2-2-flash",
    supportsSeed: true,
    minLength: 5,
    maxLength: 20,
    defaultLength: 6,
  },
  "wan-v2-2-plus": {
    label: "Wanx v2.2 Plus",
    provider: "wanx",
    apiModel: "wan-v2-2-plus",
    supportsSeed: true,
    minLength: 5,
    maxLength: 20,
    defaultLength: 6,
  },
  "wanx-v2-1": {
    label: "Wanx v2.1",
    provider: "wanx",
    apiModel: "wanx-v2-1",
    supportsSeed: true,
    minLength: 5,
    maxLength: 20,
    defaultLength: 6,
  },
  "sora-2": {
    label: "Sora 2",
    provider: "openai",
    apiModel: "sora-2",
    supportsSeed: false,
    minLength: 4,
    maxLength: 12,
    defaultLength: 8,
    allowedDurations: [4, 8, 12],
    models: ["sora-2", "sora-2-pro"],
    defaultModel: "sora-2",
    sizes: ["1280x720", "720x1280", "1792x1024", "1024x1792"],
    defaultSize: "1280x720",
    allowsReferenceImage: true,
  },
  "gemini-api": {
    label: "Gemini API - Veo",
    provider: "gemini",
    apiModel: "veo-3.1-generate-preview",
    supportsSeed: false,
    minLength: 4,
    maxLength: 8,
    defaultLength: 8,
    allowedDurations: [4, 6, 8],
    models: [
      "veo-3.1-generate-preview",
      "veo-3.1-fast-generate-preview",
      "veo-3.0-generate-001",
      "veo-3.0-fast-generate-001",
      "veo-2.0-generate-001",
    ],
    defaultModel: "veo-3.1-generate-preview",
    sizes: ["720p", "1080p"],
    defaultSize: "720p",
    allowsReferenceImage: true,
  },
};

const ENGINES = Object.entries(ENGINE_CONFIG).map(([id, config]) => ({
  id,
  label: config.label,
  supportsSeed: config.supportsSeed,
  minLength: config.minLength ?? 5,
  maxLength: config.maxLength ?? 20,
  defaultLength: config.defaultLength ?? config.minLength ?? 5,
  provider: config.provider,
  allowedDurations: config.allowedDurations ?? null,
  requiresPromptImage: Boolean(config.requiresPromptImage),
  defaultModel: config.defaultModel ?? null,
  models: config.models ?? null,
  defaultSize: config.defaultSize ?? null,
  sizes: config.sizes ?? null,
  allowsReferenceImage: Boolean(config.allowsReferenceImage),
}));

const SORA_MODEL_FALLBACK = "sora-2";
const SORA_SIZE_FALLBACK = "1280x720";
const SORA_SECONDS_FALLBACK = "4";

const SORA_ALLOWED_MODELS = new Set(["sora-2", "sora-2-pro"]);
const SORA_ALLOWED_SIZES = new Set(["1280x720", "720x1280", "1792x1024", "1024x1792"]);
const SORA_ALLOWED_SECONDS = new Set(["4", "8", "12"]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceSoraValue(value, set, fallback) {
  if (!value) return fallback;
  const trimmed = String(value).trim();
  if (!trimmed) return fallback;
  return set.has(trimmed) ? trimmed : fallback;
}

function coerceSoraModel(value, fallback = SORA_MODEL_FALLBACK) {
  return coerceSoraValue(value, SORA_ALLOWED_MODELS, fallback);
}

function coerceSoraSize(value, fallback = SORA_SIZE_FALLBACK) {
  return coerceSoraValue(value, SORA_ALLOWED_SIZES, fallback);
}

function coerceSoraSeconds(value, fallback = SORA_SECONDS_FALLBACK) {
  return coerceSoraValue(value, SORA_ALLOWED_SECONDS, fallback);
}

function toUnixSeconds(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 1e12 ? Math.round(value / 1000) : Math.round(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    if (Number.isFinite(parsed)) {
      return parsed > 1e12 ? Math.round(parsed / 1000) : Math.round(parsed);
    }
    const timestamp = Date.parse(trimmed);
    if (Number.isFinite(timestamp)) {
      return Math.round(timestamp / 1000);
    }
  }
  return null;
}

function readString(value) {
  return typeof value === "string" ? value : null;
}

function extractSoraDownloadUrl(video) {
  if (!isRecord(video)) return null;

  const directDownload =
    readString(video.download_url) || readString(video.content_url);
  if (directDownload) return directDownload;

  if (isRecord(video.assets) && isRecord(video.assets.video)) {
    const nested = readString(video.assets.video.download_url);
    if (nested) return nested;
  }

  const searchCollection = (collection) => {
    if (!Array.isArray(collection)) return null;
    for (const entry of collection) {
      if (!isRecord(entry)) continue;
      const url = readString(entry.download_url) || readString(entry.url);
      if (url) return url;
    }
    return null;
  };

  const downloadFromAssets = searchCollection(video.assets);
  if (downloadFromAssets) return downloadFromAssets;

  return searchCollection(video.output);
}

function extractSoraThumbnailUrl(video) {
  if (!isRecord(video)) return null;

  const direct = readString(video.thumbnail_url);
  if (direct) return direct;

  if (isRecord(video.assets) && isRecord(video.assets.thumbnail)) {
    const nested = readString(video.assets.thumbnail.url);
    if (nested) return nested;
  }

  if (Array.isArray(video.assets)) {
    for (const asset of video.assets) {
      if (!isRecord(asset)) continue;
      if (readString(asset.type) === "thumbnail") {
        const url = readString(asset.url);
        if (url) return url;
      }
    }
  }

  return null;
}

function resolveSoraVideoId(video, now) {
  const directId = readString(video.id) || readString(video.video_id);
  if (directId) return directId;

  if (isRecord(video.data)) {
    const nestedId = readString(video.data.id);
    if (nestedId) return nestedId;
  }

  return `video_${now}`;
}

function normalizeSoraResponse(video, fallback) {
  const now = Math.floor(Date.now() / 1000);
  const videoData = isRecord(video) ? video : {};

  const statusRaw =
    readString(videoData.status) || readString(videoData.state) || "queued";

  const createdAt = toUnixSeconds(videoData.created_at) ?? now;
  const completedAt =
    toUnixSeconds(videoData.completed_at) ??
    (statusRaw === "completed" ? now : null);

  const remixVideoId =
    readString(videoData.remix_video_id) ||
    readString(videoData.remix_of) ||
    readString(videoData.remixed_from_video_id) ||
    null;

  return {
    ...videoData,
    id: resolveSoraVideoId(videoData, now),
    status: statusRaw,
    prompt: fallback.prompt,
    model: coerceSoraModel(readString(videoData.model) ?? fallback.model),
    size: coerceSoraSize(readString(videoData.size) ?? fallback.size),
    seconds: coerceSoraSeconds(
      readString(
        videoData.seconds !== undefined && videoData.seconds !== null
          ? String(videoData.seconds)
          : null
      ) ?? fallback.seconds
    ),
    created_at: createdAt,
    completed_at: completedAt,
    remix_video_id: remixVideoId,
    download_url: extractSoraDownloadUrl(videoData),
    thumbnail_url: extractSoraThumbnailUrl(videoData),
    error: "error" in videoData ? videoData.error ?? null : null,
  };
}

function mapSoraStatus(status) {
  const normalized = String(status || "").toLowerCase();
  if (!normalized) return "queued";
  if (["pending", "queued", "waiting", "submitted"].includes(normalized)) {
    return "queued";
  }
  if (
    ["processing", "running", "generating", "in_progress", "creating"].includes(
      normalized
    )
  ) {
    return "running";
  }
  if (["completed", "succeeded", "finished", "ready"].includes(normalized)) {
    return "succeeded";
  }
  if (
    ["failed", "errored", "error", "canceled", "cancelled", "rejected"].includes(
      normalized
    )
  ) {
    return "failed";
  }
  return normalized;
}

function parseSoraReferenceImage(dataUrl, filename = "input-reference") {
  if (typeof dataUrl !== "string" || !dataUrl.trim()) return null;
  const trimmed = dataUrl.trim();

  const base64Pattern = /^data:([^;]+);base64,(.+)$/i;
  const match = base64Pattern.exec(trimmed);
  if (match) {
    const [, mimeType, base64Payload] = match;
    try {
      const buffer = Buffer.from(base64Payload, "base64");
      return { buffer, mimeType: mimeType || "image/png", filename };
    } catch (error) {
      console.warn("Failed to parse Sora reference image:", error);
      return null;
    }
  }

  try {
    const buffer = Buffer.from(trimmed, "base64");
    if (!buffer.length) return null;
    return { buffer, mimeType: "image/png", filename };
  } catch (error) {
    console.warn("Failed to parse raw base64 image for Sora:", error);
    return null;
  }
}

const ASPECT_RATIOS = ["1:1", "9:16", "16:9"];

function slugify(str) {
  return (str || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function mapRunwayAspectRatio(aspectRatio) {
  // Runway Gen-3 expects resolution-style strings instead of simple aspect ratios.
  const normalized = String(aspectRatio).trim();
  const ratioMap = {
    "16:9": "1280:768",
    "9:16": "768:1280",
    "1:1": null,
    "1280:768": "1280:768",
    "768:1280": "768:1280",
  };
  return ratioMap.hasOwnProperty(normalized) ? ratioMap[normalized] : null;
}

function mapRunwayStatus(status) {
  const normalized = String(status || "").toUpperCase();
  switch (normalized) {
    case "PENDING":
    case "THROTTLED":
      return "queued";
    case "RUNNING":
      return "running";
    case "SUCCEEDED":
      return "succeeded";
    case "FAILED":
    case "CANCELED":
      return "failed";
    default:
      return normalized.toLowerCase() || "queued";
  }
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
    const {
      engineId,
      prompt,
      aspectRatio,
      seed,
      lengthSeconds,
      duration, // Accept duration as alias for lengthSeconds
      promptImage,
      model: requestedModel,
      size: requestedSize,
      resolution, // Accept resolution as alias for size
      promptImageName,
    } = req.body;

    // Use duration if provided, otherwise fall back to lengthSeconds
    const effectiveLength = duration !== undefined ? duration : lengthSeconds;
    // Use resolution if provided, otherwise fall back to requestedSize
    const effectiveSize = resolution !== undefined ? resolution : requestedSize;

    console.log("Received /api/generate request:", {
      engineId,
      prompt,
      aspectRatio,
      seed,
      lengthSeconds,
      promptImageProvided: Boolean(promptImage),
      model: requestedModel,
      size: requestedSize,
    });

    const engine = ENGINE_CONFIG[engineId];
    if (!engine) {
      console.warn("Invalid engineId received:", engineId);
      return res.status(400).json({ error: "Bad engine" });
    }

    if (!prompt?.trim()) {
      console.warn("Prompt is required for engine:", engineId);
      return res.status(400).json({ error: "Prompt required" });
    }

    if (!aspectRatio && engine.provider !== "openai" && engine.provider !== "gemini") {
      console.warn("Aspect ratio is required for engine:", engineId);
      return res.status(400).json({ error: "Aspect ratio required" });
    }

    const minLength = engine.minLength ?? 5;
    const maxLength = engine.maxLength ?? 20;
    const defaultLength = engine.defaultLength ?? minLength;
    const numericLength =
      typeof effectiveLength === "number" && Number.isFinite(effectiveLength)
        ? Math.round(effectiveLength)
        : defaultLength;

    if (numericLength < minLength || numericLength > maxLength) {
      console.warn(
        `Length out of range for engine ${engineId}: ${numericLength} (allowed ${minLength}-${maxLength})`
      );
      return res
        .status(400)
        .json({ error: `Length must be between ${minLength} and ${maxLength} seconds` });
    }

    if (
      Array.isArray(engine.allowedDurations) &&
      engine.allowedDurations.length &&
      !engine.allowedDurations.includes(numericLength)
    ) {
      console.warn(
        `Length not supported for engine ${engineId}: ${numericLength} (allowed values ${engine.allowedDurations.join(
          ", "
        )})`
      );
      return res
        .status(400)
        .json({ error: `Length must be one of: ${engine.allowedDurations.join(", ")}` });
    }

    let jobId;
    let jobRecord;

    if (engine.provider === "runway") {
      if (!RUNWAY_API_KEY) {
        console.error("Missing RUNWAY_API_KEY in environment for Runway request.");
        return res.status(500).json({ error: "Runway API key not configured" });
      }

      const runwayRatio = mapRunwayAspectRatio(aspectRatio);
      if (!runwayRatio) {
        console.warn("Unsupported aspect ratio for Runway:", aspectRatio);
        return res.status(400).json({ error: "Aspect ratio not supported for Runway Gen-3" });
      }

      if (!promptImage || typeof promptImage !== "string") {
        console.warn("Missing promptImage in request for Runway Gen-3 job.");
        return res.status(400).json({ error: "Runway Gen-3 requires an image upload" });
      }

      const runwayPayload = {
        model: engine.apiModel,
        promptText: prompt.trim(),
        promptImage,
        ratio: runwayRatio,
        duration: numericLength,
        watermark: false,
      };

      if (engine.supportsSeed && (seed || seed === 0)) {
        const numericSeed = Number(seed);
        if (Number.isFinite(numericSeed)) {
          runwayPayload.seed = numericSeed;
        }
      }

      const payloadLog = {
        ...runwayPayload,
        promptImage: `data-url (${promptImage.length} chars)`,
      };
      console.log("Making API call to Runway for video generation:", {
        endpoint: `${RUNWAY_API_BASE}/image_to_video`,
        payload: payloadLog,
      });

      const response = await axios.post(`${RUNWAY_API_BASE}/image_to_video`, runwayPayload, {
        headers: {
          Authorization: `Bearer ${RUNWAY_API_KEY}`,
          "Content-Type": "application/json",
          "X-Runway-Version": RUNWAY_API_VERSION,
        },
      });

      jobId = response.data?.id;
      if (!jobId) {
        console.error("Runway API did not return a job identifier:", response.data);
        return res.status(502).json({ error: "Missing job id from provider" });
      }
      console.log("Runway API responded with jobId:", jobId, "and data:", response.data);
    } else if (engine.provider === "openai") {
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
      if (!OPENAI_API_KEY) {
        console.error("Missing OPENAI_API_KEY in environment for Sora request.");
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      const openaiBase =
        (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
      const organization = process.env.OPENAI_ORG_ID?.trim();
      const project = process.env.OPENAI_PROJECT_ID?.trim();

      const allowedModels = Array.isArray(engine.models) && engine.models.length
        ? engine.models
        : Array.from(SORA_ALLOWED_MODELS);
      const defaultModel = engine.defaultModel || allowedModels[0] || SORA_MODEL_FALLBACK;
      const requestedModelClean =
        typeof requestedModel === "string" ? requestedModel.trim() : "";
      const selectedModel = allowedModels.includes(requestedModelClean)
        ? requestedModelClean
        : defaultModel;

      const allowedSizes = Array.isArray(engine.sizes) && engine.sizes.length
        ? engine.sizes
        : Array.from(SORA_ALLOWED_SIZES);
      const defaultSize = engine.defaultSize || allowedSizes[0] || SORA_SIZE_FALLBACK;
      const requestedSizeClean =
        typeof requestedSize === "string" ? requestedSize.trim() : "";
      const aspectCandidate =
        typeof aspectRatio === "string" ? aspectRatio.trim() : "";
      const selectedSize = allowedSizes.includes(requestedSizeClean)
        ? requestedSizeClean
        : allowedSizes.includes(aspectCandidate)
        ? aspectCandidate
        : defaultSize;

      const secondsFallback = engine.allowedDurations?.length
        ? String(engine.defaultLength ?? engine.allowedDurations[0])
        : String(engine.defaultLength ?? numericLength);
      const secondsValue = coerceSoraSeconds(String(numericLength), secondsFallback);

      const referenceImageName =
        typeof promptImageName === "string" && promptImageName.trim()
          ? promptImageName.trim()
          : "input-reference";
      const referenceImage = engine.allowsReferenceImage
        ? parseSoraReferenceImage(promptImage, referenceImageName)
        : null;

      const baseHeaders = {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      };
      if (organization) baseHeaders["OpenAI-Organization"] = organization;
      if (project) baseHeaders["OpenAI-Project"] = project;

      const endpoint = `${openaiBase}/videos`;

      let response;
      try {
        if (referenceImage) {
          const formData = new FormData();
          formData.append("prompt", prompt.trim());
          formData.append("model", selectedModel);
          formData.append("size", selectedSize);
          formData.append("seconds", secondsValue);
          formData.append("input_reference", referenceImage.buffer, {
            filename: referenceImage.filename,
            contentType: referenceImage.mimeType,
          });

          const headers = { ...baseHeaders, ...formData.getHeaders() };
          response = await axios.post(endpoint, formData, { headers });
        } else {
          const headers = { ...baseHeaders, "Content-Type": "application/json" };
          const payload = {
            prompt: prompt.trim(),
            model: selectedModel,
            size: selectedSize,
            seconds: secondsValue,
          };
          response = await axios.post(endpoint, payload, { headers });
        }
      } catch (error) {
        console.error(
          "OpenAI video generation error:",
          error.response?.data || error.message
        );
        const message =
          error.response?.data?.error?.message ||
          error.response?.data?.message ||
          error.message ||
          "OpenAI video generation failed";
        const status = error.response?.status || 502;
        return res.status(status).json({ error: message });
      }

      const fallbackPayload = {
        prompt: prompt.trim(),
        model: selectedModel,
        size: selectedSize,
        seconds: secondsValue,
      };
      const normalized = normalizeSoraResponse(response.data, fallbackPayload);

      jobId = normalized?.id || response.data?.id || response.data?.video_id;
      if (!jobId) {
        console.error("OpenAI video response missing id:", response.data);
        return res.status(502).json({ error: "Missing job id from provider" });
      }

      const status = mapSoraStatus(normalized.status);
      const normalizedSeconds =
        Number(normalized.seconds) || Number(secondsValue) || numericLength;

      jobRecord = {
        id: jobId,
        engineId,
        prompt,
        aspectRatio: selectedSize,
        seed,
        status,
        createdAt: new Date().toISOString(),
        localPath: null,
        videoUrl: normalized.download_url || null,
        lengthSeconds: normalizedSeconds,
        provider: engine.provider,
        model: normalized.model || selectedModel,
        size: normalized.size || selectedSize,
        thumbnailUrl: normalized.thumbnail_url || null,
        remoteStatus: normalized.status || null,
        error: normalized.error || null,
        referenceImageName: referenceImage ? referenceImage.filename : null,
      };
    } else if (engine.provider === "gemini") {
      if (!GEMINI_API_KEY) {
        console.error("Missing GEMINI_API_KEY in environment for Gemini request.");
        return res.status(500).json({ error: "Gemini API key not configured" });
      }

      const allowedModels = Array.isArray(engine.models) && engine.models.length
        ? engine.models
        : ["veo-3.1-generate-preview"];
      const defaultModel = engine.defaultModel || allowedModels[0];
      const requestedModelClean =
        typeof requestedModel === "string" ? requestedModel.trim() : "";
      const selectedModel = allowedModels.includes(requestedModelClean)
        ? requestedModelClean
        : defaultModel;

      const resolution = typeof effectiveSize === "string" && effectiveSize.trim()
        ? effectiveSize.trim()
        : engine.defaultSize || "720p";

      // Map resolution to Gemini format (720p -> "720p", 1080p -> "1080p")
      const geminiResolution = resolution === "1080p" ? "1080p" : "720p";

      // Get aspect ratio (default to 16:9 if not provided)
      const geminiAspectRatio = typeof aspectRatio === "string" && aspectRatio.trim()
        ? aspectRatio.trim()
        : "16:9";

      // Parse reference image if provided
      const referenceImageName =
        typeof promptImageName === "string" && promptImageName.trim()
          ? promptImageName.trim()
          : "input-reference";
      const referenceImage = engine.allowsReferenceImage && promptImage
        ? parseSoraReferenceImage(promptImage, referenceImageName)
        : null;

      // Build Gemini API payload
      // According to Gemini API docs, the instances array should only contain prompt and optionally image
      const geminiPayload = {
        instances: [
          {
            prompt: prompt.trim(),
          },
        ],
      };

      // Add image if provided (image-to-video)
      if (referenceImage) {
        // Convert image buffer to base64
        const base64Image = referenceImage.buffer.toString("base64");
        const mimeType = referenceImage.mimeType || "image/png";
        geminiPayload.instances[0].image = {
          bytesBase64Encoded: base64Image,
          mimeType: mimeType,
        };
      }

      const endpoint = `${GEMINI_API_BASE}/models/${selectedModel}:predictLongRunning`;

      console.log("Making API call to Gemini for video generation:", {
        endpoint,
        model: selectedModel,
        aspectRatio: geminiAspectRatio,
        resolution: geminiResolution,
        duration: numericLength,
        hasImage: !!referenceImage,
      });

      let response;
      try {
        response = await axios.post(
          endpoint,
          geminiPayload,
          {
            headers: {
              "x-goog-api-key": GEMINI_API_KEY,
              "Content-Type": "application/json",
            },
          }
        );
      } catch (error) {
        console.error(
          "Gemini video generation error:",
          error.response?.data || error.message
        );
        const message =
          error.response?.data?.error?.message ||
          error.response?.data?.message ||
          error.message ||
          "Gemini video generation failed";
        const status = error.response?.status || 502;
        return res.status(status).json({ error: message });
      }

      // Gemini returns an operation name in the format "operations/{operation_id}"
      const operationName = response.data?.name;
      if (!operationName) {
        console.error("Gemini API did not return an operation name:", response.data);
        return res.status(502).json({ error: "Missing operation name from provider" });
      }

      // Extract just the operation ID for storage (remove "operations/" prefix if present)
      const operationId = operationName.includes("/") 
        ? operationName.split("/").pop() 
        : operationName;

      console.log("Gemini API responded with operation name:", operationName, "operation ID:", operationId);

      jobRecord = {
        id: operationId,
        engineId,
        prompt,
        aspectRatio: geminiAspectRatio,
        seed: null,
        status: "queued",
        createdAt: new Date().toISOString(),
        localPath: null,
        videoUrl: null,
        lengthSeconds: numericLength,
        provider: engine.provider,
        model: selectedModel,
        size: geminiResolution,
        thumbnailUrl: null,
        remoteStatus: null,
        error: null,
        referenceImageName: referenceImage ? referenceImage.filename : null,
        geminiOperationName: operationName, // Store full operation name for polling
      };
    } else {
      const input = {
        prompt: prompt.trim(),
        aspectRatio,
        length: numericLength,
      };

      if (engine.supportsSeed && (seed || seed === 0)) {
        input.seed = seed;
      }

      if (engine.inputModel) {
        input.model = engine.inputModel;
      }

      const requestBody = { input };

      const targetUrl = `${VIDEO_API_BASE}/${engine.provider}/${engine.apiModel}`;

      console.log(
        "Making API call to Pollo for video generation to URL:",
        targetUrl,
        "with body:",
        requestBody
      );
      const response = await axios.post(targetUrl, requestBody, {
        headers: {
          "x-api-key": VIDEO_API_KEY,
          "Content-Type": "application/json",
        },
      });

      jobId = response.data.taskId || response.data.job_id || response.data.id;
      if (!jobId) {
        console.error("Pollo API did not return a job identifier:", response.data);
        return res.status(502).json({ error: "Missing job id from provider" });
      }
      console.log("Pollo API responded with jobId:", jobId, "and data:", response.data);
    }

    if (!jobId) {
      return res.status(502).json({ error: "Missing job id from provider" });
    }

    if (!jobRecord) {
      jobRecord = {
        id: jobId,
        engineId,
        prompt,
        aspectRatio,
        seed,
        status: "queued",
        createdAt: new Date().toISOString(),
        localPath: null,
        videoUrl: null,
        lengthSeconds: numericLength,
        provider: engine.provider,
        model: typeof requestedModel === "string" ? requestedModel.trim() : null,
        size:
          typeof requestedSize === "string"
            ? requestedSize.trim()
            : typeof aspectRatio === "string"
            ? aspectRatio.trim()
            : null,
        thumbnailUrl: null,
        remoteStatus: null,
        referenceImageName: null,
      };
    } else {
      jobRecord.id = jobId;
      jobRecord.engineId = engineId;
      jobRecord.prompt = prompt;
      jobRecord.seed = seed;
      jobRecord.provider = engine.provider;
      jobRecord.createdAt = jobRecord.createdAt ?? new Date().toISOString();
      jobRecord.lengthSeconds = jobRecord.lengthSeconds ?? numericLength;
      jobRecord.aspectRatio =
        jobRecord.aspectRatio ??
        (typeof aspectRatio === "string" ? aspectRatio : null);
      jobRecord.videoUrl = jobRecord.videoUrl ?? null;
      jobRecord.localPath = jobRecord.localPath ?? null;
      jobRecord.model =
        jobRecord.model ??
        (typeof requestedModel === "string" ? requestedModel.trim() : null);
      jobRecord.size =
        jobRecord.size ??
        (typeof requestedSize === "string"
          ? requestedSize.trim()
          : typeof aspectRatio === "string"
          ? aspectRatio.trim()
          : null);
      jobRecord.thumbnailUrl = jobRecord.thumbnailUrl ?? null;
      jobRecord.remoteStatus = jobRecord.remoteStatus ?? null;
      jobRecord.referenceImageName = jobRecord.referenceImageName ?? null;
      jobRecord.status = jobRecord.status ?? "queued";
    }

    jobs[jobId] = jobRecord;

    res.json({ jobId });

  } catch (err) {
    console.error("Error in /api/generate:", err.response?.data || err.message);
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
    console.log("Received /api/status request for jobId:", jobId);
    const job = jobs[jobId];
    if (!job) {
      console.warn("Unknown job ID requested:", jobId);
      return res.status(404).json({ error: "Unknown job" });
    }

    if (job.provider === "runway") {
      if (!RUNWAY_API_KEY) {
        console.error("Missing RUNWAY_API_KEY when polling Runway status.");
        return res.status(500).json({ error: "Runway API key not configured" });
      }

      const statusUrl = `${RUNWAY_API_BASE}/tasks/${jobId}`;
      console.log("Polling Runway API for job status:", jobId, "via", statusUrl);
      const response = await axios.get(statusUrl, {
        headers: {
          Authorization: `Bearer ${RUNWAY_API_KEY}`,
          "X-Runway-Version": RUNWAY_API_VERSION,
        },
      });

      const data = response.data;
      console.log("Runway API status response for job", jobId + ":", data);
      job.status = mapRunwayStatus(data.status);
      job.error = data.failure || data.error || null;

      const outputs = Array.isArray(data.output)
        ? data.output
        : Array.isArray(data.outputs)
        ? data.outputs
        : [];

      if (!job.videoUrl) {
        const videoEntry = outputs.find((item) => {
          if (typeof item === "string") return item.toLowerCase().endsWith(".mp4");
          if (item && typeof item === "object") {
            const uri = item.uri || item.url;
            return typeof uri === "string" && uri.toLowerCase().endsWith(".mp4");
          }
          return false;
        });

        if (typeof videoEntry === "string") {
          job.videoUrl = videoEntry;
        } else if (videoEntry && typeof videoEntry === "object") {
          job.videoUrl = videoEntry.uri || videoEntry.url || null;
        }
      }

      if (job.status === "succeeded" && !job.localPath) {
        if (!job.videoUrl) {
          console.warn("No downloadable video URL found in Runway status response for job:", jobId);
          return res.json(job);
        }

        const dir = path.join(
          DOWNLOAD_DIR,
          job.engineId,
          slugify(job.prompt),
          (job.aspectRatio || "").replace(":", "x")
        );
        console.log("Creating download directory:", dir);
        fs.mkdirSync(dir, { recursive: true });

        const filename = `${job.engineId}_${Date.now()}.mp4`;
        const fullPath = path.join(dir, filename);
        console.log("Downloading video from", job.videoUrl, "to", fullPath);
        await downloadFile(job.videoUrl, fullPath);

        job.localPath = fullPath;
        console.log("Video download complete for job:", jobId);
      }

      job.runway = data;
      return res.json(job);
    }

    if (job.provider === "openai") {
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
      if (!OPENAI_API_KEY) {
        console.error("Missing OPENAI_API_KEY when polling Sora status.");
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      const openaiBase =
        (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");
      const organization = process.env.OPENAI_ORG_ID?.trim();
      const project = process.env.OPENAI_PROJECT_ID?.trim();

      const headers = {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      };
      if (organization) headers["OpenAI-Organization"] = organization;
      if (project) headers["OpenAI-Project"] = project;

      const statusUrl = `${openaiBase}/videos/${jobId}`;
      console.log("Polling OpenAI Sora for job status:", jobId, "via", statusUrl);
      const response = await axios.get(statusUrl, { headers });
      const data = response.data;

      const engine = ENGINE_CONFIG[job.engineId] || ENGINE_CONFIG["sora-2"] || {};
      const fallbackSeconds = coerceSoraSeconds(
        job.lengthSeconds != null ? String(job.lengthSeconds) : null,
        String(engine.defaultLength ?? SORA_SECONDS_FALLBACK)
      );
      const fallback = {
        prompt: job.prompt,
        model: job.model || engine.defaultModel || SORA_MODEL_FALLBACK,
        size:
          job.size ||
          job.aspectRatio ||
          engine.defaultSize ||
          SORA_SIZE_FALLBACK,
        seconds: fallbackSeconds,
      };

      const normalized = normalizeSoraResponse(data, fallback);

      job.remoteStatus = normalized.status || job.remoteStatus || null;
      job.status = mapSoraStatus(normalized.status);
      job.model = normalized.model || fallback.model || null;
      job.size = normalized.size || fallback.size || null;
      job.aspectRatio = job.size || job.aspectRatio || null;
      const normalizedSeconds = Number(normalized.seconds);
      if (Number.isFinite(normalizedSeconds)) {
        job.lengthSeconds = normalizedSeconds;
      }
      job.videoUrl = normalized.download_url || job.videoUrl || null;
      job.thumbnailUrl = normalized.thumbnail_url || job.thumbnailUrl || null;
      job.error = normalized.error || null;
      job.openai = data;

      if (job.status === "succeeded" && job.videoUrl && !job.localPath) {
        const dir = path.join(
          DOWNLOAD_DIR,
          job.engineId,
          slugify(job.prompt),
          (job.size || "unknown").replace(/[^a-z0-9]+/gi, "_")
        );
        console.log("Creating download directory:", dir);
        fs.mkdirSync(dir, { recursive: true });

        const filename = `${job.engineId}_${Date.now()}.mp4`;
        const fullPath = path.join(dir, filename);
        console.log("Downloading video from", job.videoUrl, "to", fullPath);
        await downloadFile(job.videoUrl, fullPath);

        job.localPath = fullPath;
        console.log("Video download complete for job:", jobId);
      }

      return res.json(job);
    }

    if (job.provider === "gemini") {
      if (!GEMINI_API_KEY) {
        console.error("Missing GEMINI_API_KEY when polling Gemini status.");
        return res.status(500).json({ error: "Gemini API key not configured" });
      }

      // Gemini uses operation names for polling
      // Use stored operation name or construct from job ID
      const operationName = job.geminiOperationName || 
        (jobId.startsWith("operations/") ? jobId : `operations/${jobId}`);
      const statusUrl = `${GEMINI_API_BASE}/${operationName}`;

      console.log("Polling Gemini API for operation status:", operationName, "via", statusUrl);
      
      let response;
      try {
        response = await axios.get(statusUrl, {
          headers: {
            "x-goog-api-key": GEMINI_API_KEY,
          },
        });
      } catch (error) {
        console.error("Gemini polling error:", error.response?.data || error.message);
        const message =
          error.response?.data?.error?.message ||
          error.response?.data?.message ||
          error.message ||
          "Gemini polling failed";
        const status = error.response?.status || 502;
        return res.status(status).json({ error: message });
      }

      const data = response.data;
      console.log("Gemini API status response for operation", operationName + ":", data);

      // Map Gemini operation status to our status
      const isDone = data.done === true;
      let status = "queued";
      if (isDone) {
        if (data.error) {
          status = "failed";
          job.error = data.error.message || JSON.stringify(data.error);
        } else {
          status = "succeeded";
        }
      } else {
        status = "running";
      }

      job.status = status;
      job.remoteStatus = isDone ? "completed" : "in_progress";

      // Extract video URL from response when done
      if (isDone && status === "succeeded" && !job.videoUrl) {
        const responseData = data.response;
        if (responseData?.generateVideoResponse?.generatedSamples) {
          const samples = responseData.generateVideoResponse.generatedSamples;
          if (Array.isArray(samples) && samples.length > 0) {
            const video = samples[0].video;
            if (video?.uri) {
              job.videoUrl = video.uri;
            }
          }
        }
      }

      // Download video when succeeded
      if (status === "succeeded" && job.videoUrl && !job.localPath) {
        const dir = path.join(
          DOWNLOAD_DIR,
          job.engineId,
          slugify(job.prompt),
          (job.size || job.aspectRatio || "unknown").replace(/[^a-z0-9]+/gi, "_")
        );
        console.log("Creating download directory:", dir);
        fs.mkdirSync(dir, { recursive: true });

        const filename = `${job.engineId}_${Date.now()}.mp4`;
        const fullPath = path.join(dir, filename);
        console.log("Downloading video from", job.videoUrl, "to", fullPath);
        
        try {
          await downloadFile(job.videoUrl, fullPath);
          job.localPath = fullPath;
          console.log("Video download complete for job:", jobId);
        } catch (downloadError) {
          console.error("Failed to download Gemini video:", downloadError);
          // Continue without local path
        }
      }

      job.gemini = data;
      return res.json(job);
    }

    const statusUrl = `${VIDEO_API_BASE}/${jobId}/status`;
    console.log("Polling Pollo API for job status:", jobId, "via", statusUrl);
    const response = await axios.get(statusUrl, { headers: { "x-api-key": VIDEO_API_KEY } });

    const data = response.data;
    console.log("Pollo API status response for job", jobId + ":", data);
    job.status = data.status;
    job.error = data.error || null;
    job.generations = data.generations || job.generations;

    if ((data.status === "completed" || data.status === "succeeded") && !job.localPath) {
      console.log("Job succeeded, initiating video download for job:", jobId);
      const generation = Array.isArray(data.generations) ? data.generations.find((g) => g.url) : null;
      const videoUrl = generation?.url || data.output_url || data.video_url;
      if (videoUrl) {
        job.videoUrl = videoUrl;
      }
      if (!videoUrl) {
        console.warn("No downloadable video URL found in status response for job:", jobId);
        return res.json(job);
      }

      const dir = path.join(
        DOWNLOAD_DIR,
        job.engineId,
        slugify(job.prompt),
        job.aspectRatio.replace(":", "x")
      );
      console.log("Creating download directory:", dir);
      fs.mkdirSync(dir, { recursive: true });

      const filename = `${job.engineId}_${Date.now()}.mp4`;
      const fullPath = path.join(dir, filename);
      console.log("Downloading video from", videoUrl, "to", fullPath);
      await downloadFile(videoUrl, fullPath);

      job.localPath = fullPath;
      console.log("Video download complete for job:", jobId);
    }

    res.json(job);

  } catch (err) {
    console.error("Error in /api/status:", err.response?.data || err.message);
    res.status(500).json({ error: "Status error" });
  }
});

// List all jobs
app.get("/api/jobs", (req, res) => {
  res.json(Object.values(jobs));
});

// Image to text endpoint
app.post("/api/image-to-text", async (req, res) => {
  try {
    const { image, provider, model } = req.body;

    if (!image || typeof image !== "string") {
      return res.status(400).json({ error: "Image data URL is required" });
    }

    // Extract base64 data from data URL
    const base64Data = image.includes(",") ? image.split(",")[1] : image;
    const imageBuffer = Buffer.from(base64Data, "base64");

    if (provider === "fal-ai" || !provider) {
      const FAL_AI_API_KEY = process.env.FAL_API_KEY || process.env.VITE_FAL_API_KEY;
      if (!FAL_AI_API_KEY) {
        return res.status(500).json({ error: "Fal AI API key not configured" });
      }

      // Use Fal AI vision model (default to llava-1.6-34b or qwen-2-vl-7b-instruct)
      const visionModel = model || "fal-ai/llava-1.6-34b";
      const falApiBase = "https://queue.fal.run";

      // Use the image data URL directly (Fal AI accepts data URLs)
      console.log(`Calling Fal AI vision model: ${visionModel}`);

      // Submit job to Fal AI
      const submitRes = await axios.post(
        `${falApiBase}/${visionModel}/submit`,
        {
          image_url: image,
          prompt: "Describe this image in detail.",
          sync_mode: "async",
        },
        {
          headers: {
            Authorization: `Key ${FAL_AI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      if (submitRes.status !== 200 || !submitRes.data?.request_id) {
        console.error("Fal AI submit error:", submitRes.data);
        return res.status(502).json({ error: "Failed to submit to Fal AI" });
      }

      const requestId = submitRes.data.request_id;
      console.log(`Fal AI job submitted: ${requestId}`);

      // Poll for result
      let attempts = 0;
      const maxAttempts = 30;
      while (attempts < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 2000));

        const statusRes = await axios.get(`${falApiBase}/${visionModel}/${requestId}`, {
          headers: {
            Authorization: `Key ${FAL_AI_API_KEY}`,
            Accept: "application/json",
          },
        });

        const statusData = statusRes.data;

        if (statusData.status === "COMPLETED") {
          const text = statusData.output?.text || statusData.output?.description || JSON.stringify(statusData.output);
          return res.json({ text, provider: "fal-ai", model: visionModel });
        } else if (statusData.status === "FAILED") {
          return res.status(500).json({ error: "Image processing failed" });
        }

        attempts++;
      }

      return res.status(504).json({ error: "Timeout waiting for result" });
    } else if (provider === "openai") {
      const OPENAI_API_KEY = process.env.OPENAI_API_KEY?.trim();
      if (!OPENAI_API_KEY) {
        return res.status(500).json({ error: "OpenAI API key not configured" });
      }

      const openaiBase =
        (process.env.OPENAI_BASE_URL?.trim() || "https://api.openai.com/v1").replace(/\/$/, "");

      // Use OpenAI Vision API
      const visionModel = model || "gpt-4o-mini";

      const response = await axios.post(
        `${openaiBase}/chat/completions`,
        {
          model: visionModel,
          messages: [
            {
              role: "user",
              content: [
                {
                  type: "text",
                  text: "Describe this image in detail.",
                },
                {
                  type: "image_url",
                  image_url: {
                    url: image,
                  },
                },
              ],
            },
          ],
          max_tokens: 500,
        },
        {
          headers: {
            Authorization: `Bearer ${OPENAI_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      const text = response.data?.choices?.[0]?.message?.content;
      if (!text) {
        return res.status(502).json({ error: "No text returned from OpenAI" });
      }

      return res.json({ text, provider: "openai", model: visionModel });
    } else {
      return res.status(400).json({ error: `Unsupported provider: ${provider}` });
    }
  } catch (err) {
    console.error("Error in /api/image-to-text:", err.response?.data || err.message);
    res.status(500).json({ error: err.message || "Image to text error" });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
