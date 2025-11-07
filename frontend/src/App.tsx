import { useCallback, useEffect, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import "./App.css";

const API_BASE = "http://localhost:4000/api";
const POLLO_PIPELINE_URL = "http://localhost:5173/";
// Use queue.fal.run for model API calls (submit/poll jobs)
// api.fal.ai is only for Platform APIs (OpenAPI schema, SDK generation)
const FAL_AI_API_BASE =
  import.meta.env.VITE_FAL_AI_API_BASE || "https://queue.fal.run";

type Engine = {
  id: string;
  label: string;
  supportsSeed: boolean;
  minLength: number;
  maxLength: number;
  defaultLength: number;
  provider?: string;
  allowedDurations?: number[] | null;
  requiresPromptImage?: boolean;
  defaultModel?: string | null;
  models?: string[] | null;
  defaultSize?: string | null;
  sizes?: string[] | null;
  allowsReferenceImage?: boolean;
};

type Meta = {
  engines: Engine[];
  aspectRatios: string[];
};

type Job = {
  id: string;
  engineId: string;
  aspectRatio: string;
  status: "queued" | "running" | "succeeded" | "failed" | string;
  prompt: string;
  seed?: number | string | null;
  localPath?: string | null;
  videoUrl?: string | null;
  createdAt: string;
  lengthSeconds?: number | null;
  provider?: string;
  model?: string | null;
  size?: string | null;
  thumbnailUrl?: string | null;
  remoteStatus?: string | null;
  referenceImageName?: string | null;
};

type ProviderId = "runway-gen3" | "pollo" | "fal-ai" | "sora-2" | "gemini-api";
type ProviderStatus = "connected" | "beta" | "coming-soon" | "waitlist";

type Provider = {
  id: ProviderId;
  name: string;
  summary: string;
  tagline: string;
  details: string;
  docs?: { label: string; url: string }[];
  status: ProviderStatus;
};

const STATUS_LABELS: Record<ProviderStatus, string> = {
  connected: "Connected",
  beta: "Beta",
  "coming-soon": "Coming Soon",
  waitlist: "Waitlist",
};

const PROVIDERS: Provider[] = [
  {
    id: "runway-gen3",
    name: "Runway Gen-3",
    summary: "Direct bridge into Runway’s Gen-3 Alpha Turbo video API.",
    tagline: "Relay hits /v1/image_to_video with API version 2024-11-06.",
    details:
      "Add RUNWAY_API_KEY to the backend .env (plus optional RUNWAY_API_VERSION/RUNWAY_MODEL). The relay posts promptText, ratio, duration (5 or 10s), and optional seed, then polls /v1/tasks/{id} until the MP4 is ready and downloads it locally.",
    docs: [
      {
        label: "Create image_to_video",
        url: "https://docs.dev.runwayml.com/reference/image_to_video_create",
      },
      {
        label: "Runway API versioning",
        url: "https://docs.dev.runwayml.com/api/api-versioning",
      },
      {
        label: "Retrieve a task",
        url: "https://docs.dev.runwayml.com/reference/tasks_retrieve",
      },
    ],
    status: "beta",
  },
  {
    id: "pollo",
    name: "Pollo",
    summary: "Local pipeline already connected to your Node backend.",
    tagline: `Relay at ${API_BASE}, pipeline UI at ${POLLO_PIPELINE_URL}.`,
    details:
      "Pollo uses the existing real-vs-ai stack. The v1.6 spec covers prompt, resolution, mode, duration (5-20 seconds), and optional seed fields - use it when adding sliders or validating payloads in the backend.",
    docs: [
      {
        label: "Pollo v1.6 API doc",
        url: "https://docs.pollo.ai/m/pollo/pollo-v1-6",
      },
    ],
    status: "connected",
  },
  {
    id: "fal-ai",
    name: "Fal AI",
    summary: "Serverless inference endpoints with per-second billing.",
    tagline: "Run AI models, without the infra.",
    details:
      "Fal AI exposes REST and WebSocket endpoints for text-to-video generation. Generate videos directly from text prompts using models like Wan-2.1, Vidu Q2, LTX Video 2.0 Pro, or AnimateDiff. This project includes MCP (Model Context Protocol) integration for Cursor, giving you instant access to Fal AI documentation, API references, and code examples directly in your IDE. Connect via MCP settings (Cmd+Shift+P → 'Open MCP settings') and add the Fal server URL: https://docs.fal.ai/mcp",
    docs: [
      { label: "Fal AI docs", url: "https://docs.fal.ai/" },
      {
        label: "Fal AI MCP Integration",
        url: "https://docs.fal.ai/model-apis/mcp",
      },
    ],
    status: "connected",
  },
  {
    id: "sora-2",
    name: "Sora 2 AI",
    summary: "OpenAI's next-generation video generation platform.",
    tagline: "Generate 4s / 8s / 12s clips through OpenAI's /videos API.",
    details:
      "Set OPENAI_API_KEY (plus optional OPENAI_ORG_ID / OPENAI_PROJECT_ID) in the backend .env. This panel posts prompt, model, size, seconds, and optional reference frames straight to OpenAI's /v1/videos endpoint, then polls for progress until the MP4 is downloaded locally.",
    docs: [
      {
        label: "OpenAI video docs",
        url: "https://platform.openai.com/docs/guides/video-generation",
      },
    ],
    status: "connected",
  },
  {
    id: "gemini-api",
    name: "Gemini API",
    summary: "Google's Veo 3.1 and Veo 3 video generation models.",
    tagline:
      "Generate high-fidelity 8-second videos with native audio using Veo models.",
    details:
      "Set GEMINI_API_KEY in the backend .env. This panel supports Veo 3.1 and Veo 3 models for text-to-video and image-to-video generation. Veo 3.1 generates 8-second 720p or 1080p videos with native audio. Supports durations: 4s, 6s, and 8s.",
    docs: [
      {
        label: "Gemini API video docs",
        url: "https://ai.google.dev/gemini-api/docs/video",
      },
    ],
    status: "beta",
  },
];

export default function App() {
  const [activeProvider, setActiveProvider] = useState<ProviderId | null>(null);

  const selectedProvider =
    activeProvider &&
    activeProvider !== "pollo" &&
    activeProvider !== "fal-ai" &&
    activeProvider !== "sora-2" &&
    activeProvider !== "runway-gen3" &&
    activeProvider !== "gemini-api"
      ? PROVIDERS.find((provider) => provider.id === activeProvider) ?? null
      : null;

  return (
    <div className="app">
      {!activeProvider && (
        <ProviderPicker providers={PROVIDERS} onSelect={setActiveProvider} />
      )}

      {activeProvider === "pollo" && (
        <PolloPanel onBack={() => setActiveProvider(null)} />
      )}

      {activeProvider === "fal-ai" && (
        <FalAiPanel onBack={() => setActiveProvider(null)} />
      )}

      {activeProvider === "sora-2" && (
        <SoraPanel onBack={() => setActiveProvider(null)} />
      )}

      {activeProvider === "runway-gen3" && (
        <RunwayPanel onBack={() => setActiveProvider(null)} />
      )}

      {activeProvider === "gemini-api" && (
        <GeminiPanel onBack={() => setActiveProvider(null)} />
      )}

      {selectedProvider && (
        <ProviderDetail
          provider={selectedProvider}
          onBack={() => setActiveProvider(null)}
        />
      )}
    </div>
  );
}

function ProviderPicker({
  providers,
  onSelect,
}: {
  providers: Provider[];
  onSelect: (id: ProviderId) => void;
}) {
  return (
    <>
      <h1>Select a Video Generator</h1>
      <p className="view-subtitle">
        Choose which service to drive. Add API credentials once each provider is
        ready.
      </p>
      <div className="provider-grid">
        {providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            onSelect={onSelect}
          />
        ))}
      </div>
    </>
  );
}

