import { useEffect, useMemo, useState } from "react";
import "./App.css";

const API_BASE = "http://localhost:4000/api";

type Engine = {
  id: string;
  label: string;
  supportsSeed: boolean;
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
};

export default function App() {
  const [meta, setMeta] = useState<Meta>({ engines: [], aspectRatios: [] });
  const [engineId, setEngineId] = useState("");
  const [aspectRatio, setAspectRatio] = useState("");
  const [prompt, setPrompt] = useState("");
  const [seed, setSeed] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [polling, setPolling] = useState<Record<string, boolean>>({});
  const [sortBy, setSortBy] = useState<keyof Job>("createdAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    fetch(`${API_BASE}/meta`)
      .then((r) => r.json())
      .then((data: Meta) => {
        setMeta(data);
        if (data.engines?.length) setEngineId(data.engines[0].id);
        if (data.aspectRatios?.length) setAspectRatio(data.aspectRatios[0]);
      })
      .catch(console.error);

    refreshJobs();
  }, []);

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

    const res = await fetch(`${API_BASE}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        engineId,
        prompt,
        aspectRatio,
        seed: seed || null,
      }),
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
          [...prev, job].forEach((j) => (map[j.id] = j));
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
      } catch (e) {
        console.error(e);
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
      const av = String((a as any)[sortBy] ?? "");
      const bv = String((b as any)[sortBy] ?? "");
      return mult * av.localeCompare(bv);
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

  return (
    <div className="app">
      <h1>real-vs-ai — Video Control Panel</h1>

      <section className="form">
        <div className="field">
          <label>Engine</label>
          <select
            value={engineId}
            onChange={(e) => setEngineId(e.target.value)}
          >
            {meta.engines.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label} ({e.id})
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
            {meta.aspectRatios.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        </div>

        <div className="field span-2">
          <label>Prompt</label>
          <textarea
            rows={3}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the exact scene (same angle, lighting, action)…"
          />
        </div>

        <div className="field">
          <label>Seed (optional)</label>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="12345"
          />
        </div>

        <button onClick={handleGenerate}>Generate 5s Video</button>
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
              <th onClick={() => setSort("status")}>Status</th>
              <th onClick={() => setSort("prompt")}>Prompt</th>
              <th onClick={() => setSort("createdAt")}>Created</th>
              <th>Seed</th>
              <th>Local File</th>
            </tr>
          </thead>
          <tbody>
            {sortedJobs.map((j) => (
              <tr key={j.id}>
                <td>{j.engineId}</td>
                <td>{j.aspectRatio}</td>
                <td>{j.status}</td>
                <td title={j.prompt}>
                  {j.prompt.length > 48
                    ? j.prompt.slice(0, 48) + "…"
                    : j.prompt}
                </td>
                <td>{new Date(j.createdAt).toLocaleTimeString()}</td>
                <td>{j.seed ?? "-"}</td>
                <td>
                  {j.localPath ? (
                    <button onClick={() => showPath(j.localPath)}>
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
    </div>
  );
}