function ProviderCard({
  provider,
  onSelect,
}: {
  provider: Provider;
  onSelect: (id: ProviderId) => void;
}) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect(provider.id);
    }
  };

  return (
    <div
      className="provider-card"
      role="button"
      tabIndex={0}
      onClick={() => onSelect(provider.id)}
      onKeyDown={handleKeyDown}
      aria-label={`Open ${provider.name}`}
      title={provider.name}
    >
      <div className="provider-card-title">
        <h2>{provider.name}</h2>
        <span className={`provider-badge provider-badge-${provider.status}`}>
          {STATUS_LABELS[provider.status]}
        </span>
      </div>
      <p>{provider.summary}</p>
      <div className="provider-card-footer">
        <span className="provider-tagline">{provider.tagline}</span>
        <span className="provider-link">Open</span>
      </div>
    </div>
  );
}

function ProviderDetail({
  provider,
  onBack,
}: {
  provider: Provider;
  onBack: () => void;
}) {
  return (
    <div className="provider-detail">
      <div className="view-header">
        <button className="back-link" onClick={onBack}>
          Back to Providers
        </button>
        <div>
          <h1>{provider.name}</h1>
          <p className="view-subtitle">{provider.tagline}</p>
        </div>
      </div>

      <p>{provider.details}</p>

      <div className="placeholder-form">
        <label htmlFor={`${provider.id}-api-key`}>API Key</label>
        <input
          id={`${provider.id}-api-key`}
          type="password"
          placeholder="Paste your API key"
        />

        <label htmlFor={`${provider.id}-model`}>Model / Endpoint ID</label>
        <input
          id={`${provider.id}-model`}
          type="text"
          placeholder="e.g. runway-gen3a or fal-ai/runway"
        />

        <button type="button" disabled>
          Save Configuration (coming soon)
        </button>
      </div>

      {provider.docs?.length ? (
        <div className="provider-docs">
          <p className="provider-docs-title">Reference docs</p>
          <ul>
            {provider.docs.map((doc) => (
              <li key={doc.url}>
                <a href={doc.url} target="_blank" rel="noreferrer">
                  {doc.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function SoraPanel({ onBack }: { onBack: () => void }) {
  const [engine, setEngine] = useState<Engine | null>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("");
  const [size, setSize] = useState("");
  const [seconds, setSeconds] = useState<number>(8);
  const [referenceDataUrl, setReferenceDataUrl] = useState<string>("");
  const [referenceFileName, setReferenceFileName] = useState<string | null>(
    null
  );
  const [jobs, setJobs] = useState<Job[]>([]);
  const [polling, setPolling] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<keyof Job>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [generatingPromptFromImage, setGeneratingPromptFromImage] =
    useState(false);

  const refreshJobs = useCallback(() => {
    fetch(`${API_BASE}/jobs`)
      .then((r) => r.json())
      .then((list: Job[]) => {
        const filtered = list.filter(
          (job) => job.engineId === "sora-2" || job.provider === "openai"
        );
        setJobs(filtered);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/meta`)
      .then((r) => r.json())
      .then((data: Meta) => {
        const soraEngine =
          data.engines.find((entry) => entry.id === "sora-2") ?? null;
        setEngine(soraEngine ?? null);
        if (soraEngine) {
          const nextModel =
            soraEngine.defaultModel ??
            (soraEngine.models && soraEngine.models.length
              ? soraEngine.models[0]
              : "sora-2");
          const nextSize =
            soraEngine.defaultSize ??
            (soraEngine.sizes && soraEngine.sizes.length
              ? soraEngine.sizes[0]
              : "1280x720");
          const nextSeconds =
            soraEngine.defaultLength ??
            (soraEngine.allowedDurations && soraEngine.allowedDurations.length
              ? soraEngine.allowedDurations[0]
              : 8);
          setModel(nextModel);
          setSize(nextSize);
          setSeconds(nextSeconds);
        }
      })
      .catch(console.error);

    refreshJobs();
  }, [refreshJobs]);

  const allowedDurations =
    engine?.allowedDurations && engine.allowedDurations.length
      ? engine.allowedDurations
      : [4, 8, 12];

  const modelOptions =
    engine?.models && engine.models.length ? engine.models : ["sora-2"];

  const sizeOptions =
    engine?.sizes && engine.sizes.length
      ? engine.sizes
      : ["1280x720", "720x1280", "1792x1024", "1024x1792"];

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert("Enter a prompt");
      return;
    }

    if (!model) {
      alert("Select a model");
      return;
    }

    if (!size) {
      alert("Select a size");
      return;
    }

    const payload: Record<string, unknown> = {
      engineId: "sora-2",
      prompt: prompt.trim(),
      aspectRatio: size,
      lengthSeconds: seconds,
      model,
      size,
    };

    if (referenceDataUrl) {
      payload.promptImage = referenceDataUrl;
      if (referenceFileName) {
        payload.promptImageName = referenceFileName;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.error) {
        alert(
          typeof data.error === "string" ? data.error : "Generation failed"
        );
        return;
      }
      if (data?.jobId) {
        setPrompt("");
        startPolling(data.jobId);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to submit request");
    }
  };

  const startPolling = (jobId: string) => {
    if (polling[jobId]) return;
    setPolling((p) => ({ ...p, [jobId]: true }));

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${jobId}`);
        const job: Job = await res.json();
        if (!job || (job as any).error) return;

        setJobs((prev) => {
          const map: Record<string, Job> = {};
          [...prev, job]
            .filter(
              (entry) =>
                entry.engineId === "sora-2" || entry.provider === "openai"
            )
            .forEach((entry) => {
              map[entry.id] = entry;
            });
          return Object.values(map);
        });

        if (job.status === "queued" || job.status === "running") {
          setTimeout(tick, 3000);
        } else {
          setPolling((p) => {
            const next = { ...p };
            delete next[jobId];
            return next;
          });
          refreshJobs();
        }
      } catch (error) {
        console.error(error);
      }
    };

    tick();
  };

  const handleReferenceFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      setReferenceDataUrl("");
      setReferenceFileName(null);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setReferenceDataUrl(reader.result);
        setReferenceFileName(file.name);
      } else {
        setReferenceDataUrl("");
        setReferenceFileName(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearReference = () => {
    setReferenceDataUrl("");
    setReferenceFileName(null);
  };

  const generatePromptFromImage = async () => {
    if (!referenceDataUrl) {
      alert("Upload a reference image first");
      return;
    }

    setGeneratingPromptFromImage(true);
    try {
      const res = await fetch(`${API_BASE}/image-to-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: referenceDataUrl,
          provider: "openai",
        }),
      });

      const data = await res.json();
      if (data?.error) {
        alert(data.error);
        return;
      }
      if (data?.text) {
        setPrompt(data.text);
      }
    } catch (error) {
      console.error("Error generating prompt from image:", error);
      alert("Failed to generate prompt from image");
    } finally {
      setGeneratingPromptFromImage(false);
    }
  };

  const handleSecondsChange = (value: number) => {
    if (Number.isNaN(value)) return;
    setSeconds(value);
  };

  const showPath = (p?: string | null) => {
    if (!p) return;
    alert(`Saved to:\n${p}`);
  };

  const openVideo = (url?: string | null) => {
    if (!url) return;
    window.open(url, "_blank", "noopener");
  };

  const sortedJobs = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    return [...jobs].sort((a, b) => {
      if (sortBy === "createdAt") {
        return (
          mult *
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        );
      }
      const avRaw = (a as Record<string, unknown>)[sortBy];
      const bvRaw = (b as Record<string, unknown>)[sortBy];
      if (typeof avRaw === "number" && typeof bvRaw === "number") {
        return mult * (avRaw - bvRaw);
      }
      const av = String(avRaw ?? "");
      const bv = String(bvRaw ?? "");
      return mult * av.localeCompare(bv, undefined, { numeric: true });
    });
  }, [jobs, sortBy, sortDir]);

  const setSortField = (field: keyof Job) => {
    if (field === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  return (
    <>
      <div className="view-header">
        <button className="back-link" onClick={onBack}>
          Back to Providers
        </button>
        <div>
          <h1>Sora 2</h1>
          <p className="view-subtitle">
            Drives OpenAI&apos;s /v1/videos endpoint. Allowed durations:{" "}
            {allowedDurations.join(", ")} seconds.
          </p>
        </div>
      </div>

      <section className="form">
        <div className="field">
          <label>Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {modelOptions.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Size</label>
          <select value={size} onChange={(e) => setSize(e.target.value)}>
            {sizeOptions.map((entry) => (
              <option key={entry} value={entry}>
                {entry}
              </option>
            ))}
          </select>
          <p className="length-hint">
            Landscape: 1280x720 or 1792x1024. Portrait: 720x1280 or 1024x1792.
          </p>
        </div>

        <div className="field">
          <label>Duration (seconds)</label>
          <select
            value={seconds}
            onChange={(e) => handleSecondsChange(Number(e.target.value))}
          >
            {allowedDurations.map((duration) => (
              <option key={duration} value={duration}>
                {duration}
              </option>
            ))}
          </select>
        </div>

        <div className="field span-2">
          <label>Prompt</label>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the scene, motion, camera, and mood."
          />
        </div>

        <div className="field">
          <label>Reference Image (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleReferenceFile(e.target.files)}
          />
          {referenceFileName ? (
            <>
              <p className="length-hint">Using {referenceFileName}</p>
              <div
                style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
              >
                <button
                  type="button"
                  className="link-button"
                  onClick={generatePromptFromImage}
                  disabled={generatingPromptFromImage}
                >
                  {generatingPromptFromImage
                    ? "Generating..."
                    : "Generate Prompt from Image"}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={clearReference}
                >
                  Remove image
                </button>
              </div>
            </>
          ) : (
            <p className="length-hint">
              Optional input_reference frame. PNG or JPG recommended.
            </p>
          )}
        </div>

        <button onClick={handleGenerate}>Generate {seconds}s Video</button>
      </section>

      <section className="jobs">
        <div className="jobs-header">
          <h2>Jobs</h2>
          <button onClick={refreshJobs}>Refresh</button>
        </div>

        <table>
          <thead>
            <tr>
              <th onClick={() => setSortField("model")}>Model</th>
              <th onClick={() => setSortField("size")}>Size</th>
              <th onClick={() => setSortField("lengthSeconds")}>Seconds</th>
              <th onClick={() => setSortField("status")}>Status</th>
              <th onClick={() => setSortField("remoteStatus")}>Remote</th>
              <th onClick={() => setSortField("prompt")}>Prompt</th>
              <th onClick={() => setSortField("createdAt")}>Created</th>
              <th>Assets</th>
            </tr>
          </thead>
          <tbody>
            {sortedJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.model ?? "sora-2"}</td>
                <td>{job.size ?? job.aspectRatio ?? "-"}</td>
                <td>{job.lengthSeconds ?? "-"}</td>
                <td>{job.status}</td>
                <td>{job.remoteStatus ?? "-"}</td>
                <td title={job.prompt}>
                  {job.prompt.length > 48
                    ? `${job.prompt.slice(0, 48)}...`
                    : job.prompt}
                </td>
                <td>{new Date(job.createdAt).toLocaleTimeString()}</td>
                <td>
                  <div className="sora-asset-actions">
                    {job.localPath ? (
                      <button onClick={() => showPath(job.localPath)}>
                        Show path
                      </button>
                    ) : (
                      <span>Pending</span>
                    )}
                    {job.videoUrl ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => openVideo(job.videoUrl)}
                      >
                        Open
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!sortedJobs.length && (
              <tr>
                <td colSpan={8}>No Sora jobs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function FalAiPanel({ onBack }: { onBack: () => void }) {
  const [prompt, setPrompt] = useState("");
  const FAL_AI_MODELS = [
    "fal-ai/wan-t2v", // Wan-2.1 Text-to-Video - High quality, 5-6s clips, 720p
    "fal-ai/vidu/q2/text-to-video", // Vidu Q2 - Enhanced quality, up to 1080p
    "fal-ai/ltxv-2/text-to-video", // LTX Video 2.0 Pro - Up to 4K, with audio
    "fal-ai/fast-animatediff/text-to-video", // AnimateDiff - Fast text-to-video
    "fal-ai/wan/v2.2-a14b/image-to-video", // WAN v2.2 A14B - Image to Video
    "fal-ai/runway-gen2/image-to-video", // Runway Gen-2 - Image to Video
    "fal-ai/minimax-video", // MiniMax Video - Generate video clips from images
    "fal-ai/luma-dream-machine", // Luma Dream Machine v1.5 - Generate video clips from images
    "fal-ai/kling-video/v1/standard", // Kling 1.0 - Generate video clips from images
  ];
  const [falModel, setFalModel] = useState(FAL_AI_MODELS[0]);
  const [falApiKey] = useState(import.meta.env.VITE_FAL_API_KEY || ""); // FAL_API_KEY from .env
  const [jobs, setJobs] = useState<Job[]>([]);
  const [polling, setPolling] = useState<Record<string, boolean>>({});
  const [promptImage, setPromptImage] = useState<string>("");
  const [promptImageName, setPromptImageName] = useState<string>("");

  // Log environment variables on mount
  useEffect(() => {
    console.log("=== Fal AI Panel Initialized ===");
    console.log("FAL_AI_API_BASE (final):", FAL_AI_API_BASE);
    console.log(
      "VITE_FAL_AI_API_BASE from env:",
      import.meta.env.VITE_FAL_AI_API_BASE ||
        "NOT SET (using default: https://queue.fal.run)"
    );
    console.log(
      "VITE_FAL_API_KEY from import.meta.env:",
      import.meta.env.VITE_FAL_API_KEY
        ? `${import.meta.env.VITE_FAL_API_KEY.substring(0, 20)}...`
        : "NOT SET"
    );
    console.log(
      "falApiKey state:",
      falApiKey ? `${falApiKey.substring(0, 20)}...` : "NOT SET"
    );
    console.log("All import.meta.env keys:", Object.keys(import.meta.env));
    console.log("Current model:", falModel);
  }, []);

  const isImageToVideoModel =
    falModel.includes("image-to-video") ||
    falModel === "fal-ai/minimax-video" ||
    falModel === "fal-ai/luma-dream-machine" ||
    falModel === "fal-ai/kling-video/v1/standard";

  const handleGenerate = async () => {
    console.log("=== Fal AI Generate Request ===");
    console.log("Prompt:", prompt);
    console.log("Model:", falModel);
    console.log("Is Image-to-Video:", isImageToVideoModel);
    console.log("Has Prompt Image:", !!promptImage);
    console.log("API Key present:", !!falApiKey);
    console.log("API Key length:", falApiKey?.length || 0);
    console.log(
      "API Key preview:",
      falApiKey ? `${falApiKey.substring(0, 20)}...` : "N/A"
    );

    if (!prompt.trim()) {
      alert("Enter a prompt");
      return;
    }

    if (isImageToVideoModel && !promptImage) {
      alert("Upload an image for image-to-video models");
      return;
    }

    if (!falApiKey) {
      console.error("FAL_API_KEY is missing!");
      alert("Fal AI API Key is not set in .env");
      return;
    }

    try {
      const payload: Record<string, unknown> = {
        prompt: prompt,
        sync_mode: "async",
      };

      if (isImageToVideoModel && promptImage) {
        payload.image_url = promptImage;
      }

      const requestUrl = `${FAL_AI_API_BASE}/${falModel}/submit`;
      console.log("Request URL:", requestUrl);
      console.log("Request Payload:", JSON.stringify(payload, null, 2));
      console.log("Request Headers:", {
        "Content-Type": "application/json",
        Authorization: `Key ${falApiKey.substring(0, 20)}...`,
      });

      const res = await fetch(requestUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Key ${falApiKey}`,
        },
        body: JSON.stringify(payload),
      });

      console.log("Response Status:", res.status);
      console.log("Response Status Text:", res.statusText);
      console.log(
        "Response Headers:",
        Object.fromEntries(res.headers.entries())
      );

      const responseText = await res.text();
      console.log("Response Body (raw):", responseText);

      let data;
      try {
        data = JSON.parse(responseText);
        console.log("Response Body (parsed):", JSON.stringify(data, null, 2));
      } catch (parseError) {
        console.error("Failed to parse response as JSON:", parseError);
        console.error("Response was:", responseText);
        alert(
          `Error: Invalid JSON response. Status: ${res.status}. Check console for details.`
        );
        return;
      }

      if (res.status !== 200) {
        console.error("API Error Details:", {
          status: res.status,
          statusText: res.statusText,
          data: data,
        });
        alert(
          `Error: ${
            data.detail || data.message || res.statusText || "Unknown error"
          }`
        );
        return;
      }

      console.log("Success! Request ID:", data.request_id);

      const newJob: Job = {
        id: data.request_id,
        engineId: "fal-ai",
        aspectRatio: "n/a",
        status: "queued",
        prompt: prompt,
        createdAt: new Date().toISOString(),
        lengthSeconds: null,
        videoUrl: null,
      };
      setJobs((prev) => [newJob, ...prev]);
      startPolling(newJob.id);
    } catch (error) {
      console.error("=== Error generating video with Fal AI ===");
      console.error("Error object:", error);
      console.error(
        "Error message:",
        error instanceof Error ? error.message : String(error)
      );
      console.error(
        "Error stack:",
        error instanceof Error ? error.stack : "N/A"
      );
      alert(
        `Failed to generate video with Fal AI: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
  };

  const startPolling = (jobId: string) => {
    if (polling[jobId]) return;
    setPolling((p) => ({ ...p, [jobId]: true }));

    const tick = async () => {
      try {
        const pollUrl = `${FAL_AI_API_BASE}/${falModel}/${jobId}`;
        console.log(`=== Polling Fal AI Job ${jobId} ===`);
        console.log("Poll URL:", pollUrl);
        console.log("Model:", falModel);

        const res = await fetch(pollUrl, {
          method: "POST",
          headers: {
            Accept: "application/json",
            Authorization: `Key ${falApiKey}`,
          },
        });

        console.log("Poll Response Status:", res.status);
        console.log("Poll Response Status Text:", res.statusText);

        const responseText = await res.text();
        console.log("Poll Response Body (raw):", responseText);

        let data;
        try {
          data = JSON.parse(responseText);
          console.log(
            "Poll Response Body (parsed):",
            JSON.stringify(data, null, 2)
          );
        } catch (parseError) {
          console.error("Failed to parse poll response as JSON:", parseError);
          console.error("Poll response was:", responseText);
          setPolling((p) => {
            const next = { ...p };
            delete next[jobId];
            return next;
          });
          return;
        }

        setJobs((prev) => {
          return prev.map((job) => {
            if (job.id === jobId) {
              let status: Job["status"] = "queued";
              let videoUrl: string | null = null;

              if (data.status === "IN_QUEUE") {
                status = "queued";
              } else if (data.status === "RUNNING") {
                status = "running";
              } else if (data.status === "COMPLETED") {
                status = "succeeded";
                // Fal AI text-to-video models return video URL in different structures
                videoUrl =
                  data.output?.video?.url ||
                  data.output?.url ||
                  data.video?.url ||
                  data.url ||
                  null;
              } else if (data.status === "FAILED") {
                status = "failed";
              }

              return { ...job, status, videoUrl };
            }
            return job;
          });
        });

        const finalVideoUrl =
          data.output?.video?.url ||
          data.output?.url ||
          data.video?.url ||
          data.url ||
          null;

        if (data.status === "IN_QUEUE" || data.status === "RUNNING") {
          console.log(
            `Job ${jobId} status: ${data.status}, will poll again in 3s`
          );
          setTimeout(tick, 3000);
        } else {
          console.log(`Job ${jobId} completed with status: ${data.status}`);
          if (data.status === "COMPLETED") {
            console.log("Video URL:", finalVideoUrl);
          }
          setPolling((p) => {
            const next = { ...p };
            delete next[jobId];
            return next;
          });
        }
      } catch (error) {
        console.error(`=== Error polling Fal AI job ${jobId} ===`);
        console.error("Error object:", error);
        console.error(
          "Error message:",
          error instanceof Error ? error.message : String(error)
        );
        console.error(
          "Error stack:",
          error instanceof Error ? error.stack : "N/A"
        );
        setPolling((p) => {
          const next = { ...p };
          delete next[jobId];
          return next;
        });
        setJobs((prev) =>
          prev.map((job) =>
            job.id === jobId ? { ...job, status: "failed" } : job
          )
        );
      }
    };
    tick();
  };

  const sortedJobs = useMemo(() => {
    return [...jobs].sort((a, b) => {
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [jobs]);

  const handlePromptImageFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      setPromptImage("");
      setPromptImageName("");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setPromptImage(reader.result);
        setPromptImageName(file.name);
      } else {
        setPromptImage("");
        setPromptImageName("");
      }
    };
    reader.readAsDataURL(file);
  };

  const clearPromptImage = () => {
    setPromptImage("");
    setPromptImageName("");
  };

  useEffect(() => {
    // Clear image when switching away from image-to-video models
    if (!isImageToVideoModel) {
      setPromptImage("");
      setPromptImageName("");
    }
  }, [isImageToVideoModel]);

  return (
    <>
      <div className="view-header">
        <button className="back-link" onClick={onBack}>
          Back to Providers
        </button>
        <div>
          <h1>Fal AI Pipeline</h1>
          <p className="view-subtitle">Generate videos using Fal AI.</p>
        </div>
      </div>

      <section className="form">
        <div className="field span-2">
          <label>Prompt</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the video you want to generate. Text-to-video models create videos directly from your text prompt."
          />
        </div>

        <div className="field">
          <label>Model / Endpoint ID</label>
          <select
            value={falModel}
            onChange={(e) => setFalModel(e.target.value)}
          >
            {FAL_AI_MODELS.map((model) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </div>

        {isImageToVideoModel && (
          <div className="field span-2">
            <label>Source Image (required)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handlePromptImageFile(e.target.files)}
            />
            {promptImageName ? (
              <>
                <p className="length-hint">Using {promptImageName}</p>
                <button
                  type="button"
                  className="link-button"
                  onClick={clearPromptImage}
                >
                  Remove image
                </button>
              </>
            ) : (
              <p className="length-hint">
                Upload an image for image-to-video generation.
              </p>
            )}
          </div>
        )}

        <button onClick={handleGenerate}>Generate Fal AI Video</button>
      </section>

      <section className="jobs">
        <div className="jobs-header">
          <h2>Jobs</h2>
          <button onClick={() => setJobs([])}>Clear Jobs</button>
        </div>

        <table>
          <thead>
            <tr>
              <th>Engine</th>
              <th>Model</th>
              <th>Status</th>
              <th>Prompt</th>
              <th>Created</th>
              <th>Video</th>
            </tr>
          </thead>
          <tbody>
            {sortedJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.engineId}</td>
                <td>{falModel}</td>
                <td>{job.status}</td>
                <td title={job.prompt}>
                  {job.prompt.length > 48
                    ? `${job.prompt.slice(0, 48)}...`
                    : job.prompt}
                </td>
                <td>{new Date(job.createdAt).toLocaleTimeString()}</td>
                <td>
                  {job.videoUrl ? (
                    <a href={job.videoUrl} target="_blank" rel="noreferrer">
                      View Video
                    </a>
                  ) : (
                    "Pending"
                  )}
                </td>
              </tr>
            ))}
            {!sortedJobs.length && (
              <tr>
                <td colSpan={6}>No jobs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function RunwayPanel({ onBack }: { onBack: () => void }) {
  const [meta, setMeta] = useState<Meta>({ engines: [], aspectRatios: [] });
  const [engineId, setEngineId] = useState("runway-gen3a");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [prompt, setPrompt] = useState("");
  const [promptImage, setPromptImage] = useState<string>("");
  const [promptImageName, setPromptImageName] = useState<string>("");
  const [seed, setSeed] = useState("");
  const [lengthSeconds, setLengthSeconds] = useState<number>(5);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [polling, setPolling] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<keyof Job>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [generatingPromptFromImage, setGeneratingPromptFromImage] =
    useState(false);

  // Filter to only Runway engines
  const runwayEngines = useMemo(() => {
    return meta.engines.filter((engine) => engine.provider === "runway");
  }, [meta.engines]);

  useEffect(() => {
    fetch(`${API_BASE}/meta`)
      .then((r) => r.json())
      .then((data: Meta) => {
        setMeta(data);
        // Find runway-gen3a or first runway engine
        const runwayEngine =
          data.engines.find((e) => e.id === "runway-gen3a") ||
          data.engines.find((e) => e.provider === "runway");
        if (runwayEngine) {
          setEngineId(runwayEngine.id);
          setLengthSeconds(
            runwayEngine.defaultLength ?? runwayEngine.minLength ?? 5
          );
        }
        if (data.aspectRatios?.length) setAspectRatio(data.aspectRatios[0]);
      })
      .catch(console.error);

    refreshJobs();
  }, []);

  useEffect(() => {
    setPromptImage("");
    setPromptImageName("");
  }, [engineId]);

  const refreshJobs = () => {
    fetch(`${API_BASE}/jobs`)
      .then((r) => r.json())
      .then((list: Job[]) => {
        // Filter to only Runway jobs
        const runwayJobs = list.filter(
          (job) => job.engineId === "runway-gen3a" || job.provider === "runway"
        );
        setJobs(runwayJobs);
      })
      .catch(console.error);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert("Enter a prompt");
      return;
    }

    if (!promptImage) {
      alert("Upload a source image for Runway Gen-3.");
      return;
    }

    const payload: Record<string, unknown> = {
      engineId,
      prompt,
      aspectRatio,
      seed: seed || null,
      lengthSeconds,
      promptImage,
    };

    const res = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.error) {
      alert(data.error);
      return;
    }
    if (data?.jobId) startPolling(data.jobId);
  };

  const startPolling = (jobId: string) => {
    if (polling[jobId]) return;
    setPolling((p) => ({ ...p, [jobId]: true }));

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${jobId}`);
        const job: Job = await res.json();
        if (!job || (job as any).error) return;

        setJobs((prev) => {
          const map: Record<string, Job> = {};
          [...prev, job].forEach((entry) => {
            map[entry.id] = entry;
          });
          return Object.values(map);
        });

        if (job.status === "queued" || job.status === "running") {
          setTimeout(tick, 3000);
        } else {
          setPolling((p) => {
            const next = { ...p };
            delete next[jobId];
            return next;
          });
        }
      } catch (error) {
        console.error(error);
      }
    };

    tick();
  };

  const sortedJobs = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    return [...jobs].sort((a, b) => {
      if (sortBy === "createdAt") {
        return (
          mult *
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        );
      }
      const avRaw = (a as Record<string, unknown>)[sortBy];
      const bvRaw = (b as Record<string, unknown>)[sortBy];
      if (typeof avRaw === "number" && typeof bvRaw === "number") {
        return mult * (avRaw - bvRaw);
      }
      const av = String(avRaw ?? "");
      const bv = String(bvRaw ?? "");
      return mult * av.localeCompare(bv, undefined, { numeric: true });
    });
  }, [jobs, sortBy, sortDir]);

  const setSort = (field: keyof Job) => {
    if (field === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const showPath = (p?: string | null) => {
    if (!p) return;
    alert(`Saved to:\n${p}`);
  };

  const currentEngine =
    runwayEngines.find((engine) => engine.id === engineId) ?? null;
  const minLength = currentEngine?.minLength ?? 5;
  const maxLength = currentEngine?.maxLength ?? 10;
  const defaultLength = currentEngine?.defaultLength ?? minLength;
  const allowedDurations = currentEngine?.allowedDurations ?? null;

  const handleEngineChange = (value: string) => {
    setEngineId(value);
    const nextEngine = runwayEngines.find((engine) => engine.id === value);
    if (nextEngine) {
      setLengthSeconds(nextEngine.defaultLength ?? nextEngine.minLength ?? 5);
    }
  };

  const handlePromptImageFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      setPromptImage("");
      setPromptImageName("");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setPromptImage(reader.result);
        setPromptImageName(file.name);
      } else {
        setPromptImage("");
        setPromptImageName("");
      }
    };
    reader.readAsDataURL(file);
  };

  const clearPromptImage = () => {
    setPromptImage("");
    setPromptImageName("");
  };

  const generatePromptFromImage = async () => {
    if (!promptImage) {
      alert("Upload an image first");
      return;
    }

    setGeneratingPromptFromImage(true);
    try {
      const res = await fetch(`${API_BASE}/image-to-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: promptImage,
          provider: "openai", // Use OpenAI for better prompt generation
        }),
      });

      const data = await res.json();
      if (data?.error) {
        alert(data.error);
        return;
      }
      if (data?.text) {
        setPrompt(data.text);
      }
    } catch (error) {
      console.error("Error generating prompt from image:", error);
      alert("Failed to generate prompt from image");
    } finally {
      setGeneratingPromptFromImage(false);
    }
  };

  const handleLengthChange = (value: number) => {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(Math.max(value, minLength), maxLength);
    setLengthSeconds(clamped);
  };

  return (
    <>
      <div className="view-header">
        <button className="back-link" onClick={onBack}>
          Back to Providers
        </button>
        <div>
          <h1>Runway Gen-3</h1>
          <p className="view-subtitle">
            Direct bridge into Runway&apos;s Gen-3 Alpha Turbo video API
          </p>
        </div>
      </div>

      <section className="form">
        {runwayEngines.length > 1 && (
          <div className="field">
            <label>Engine</label>
            <select
              value={engineId}
              onChange={(e) => handleEngineChange(e.target.value)}
            >
              {runwayEngines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.label} ({engine.id})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="field">
          <label>Aspect Ratio</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            {meta.aspectRatios.length ? (
              meta.aspectRatios.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))
            ) : (
              <option value="">No aspect ratios</option>
            )}
          </select>
        </div>

        <div className="field span-2">
          <label>Prompt</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the exact scene (same angle, lighting, action)."
          />
        </div>

        <div className="field span-2">
          <label>Source Image (required)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handlePromptImageFile(e.target.files)}
          />
          {promptImageName ? (
            <>
              <p className="length-hint">Using {promptImageName}</p>
              <div
                style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
              >
                <button
                  type="button"
                  className="link-button"
                  onClick={generatePromptFromImage}
                  disabled={generatingPromptFromImage}
                >
                  {generatingPromptFromImage
                    ? "Generating..."
                    : "Generate Prompt from Image"}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={clearPromptImage}
                >
                  Remove image
                </button>
              </div>
            </>
          ) : (
            <p className="length-hint">
              Upload a PNG or JPG. The file is converted to a data URL for
              Runway&apos;s promptImage field.
            </p>
          )}
        </div>

        <div className="field">
          <label>Seed (optional)</label>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="12345"
          />
        </div>

        <div className="field">
          <label>Length (seconds)</label>
          <div className="length-input-row">
            <input
              type="range"
              min={minLength}
              max={maxLength}
              value={lengthSeconds}
              onChange={(e) => handleLengthChange(Number(e.target.value))}
            />
            <input
              type="number"
              min={minLength}
              max={maxLength}
              value={lengthSeconds}
              onChange={(e) => handleLengthChange(Number(e.target.value))}
            />
          </div>
          <p className="length-hint">
            Allowed range: {minLength}-{maxLength}s; default {defaultLength}s
            {allowedDurations && allowedDurations.length
              ? `; valid durations: ${allowedDurations.join(", ")}s`
              : ""}
          </p>
        </div>

        <button onClick={handleGenerate}>
          Generate {lengthSeconds}s Video
        </button>
      </section>

      <section className="jobs">
        <div className="jobs-header">
          <h2>Jobs</h2>
          <button onClick={refreshJobs}>Refresh</button>
        </div>

        <table>
          <thead>
            <tr>
              <th onClick={() => setSort("engineId")}>Engine</th>
              <th onClick={() => setSort("aspectRatio")}>Aspect</th>
              <th onClick={() => setSort("lengthSeconds")}>Length (s)</th>
              <th onClick={() => setSort("status")}>Status</th>
              <th onClick={() => setSort("prompt")}>Prompt</th>
              <th onClick={() => setSort("createdAt")}>Created</th>
              <th>Seed</th>
              <th>Local File</th>
            </tr>
          </thead>
          <tbody>
            {sortedJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.engineId}</td>
                <td>{job.aspectRatio}</td>
                <td>{job.lengthSeconds ?? "-"}</td>
                <td>{job.status}</td>
                <td title={job.prompt}>
                  {job.prompt.length > 48
                    ? `${job.prompt.slice(0, 48)}...`
                    : job.prompt}
                </td>
                <td>{new Date(job.createdAt).toLocaleTimeString()}</td>
                <td>{job.seed ?? "-"}</td>
                <td>
                  {job.localPath ? (
                    <button onClick={() => showPath(job.localPath)}>
                      Show path
                    </button>
                  ) : (
                    "Pending"
                  )}
                </td>
              </tr>
            ))}
            {!sortedJobs.length && (
              <tr>
                <td colSpan={8}>No jobs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function GeminiPanel({ onBack }: { onBack: () => void }) {
  const [meta, setMeta] = useState<Meta>({ engines: [], aspectRatios: [] });
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("veo-3.1-generate-preview");
  const [duration, setDuration] = useState<number>(8);
  const [resolution, setResolution] = useState("720p");
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [referenceImage, setReferenceImage] = useState<string>("");
  const [referenceFileName, setReferenceFileName] = useState<string | null>(
    null
  );
  const [jobs, setJobs] = useState<Job[]>([]);
  const [polling, setPolling] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<keyof Job>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [generatingPromptFromImage, setGeneratingPromptFromImage] =
    useState(false);

  const GEMINI_MODELS = [
    { value: "veo-3.1-generate-preview", label: "Veo 3.1 Preview" },
    { value: "veo-3.1-fast-generate-preview", label: "Veo 3.1 Fast Preview" },
    { value: "veo-3.0-generate-001", label: "Veo 3.0" },
    { value: "veo-3.0-fast-generate-001", label: "Veo 3.0 Fast" },
    { value: "veo-2.0-generate-001", label: "Veo 2.0" },
  ];

  const isVeo31 = model.startsWith("veo-3.1");
  const isVeo3 = model.startsWith("veo-3.0");
  const allowedDurations = isVeo31 ? [4, 6, 8] : isVeo3 ? [8] : [5, 6, 7, 8];
  const allowedResolutions = isVeo31
    ? ["720p", "1080p"]
    : isVeo3
    ? ["720p", "1080p"]
    : ["720p"];

  const refreshJobs = useCallback(() => {
    fetch(`${API_BASE}/jobs`)
      .then((r) => r.json())
      .then((list: Job[]) => {
        const filtered = list.filter(
          (job) => job.engineId === "gemini-api" || job.provider === "gemini"
        );
        setJobs(filtered);
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/meta`)
      .then((r) => r.json())
      .then((data: Meta) => {
        setMeta(data);
        if (data.aspectRatios?.length) {
          setAspectRatio(data.aspectRatios[0]);
        }
      })
      .catch(console.error);

    refreshJobs();
  }, [refreshJobs]);

  useEffect(() => {
    // Reset duration when model changes
    if (isVeo31) {
      setDuration(8);
    } else if (isVeo3) {
      setDuration(8);
    } else {
      setDuration(8);
    }
  }, [model, isVeo31, isVeo3]);

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert("Enter a prompt");
      return;
    }

    const payload: Record<string, unknown> = {
      engineId: "gemini-api",
      prompt: prompt.trim(),
      model,
      duration,
      resolution,
      aspectRatio,
    };

    if (referenceImage) {
      payload.promptImage = referenceImage;
      if (referenceFileName) {
        payload.promptImageName = referenceFileName;
      }
    }

    try {
      const res = await fetch(`${API_BASE}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data?.error) {
        alert(
          typeof data.error === "string" ? data.error : "Generation failed"
        );
        return;
      }
      if (data?.jobId) {
        setPrompt("");
        startPolling(data.jobId);
      }
    } catch (error) {
      console.error(error);
      alert("Failed to submit request");
    }
  };

  const startPolling = (jobId: string) => {
    if (polling[jobId]) return;
    setPolling((p) => ({ ...p, [jobId]: true }));

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${jobId}`);
        const job: Job = await res.json();
        if (!job || (job as any).error) return;

        setJobs((prev) => {
          const map: Record<string, Job> = {};
          [...prev, job]
            .filter(
              (entry) =>
                entry.engineId === "gemini-api" || entry.provider === "gemini"
            )
            .forEach((entry) => {
              map[entry.id] = entry;
            });
          return Object.values(map);
        });

        if (job.status === "queued" || job.status === "running") {
          setTimeout(tick, 10000); // Poll every 10 seconds for Gemini
        } else {
          setPolling((p) => {
            const next = { ...p };
            delete next[jobId];
            return next;
          });
          refreshJobs();
        }
      } catch (error) {
        console.error(error);
      }
    };

    tick();
  };

  const handleReferenceFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      setReferenceImage("");
      setReferenceFileName(null);
      return;
    }

    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setReferenceImage(reader.result);
        setReferenceFileName(file.name);
      } else {
        setReferenceImage("");
        setReferenceFileName(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearReference = () => {
    setReferenceImage("");
    setReferenceFileName(null);
  };

  const generatePromptFromImage = async () => {
    if (!referenceImage) {
      alert("Upload a reference image first");
      return;
    }

    setGeneratingPromptFromImage(true);
    try {
      const res = await fetch(`${API_BASE}/image-to-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: referenceImage,
          provider: "openai",
        }),
      });

      const data = await res.json();
      if (data?.error) {
        alert(data.error);
        return;
      }
      if (data?.text) {
        setPrompt(data.text);
      }
    } catch (error) {
      console.error("Error generating prompt from image:", error);
      alert("Failed to generate prompt from image");
    } finally {
      setGeneratingPromptFromImage(false);
    }
  };

  const handleDurationChange = (value: number) => {
    if (Number.isNaN(value)) return;
    if (allowedDurations.includes(value)) {
      setDuration(value);
    }
  };

  const showPath = (p?: string | null) => {
    if (!p) return;
    alert(`Saved to:\n${p}`);
  };

  const openVideo = (url?: string | null) => {
    if (!url) return;
    window.open(url, "_blank", "noopener");
  };

  const sortedJobs = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    return [...jobs].sort((a, b) => {
      if (sortBy === "createdAt") {
        return (
          mult *
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        );
      }
      const avRaw = (a as Record<string, unknown>)[sortBy];
      const bvRaw = (b as Record<string, unknown>)[sortBy];
      if (typeof avRaw === "number" && typeof bvRaw === "number") {
        return mult * (avRaw - bvRaw);
      }
      const av = String(avRaw ?? "");
      const bv = String(bvRaw ?? "");
      return mult * av.localeCompare(bv, undefined, { numeric: true });
    });
  }, [jobs, sortBy, sortDir]);

  const setSortField = (field: keyof Job) => {
    if (field === sortBy) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  return (
    <>
      <div className="view-header">
        <button className="back-link" onClick={onBack}>
          Back to Providers
        </button>
        <div>
          <h1>Gemini API - Veo</h1>
          <p className="view-subtitle">
            Generate videos with Veo 3.1 and Veo 3 models. Allowed durations:{" "}
            {allowedDurations.join(", ")} seconds.
          </p>
        </div>
      </div>

      <section className="form">
        <div className="field">
          <label>Model</label>
          <select value={model} onChange={(e) => setModel(e.target.value)}>
            {GEMINI_MODELS.map((entry) => (
              <option key={entry.value} value={entry.value}>
                {entry.label}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Aspect Ratio</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            {meta.aspectRatios.length ? (
              meta.aspectRatios.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))
            ) : (
              <>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
                <option value="1:1">1:1</option>
              </>
            )}
          </select>
        </div>

        <div className="field">
          <label>Resolution</label>
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value)}
          >
            {allowedResolutions.map((res) => (
              <option key={res} value={res}>
                {res}
              </option>
            ))}
          </select>
          <p className="length-hint">
            Veo 3.1 supports 720p and 1080p. Veo 3 supports 720p and 1080p (16:9
            only).
          </p>
        </div>

        <div className="field">
          <label>Duration (seconds)</label>
          <select
            value={duration}
            onChange={(e) => handleDurationChange(Number(e.target.value))}
          >
            {allowedDurations.map((dur) => (
              <option key={dur} value={dur}>
                {dur}
              </option>
            ))}
          </select>
        </div>

        <div className="field span-2">
          <label>Prompt</label>
          <textarea
            rows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the scene, motion, camera, and mood. Veo supports dialogue and sound effects in prompts."
          />
        </div>

        <div className="field">
          <label>Reference Image (optional)</label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => handleReferenceFile(e.target.files)}
          />
          {referenceFileName ? (
            <>
              <p className="length-hint">Using {referenceFileName}</p>
              <div
                style={{ display: "flex", gap: "0.5rem", marginTop: "0.5rem" }}
              >
                <button
                  type="button"
                  className="link-button"
                  onClick={generatePromptFromImage}
                  disabled={generatingPromptFromImage}
                >
                  {generatingPromptFromImage
                    ? "Generating..."
                    : "Generate Prompt from Image"}
                </button>
                <button
                  type="button"
                  className="link-button"
                  onClick={clearReference}
                >
                  Remove image
                </button>
              </div>
            </>
          ) : (
            <p className="length-hint">
              Optional reference image for image-to-video generation. PNG or JPG
              recommended.
            </p>
          )}
        </div>

        <button onClick={handleGenerate}>Generate {duration}s Video</button>
      </section>

      <section className="jobs">
        <div className="jobs-header">
          <h2>Jobs</h2>
          <button onClick={refreshJobs}>Refresh</button>
        </div>

        <table>
          <thead>
            <tr>
              <th onClick={() => setSortField("model")}>Model</th>
              <th onClick={() => setSortField("aspectRatio")}>Aspect</th>
              <th onClick={() => setSortField("size")}>Resolution</th>
              <th onClick={() => setSortField("lengthSeconds")}>Seconds</th>
              <th onClick={() => setSortField("status")}>Status</th>
              <th onClick={() => setSortField("remoteStatus")}>Remote</th>
              <th onClick={() => setSortField("prompt")}>Prompt</th>
              <th onClick={() => setSortField("createdAt")}>Created</th>
              <th>Assets</th>
            </tr>
          </thead>
          <tbody>
            {sortedJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.model ?? model}</td>
                <td>{job.aspectRatio ?? aspectRatio ?? "-"}</td>
                <td>{job.size ?? resolution ?? "-"}</td>
                <td>{job.lengthSeconds ?? duration ?? "-"}</td>
                <td>{job.status}</td>
                <td>{job.remoteStatus ?? "-"}</td>
                <td title={job.prompt}>
                  {job.prompt.length > 48
                    ? `${job.prompt.slice(0, 48)}...`
                    : job.prompt}
                </td>
                <td>{new Date(job.createdAt).toLocaleTimeString()}</td>
                <td>
                  <div className="sora-asset-actions">
                    {job.localPath ? (
                      <button onClick={() => showPath(job.localPath)}>
                        Show path
                      </button>
                    ) : (
                      <span>Pending</span>
                    )}
                    {job.videoUrl ? (
                      <button
                        type="button"
                        className="link-button"
                        onClick={() => openVideo(job.videoUrl)}
                      >
                        Open
                      </button>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
            {!sortedJobs.length && (
              <tr>
                <td colSpan={9}>No Gemini jobs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}

function PolloPanel({ onBack }: { onBack: () => void }) {
  const [meta, setMeta] = useState<Meta>({ engines: [], aspectRatios: [] });
  const [engineId, setEngineId] = useState("");
  const [aspectRatio, setAspectRatio] = useState("");
  const [prompt, setPrompt] = useState("");
  const [promptImage, setPromptImage] = useState<string>("");
  const [promptImageName, setPromptImageName] = useState<string>("");
  const [seed, setSeed] = useState("");
  const [lengthSeconds, setLengthSeconds] = useState<number>(5);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [polling, setPolling] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<keyof Job>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [generatingPromptFromImage, setGeneratingPromptFromImage] =
    useState(false);

  useEffect(() => {
    fetch(`${API_BASE}/meta`)
      .then((r) => r.json())
      .then((data: Meta) => {
        setMeta(data);
        if (data.engines?.length) {
          const first = data.engines[0];
          setEngineId(first.id);
          setLengthSeconds(first.defaultLength ?? first.minLength ?? 5);
        }
        if (data.aspectRatios?.length) setAspectRatio(data.aspectRatios[0]);
      })
      .catch(console.error);

    refreshJobs();
  }, []);

  useEffect(() => {
    setPromptImage("");
    setPromptImageName("");
  }, [engineId]);

  const refreshJobs = () => {
    fetch(`${API_BASE}/jobs`)
      .then((r) => r.json())
      .then((list: Job[]) => setJobs(list))
      .catch(console.error);
  };

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      alert("Enter a prompt");
      return;
    }

    if (requiresPromptImage && !promptImage) {
      alert("Upload a source image for Runway Gen-3.");
      return;
    }

    const payload: Record<string, unknown> = {
      engineId,
      prompt,
      aspectRatio,
      seed: seed || null,
      lengthSeconds,
    };

    if (promptImage) {
      payload.promptImage = promptImage;
    }

    const res = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data?.error) {
      alert(data.error);
      return;
    }
    if (data?.jobId) startPolling(data.jobId);
  };

  const startPolling = (jobId: string) => {
    if (polling[jobId]) return;
    setPolling((p) => ({ ...p, [jobId]: true }));

    const tick = async () => {
      try {
        const res = await fetch(`${API_BASE}/status/${jobId}`);
        const job: Job = await res.json();
        if (!job || (job as any).error) return;

        setJobs((prev) => {
          const map: Record<string, Job> = {};
          [...prev, job].forEach((entry) => {
            map[entry.id] = entry;
          });
          return Object.values(map);
        });

        if (job.status === "queued" || job.status === "running") {
          setTimeout(tick, 3000);
        } else {
          setPolling((p) => {
            const next = { ...p };
            delete next[jobId];
            return next;
          });
        }
      } catch (error) {
        console.error(error);
      }
    };

    tick();
  };

  const sortedJobs = useMemo(() => {
    const mult = sortDir === "asc" ? 1 : -1;
    return [...jobs].sort((a, b) => {
      if (sortBy === "createdAt") {
        return (
          mult *
          (new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        );
      }
      const avRaw = (a as Record<string, unknown>)[sortBy];
      const bvRaw = (b as Record<string, unknown>)[sortBy];
      if (typeof avRaw === "number" && typeof bvRaw === "number") {
        return mult * (avRaw - bvRaw);
      }
      const av = String(avRaw ?? "");
      const bv = String(bvRaw ?? "");
      return mult * av.localeCompare(bv, undefined, { numeric: true });
    });
  }, [jobs, sortBy, sortDir]);

  const setSort = (field: keyof Job) => {
    if (field === sortBy) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortBy(field);
      setSortDir("asc");
    }
  };

  const showPath = (p?: string | null) => {
    if (!p) return;
    alert(`Saved to:\n${p}`);
  };

  const currentEngine =
    meta.engines.find((engine) => engine.id === engineId) ?? null;
  const minLength = currentEngine?.minLength ?? 5;
  const maxLength = currentEngine?.maxLength ?? 20;
  const defaultLength = currentEngine?.defaultLength ?? minLength;
  const requiresPromptImage = currentEngine?.requiresPromptImage ?? false;
  const allowedDurations = currentEngine?.allowedDurations ?? null;

  const handleEngineChange = (value: string) => {
    setEngineId(value);
    const nextEngine = meta.engines.find((engine) => engine.id === value);
    if (nextEngine) {
      setLengthSeconds(nextEngine.defaultLength ?? nextEngine.minLength ?? 5);
    }
  };

  const handlePromptImageFile = (files: FileList | null) => {
    const file = files?.[0];
    if (!file) {
      setPromptImage("");
      setPromptImageName("");
      return;
    }
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === "string") {
        setPromptImage(reader.result);
        setPromptImageName(file.name);
      } else {
        setPromptImage("");
        setPromptImageName("");
      }
    };
    reader.readAsDataURL(file);
  };

  const clearPromptImage = () => {
    setPromptImage("");
    setPromptImageName("");
  };

  const generatePromptFromImage = async () => {
    if (!promptImage) {
      alert("Upload an image first");
      return;
    }

    setGeneratingPromptFromImage(true);
    try {
      const res = await fetch(`${API_BASE}/image-to-text`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: promptImage,
          provider: "openai",
        }),
      });

      const data = await res.json();
      if (data?.error) {
        alert(data.error);
        return;
      }
      if (data?.text) {
        setPrompt(data.text);
      }
    } catch (error) {
      console.error("Error generating prompt from image:", error);
      alert("Failed to generate prompt from image");
    } finally {
      setGeneratingPromptFromImage(false);
    }
  };

  const handleLengthChange = (value: number) => {
    if (Number.isNaN(value)) return;
    const clamped = Math.min(Math.max(value, minLength), maxLength);
    setLengthSeconds(clamped);
  };

  return (
    <>
      <div className="view-header">
        <button className="back-link" onClick={onBack}>
          Back to Providers
        </button>
        <div>
          <h1>Pollo Pipeline</h1>
          <p className="view-subtitle">
            Relay API {API_BASE.replace("/api", "")} | Pipeline UI{" "}
            {POLLO_PIPELINE_URL}
          </p>
        </div>
      </div>

      <section className="form">
        <div className="field">
          <label>Engine</label>
          <select
            value={engineId}
            onChange={(e) => handleEngineChange(e.target.value)}
          >
            {meta.engines.length ? (
              meta.engines.map((engine) => (
                <option key={engine.id} value={engine.id}>
                  {engine.label} ({engine.id})
                </option>
              ))
            ) : (
              <option value="">No engines available</option>
            )}
          </select>
        </div>

        <div className="field">
          <label>Aspect Ratio</label>
          <select
            value={aspectRatio}
            onChange={(e) => setAspectRatio(e.target.value)}
          >
            {meta.aspectRatios.length ? (
              meta.aspectRatios.map((ratio) => (
                <option key={ratio} value={ratio}>
                  {ratio}
                </option>
              ))
            ) : (
              <option value="">No aspect ratios</option>
            )}
          </select>
        </div>

        <div className="field span-2">
          <label>Prompt</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the exact scene (same angle, lighting, action)."
          />
        </div>

        {requiresPromptImage ? (
          <div className="field span-2">
            <label>Source Image (required)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handlePromptImageFile(e.target.files)}
            />
            {promptImageName ? (
              <>
                <p className="length-hint">Using {promptImageName}</p>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginTop: "0.5rem",
                  }}
                >
                  <button
                    type="button"
                    className="link-button"
                    onClick={generatePromptFromImage}
                    disabled={generatingPromptFromImage}
                  >
                    {generatingPromptFromImage
                      ? "Generating..."
                      : "Generate Prompt from Image"}
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={clearPromptImage}
                  >
                    Remove image
                  </button>
                </div>
              </>
            ) : (
              <p className="length-hint">
                Upload a PNG or JPG. The file is converted to a data URL for
                Runway&apos;s promptImage field.
              </p>
            )}
          </div>
        ) : (
          <div className="field span-2">
            <label>Image to Text (optional)</label>
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handlePromptImageFile(e.target.files)}
            />
            {promptImageName ? (
              <>
                <p className="length-hint">Using {promptImageName}</p>
                <div
                  style={{
                    display: "flex",
                    gap: "0.5rem",
                    marginTop: "0.5rem",
                  }}
                >
                  <button
                    type="button"
                    className="link-button"
                    onClick={generatePromptFromImage}
                    disabled={generatingPromptFromImage}
                  >
                    {generatingPromptFromImage
                      ? "Generating..."
                      : "Generate Prompt from Image"}
                  </button>
                  <button
                    type="button"
                    className="link-button"
                    onClick={clearPromptImage}
                  >
                    Remove image
                  </button>
                </div>
              </>
            ) : (
              <p className="length-hint">
                Upload an image to generate a prompt description automatically.
              </p>
            )}
          </div>
        )}

        <div className="field">
          <label>Seed (optional)</label>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="12345"
          />
        </div>

        <div className="field">
          <label>Length (seconds)</label>
          <div className="length-input-row">
            <input
              type="range"
              min={minLength}
              max={maxLength}
              value={lengthSeconds}
              onChange={(e) => handleLengthChange(Number(e.target.value))}
            />
            <input
              type="number"
              min={minLength}
              max={maxLength}
              value={lengthSeconds}
              onChange={(e) => handleLengthChange(Number(e.target.value))}
            />
          </div>
          <p className="length-hint">
            Allowed range: {minLength}-{maxLength}s; default {defaultLength}s
            {allowedDurations && allowedDurations.length
              ? `; valid durations: ${allowedDurations.join(", ")}s`
              : ""}
          </p>
        </div>

        <button onClick={handleGenerate}>
          Generate {lengthSeconds}s Video
        </button>
      </section>

      <section className="jobs">
        <div className="jobs-header">
          <h2>Jobs</h2>
          <button onClick={refreshJobs}>Refresh</button>
        </div>

        <table>
          <thead>
            <tr>
              <th onClick={() => setSort("engineId")}>Engine</th>
              <th onClick={() => setSort("aspectRatio")}>Aspect</th>
              <th onClick={() => setSort("lengthSeconds")}>Length (s)</th>
              <th onClick={() => setSort("status")}>Status</th>
              <th onClick={() => setSort("prompt")}>Prompt</th>
              <th onClick={() => setSort("createdAt")}>Created</th>
              <th>Seed</th>
              <th>Local File</th>
            </tr>
          </thead>
          <tbody>
            {sortedJobs.map((job) => (
              <tr key={job.id}>
                <td>{job.engineId}</td>
                <td>{job.aspectRatio}</td>
                <td>{job.lengthSeconds ?? "-"}</td>
                <td>{job.status}</td>
                <td title={job.prompt}>
                  {job.prompt.length > 48
                    ? `${job.prompt.slice(0, 48)}...`
                    : job.prompt}
                </td>
                <td>{new Date(job.createdAt).toLocaleTimeString()}</td>
                <td>{job.seed ?? "-"}</td>
                <td>
                  {job.localPath ? (
                    <button onClick={() => showPath(job.localPath)}>
                      Show path
                    </button>
                  ) : (
                    "Pending"
                  )}
                </td>
              </tr>
            ))}
            {!sortedJobs.length && (
              <tr>
                <td colSpan={7}>No jobs yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </>
  );
}
