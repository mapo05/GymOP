"use client";

import { FormEvent, MouseEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Result } from "@/lib/analytics";

type UploadSummary = {
  weekStartDate: string;
  rowsSaved: number;
};

type Activity = { at: string; message: string };
type DashboardData = {
  results: Result[];
  limits: Record<string, number>;
  placements: Record<string, { x: number; y: number }>;
  hasFloorPlan: boolean;
  events: Activity[];
  weekStarts: string[];
};

const EMPTY_DASHBOARD: DashboardData = {
  results: [],
  limits: {},
  placements: {},
  hasFloorPlan: false,
  events: [],
  weekStarts: [],
};

const TIME_NAMES = ["Early morning", "Morning", "Mid-day", "Evening", "Late-night"];

function machineKey(name: string) {
  return name.trim().toLowerCase();
}

function numberText(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}

export default function Home() {
  const [gymName, setGymName] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [floorPlanFile, setFloorPlanFile] = useState<File | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [duplicate, setDuplicate] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploads, setUploads] = useState<UploadSummary[]>([]);
  const [dashboard, setDashboard] = useState<DashboardData>(EMPTY_DASHBOARD);
  const [weekCount, setWeekCount] = useState(1);
  const [weekendView, setWeekendView] = useState<"same" | "separate">("same");
  const [selectedDay, setSelectedDay] = useState<"weekday" | "weekend">("weekday");
  const [selectedTime, setSelectedTime] = useState("Early morning");
  const [selectedMachine, setSelectedMachine] = useState("");
  const [limitValues, setLimitValues] = useState<Record<string, string>>({});
  const [tab, setTab] = useState<"results" | "upload">("results");
  const [loadingResults, setLoadingResults] = useState(false);
  const [floorMessage, setFloorMessage] = useState("");
  const [floorError, setFloorError] = useState("");
  const [limitMessage, setLimitMessage] = useState("");
  const [limitError, setLimitError] = useState("");
  const mapRef = useRef<HTMLDivElement>(null);
  const requestSequence = useRef(0);

  const currentResults = useMemo(
    () =>
      dashboard.results.filter(
        (result) => result.timeOfDay === selectedTime,
      ),
    [dashboard.results, selectedTime],
  );
  const mapResults = useMemo(
    () =>
      weekendView === "same"
        ? currentResults
        : currentResults.filter((result) => result.dayCategory === selectedDay),
    [currentResults, selectedDay, weekendView],
  );
  const machineNames = useMemo(
    () => [...new Set(dashboard.results.map((result) => result.equipmentName))].sort(),
    [dashboard.results],
  );
  const backedUp = currentResults.filter((result) => result.status === "Backed up");
  const isStale = dashboard.results.some((result) => result.isStale);

  async function loadDashboard(name: string, count = weekCount, mode = weekendView) {
    const requestId = ++requestSequence.current;
    if (!name.trim()) {
      setDashboard(EMPTY_DASHBOARD);
      setUploads([]);
      setLoadingResults(false);
      return;
    }

    setLoadingResults(true);
    try {
      const query = new URLSearchParams({
        gymName: name.trim(),
        weekCount: String(count),
        weekendView: mode,
      });
      const [resultResponse, uploadResponse] = await Promise.all([
        fetch(`/api/story1/results?${query}`),
        fetch(`/api/story1/uploads?gymName=${encodeURIComponent(name.trim())}`),
      ]);
      const resultBody = await resultResponse.json();
      if (!resultResponse.ok) throw new Error(resultBody.error ?? "Results could not be loaded.");
      if (requestId !== requestSequence.current) return;
      setDashboard(resultBody as DashboardData);
      if (uploadResponse.ok) setUploads(await uploadResponse.json());
    } catch (loadError) {
      if (requestId !== requestSequence.current) return;
      setDashboard(EMPTY_DASHBOARD);
      setUploads([]);
      setError(loadError instanceof Error ? loadError.message : "Results could not be loaded.");
    } finally {
      if (requestId === requestSequence.current) setLoadingResults(false);
    }
  }

  useEffect(() => {
    const timeout = window.setTimeout(
      () => loadDashboard(gymName),
      250,
    );
    return () => window.clearTimeout(timeout);
  }, [gymName, weekCount, weekendView]);

  useEffect(() => {
    setLimitValues((values) => {
      const next = { ...values };
      for (const name of machineNames) {
        const key = machineKey(name);
        next[key] ??= String(dashboard.limits[key] ?? 12);
      }
      return next;
    });
  }, [dashboard.limits, machineNames]);

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    await uploadData(false);
  }

  async function uploadData(replaceExisting: boolean) {
    setMessage("");
    setError("");
    setDuplicate(false);
    if (!gymName.trim()) {
      setError("Enter your gym name.");
      return;
    }
    if (!file) {
      setError("Choose an .xlsx or .csv file.");
      return;
    }

    setBusy(true);
    const form = new FormData();
    form.set("gymName", gymName);
    form.set("file", file);
    if (replaceExisting) form.set("replace", "true");

    try {
      const response = await fetch("/api/story1/upload", { method: "POST", body: form });
      const data = await response.json();
      if (response.status === 409) {
        setDuplicate(true);
        setError(data.error);
      } else if (!response.ok) {
        setError(data.error);
      } else {
        setMessage(data.message);
        await loadDashboard(gymName);
      }
    } catch {
      setError("The upload could not be completed. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLimit(name: string) {
    setLimitMessage("");
    setLimitError("");
    const limit = Number(limitValues[machineKey(name)]);
    if (!Number.isFinite(limit) || limit <= 0) {
      setLimitError(`Enter a number above 0 for ${name}.`);
      return;
    }
    try {
      const response = await fetch("/api/story1/limit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gymName, equipmentName: name, limit }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setLimitMessage(data.message);
      await loadDashboard(gymName);
    } catch (saveError) {
      setLimitError(saveError instanceof Error ? saveError.message : "The limit could not be saved.");
    }
  }

  async function uploadFloorPlan(event: FormEvent) {
    event.preventDefault();
    setFloorMessage("");
    setFloorError("");
    if (!gymName.trim() || !floorPlanFile) {
      setFloorError("Enter your gym name and choose a PNG or JPG floor plan.");
      return;
    }
    setBusy(true);
    const form = new FormData();
    form.set("gymName", gymName);
    form.set("file", floorPlanFile);
    try {
      const response = await fetch("/api/story1/floor-plan", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setFloorMessage(data.message);
      await loadDashboard(gymName);
    } catch (uploadError) {
      setFloorError(uploadError instanceof Error ? uploadError.message : "The floor plan could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  async function placeSelectedMachine(event: MouseEvent<HTMLDivElement>) {
    if (!selectedMachine || !mapRef.current) return;
    const bounds = mapRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width));
    const y = Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height));
    try {
      const response = await fetch("/api/story1/placement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gymName, equipmentName: selectedMachine, x, y }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      setFloorMessage(data.message);
      setSelectedMachine("");
      await loadDashboard(gymName);
    } catch (placeError) {
      setFloorError(placeError instanceof Error ? placeError.message : "The machine position could not be saved.");
    }
  }

  const staleDate = dashboard.weekStarts[0];
  const showStaleWarning =
    isStale &&
    staleDate &&
    Date.now() - new Date(`${staleDate}T00:00:00Z`).getTime() > 14 * 86400000;

  return (
    <main>
      <header className="topbar">
        <div>
          <p className="eyebrow">Gym equipment congestion grader</p>
          <h1>Understand what gets backed up</h1>
        </div>
        <div className="gym-picker">
          <label htmlFor="gymName">Gym name</label>
          <input
            id="gymName"
            value={gymName}
            onChange={(event) => {
              requestSequence.current += 1;
              setLoadingResults(false);
              setGymName(event.target.value);
              setDashboard(EMPTY_DASHBOARD);
              setUploads([]);
              setMessage("");
              setError("");
            }}
            placeholder="Gym A"
            autoComplete="organization"
          />
        </div>
      </header>

      <div className="privacy-notice" role="note">
        A gym name is only a label, not a password. Anyone who knows it can view or change that gym&apos;s data.
      </div>

      <nav className="tabs" aria-label="Main sections">
        <button className={tab === "results" ? "active" : ""} onClick={() => setTab("results")}>
          Results and recommendations
        </button>
        <button className={tab === "upload" ? "active" : ""} onClick={() => setTab("upload")}>
          Upload weekly data
        </button>
      </nav>

      {error && <div className="error" role="alert">{error}</div>}
      {showStaleWarning && (
        <div className="warning" role="status">
          Your newest data is more than two weeks old. Upload a recent week so these results stay useful.
        </div>
      )}

      {tab === "upload" ? (
        <div className="grid-two">
          <section className="card">
            <p className="eyebrow">Story 1</p>
            <h2>Upload weekly data</h2>
            <p>Use a spreadsheet with daily rows for Monday through Sunday.</p>
            <form onSubmit={submitUpload} className="stack">
              <label htmlFor="weeklyFile">Weekly spreadsheet (.xlsx or .csv)</label>
              <input
                id="weeklyFile"
                type="file"
                accept=".xlsx,.csv"
                onChange={(event) => {
                  setFile(event.target.files?.[0] ?? null);
                  setDuplicate(false);
                  setMessage("");
                  setError("");
                }}
              />
              {duplicate ? (
                <div className="decision" role="alert">
                  <p><strong>That week already exists.</strong></p>
                  <div className="button-row">
                    <button type="button" onClick={() => uploadData(true)} disabled={busy}>
                      Replace this week&apos;s data
                    </button>
                    <button type="button" className="secondary" onClick={() => { setDuplicate(false); setError(""); }}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button type="submit" disabled={busy}>
                  {busy ? "Checking file..." : "Upload spreadsheet"}
                </button>
              )}
            </form>
            {message && <div className="success" role="status">{message}</div>}
            {error && <div className="error" role="alert">{error}</div>}
            {uploads.length > 0 && (
              <div className="saved">
                <h3>Saved weeks</h3>
                <ul>
                  {uploads.map((upload) => (
                    <li key={upload.weekStartDate}>
                      Week starting {upload.weekStartDate}: {upload.rowsSaved} rows
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          <section className="card">
            <p className="eyebrow">Story 4</p>
            <h2>Floor plan</h2>
            <p>Upload a PNG or JPG image up to 10 MB, then place machines on it.</p>
            <form onSubmit={uploadFloorPlan} className="stack">
              <label htmlFor="floorFile">Choose a floor plan</label>
              <input
                id="floorFile"
                type="file"
                accept=".png,.jpg,.jpeg,image/png,image/jpeg"
                onChange={(event) => setFloorPlanFile(event.target.files?.[0] ?? null)}
              />
              <button type="submit" disabled={busy}>{busy ? "Saving..." : "Upload floor plan"}</button>
            </form>
            {floorMessage && <div className="success" role="status">{floorMessage}</div>}
            {floorError && <div className="error" role="alert">{floorError}</div>}
          </section>
        </div>
      ) : (
        <>
          <section className="controls card">
            <div className="control">
              <label htmlFor="weekendView">Weekday and weekend view</label>
              <select
                id="weekendView"
                value={weekendView}
                onChange={(event) => setWeekendView(event.target.value as "same" | "separate")}
              >
                <option value="same">Combined (4 weekdays : 3 weekend days)</option>
                <option value="separate">Show weekdays and weekends separately</option>
              </select>
            </div>
            {weekendView === "separate" && (
              <div className="control">
                <label htmlFor="selectedDay">Show on floor plan</label>
                <select
                  id="selectedDay"
                  value={selectedDay}
                  onChange={(event) => setSelectedDay(event.target.value as "weekday" | "weekend")}
                >
                  <option value="weekday">Weekdays (Monday–Thursday)</option>
                  <option value="weekend">Weekends (Friday–Sunday)</option>
                </select>
              </div>
            )}
            <div className="control">
              <label htmlFor="weekCount">Weeks to include</label>
              <select
                id="weekCount"
                value={weekCount}
                onChange={(event) => setWeekCount(Number(event.target.value))}
              >
                <option value={1}>Most recent week</option>
                <option value={4}>Most recent 4 weeks</option>
                <option value={12}>Most recent 12 weeks</option>
              </select>
            </div>
            <div className="control">
              <label htmlFor="timeOfDay">Time of day</label>
              <select
                id="timeOfDay"
                value={selectedTime}
                onChange={(event) => setSelectedTime(event.target.value)}
              >
                {TIME_NAMES.map((time) => <option key={time}>{time}</option>)}
              </select>
            </div>
          </section>

          {loadingResults && <p className="muted">Loading your gym&apos;s results...</p>}
          {!loadingResults && dashboard.results.length === 0 ? (
            <section className="empty card">
              <h2>No weekly data yet</h2>
              <p>Upload a valid weekly spreadsheet to see machine scores and recommendations.</p>
              <button onClick={() => setTab("upload")}>Go to upload</button>
            </section>
          ) : (
            <>
              <section className="recommendations">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Recommendations</p>
                    <h2>{backedUp.length ? "Machines needing more capacity" : "No machines are backed up"}</h2>
                  </div>
                  <span className="badge">{selectedTime}</span>
                </div>
                {backedUp.length ? (
                  <div className="recommendation-grid">
                    {backedUp.map((result) => (
                      <article className="recommendation-card" key={`${result.equipmentName}-${result.dayCategory}`}>
                        <div className="status-line"><span className="status-dot backed" /> Backed up</div>
                        <h3>{result.recommendation}</h3>
                        {result.dayCategory !== "same" && (
                          <p className="muted">{result.dayCategory === "weekday" ? "Weekdays" : "Weekends"}</p>
                        )}
                        <p>
                          Add <strong>{result.extraMachines}</strong> machine{result.extraMachines === 1 ? "" : "s"}.
                        </p>
                        <p className="supporting">
                          {numberText(result.peoplePerHour)} people/hour · {numberText(result.minutesPerPerson)} minutes/person ·
                          {" "}{result.points.toFixed(2)} points · limit {numberText(result.limit)} · {numberText(result.numberOwned)} owned
                        </p>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="plain-message">No machines are backed up for this time of day and view.</p>
                )}
              </section>

              <section className="card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Scores</p>
                    <h2>Machine results</h2>
                  </div>
                </div>
                {currentResults.length ? (
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Rank</th><th>Machine</th><th>Day group</th><th>People/hour</th>
                          <th>Minutes/person</th><th>Points</th><th>Limit</th><th>Owned</th><th>Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentResults.map((result) => (
                          <tr key={`${result.equipmentName}-${result.dayCategory}`}>
                            <td>{result.rank}</td>
                            <td>{result.equipmentName}</td>
                            <td>{result.dayCategory === "same" ? "Combined" : result.dayCategory}</td>
                            <td>{numberText(result.peoplePerHour)}</td>
                            <td>{numberText(result.minutesPerPerson)}</td>
                            <td>{result.points.toFixed(2)}</td>
                            <td>{numberText(result.limit)}</td>
                            <td>{numberText(result.numberOwned)}</td>
                            <td>
                              <span className={`status-label ${result.status === "Backed up" ? "is-backed" : "is-clear"}`}>
                                {result.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="plain-message">There is no data for this time of day and day group yet.</p>
                )}
              </section>

              <section className="grid-two">
                <section className="card">
                  <p className="eyebrow">Machine limits</p>
                  <h2>Change a limit</h2>
                  <p>Points above the limit mean the machine is backed up. Every new machine starts at 12.</p>
                  {machineNames.length ? (
                    <div className="limit-list">
                      {machineNames.map((name) => {
                        const key = machineKey(name);
                        return (
                          <div className="limit-row" key={key}>
                            <label htmlFor={`limit-${key}`}>{name}</label>
                            <input
                              id={`limit-${key}`}
                              type="number"
                              min="0.01"
                              step="any"
                              value={limitValues[key] ?? String(dashboard.limits[key] ?? 12)}
                              onChange={(event) => setLimitValues((values) => ({ ...values, [key]: event.target.value }))}
                            />
                            <button onClick={() => saveLimit(name)}>Save</button>
                          </div>
                        );
                      })}
                    </div>
                  ) : <p>No machines found.</p>}
                  {limitMessage && <div className="success" role="status">{limitMessage}</div>}
                  {limitError && <div className="error" role="alert">{limitError}</div>}
                </section>

                <section className="card">
                  <p className="eyebrow">Activity</p>
                  <h2>Recent changes</h2>
                  {dashboard.events.length ? (
                    <ul className="activity-list">
                      {dashboard.events.map((event, index) => (
                        <li key={`${event.at}-${index}`}>
                          <time dateTime={event.at}>{new Date(event.at).toLocaleString()}</time>
                          <span>{event.message}</span>
                        </li>
                      ))}
                    </ul>
                  ) : <p>No uploads or changes have been recorded yet.</p>}
                </section>
              </section>

              <section className="card">
                <div className="section-heading">
                  <div>
                    <p className="eyebrow">Floor plan</p>
                    <h2>Machine locations</h2>
                  </div>
                  <button className="secondary" onClick={() => setTab("upload")}>Upload or replace floor plan</button>
                </div>
                {!dashboard.hasFloorPlan ? (
                  <div className="empty-inline">
                    <p>There is no floor plan yet. Upload one to place machines on your gym map.</p>
                    <button onClick={() => setTab("upload")}>Upload floor plan</button>
                  </div>
                ) : (
                  <>
                    <p>Select a machine, then click where it belongs on the floor plan. Status is shown with text and color.</p>
                    {machineNames.length > 0 && (
                      <div className="placement-controls">
                        <label htmlFor="machineToPlace">Machine to place</label>
                        <select
                          id="machineToPlace"
                          value={selectedMachine}
                          onChange={(event) => setSelectedMachine(event.target.value)}
                        >
                          <option value="">Choose a machine</option>
                          {machineNames.map((name) => <option key={name}>{name}</option>)}
                        </select>
                        {selectedMachine && <span>Now click its location on the floor plan.</span>}
                      </div>
                    )}
                    <div className="map-layout">
                      <div
                        className={`floor-plan ${selectedMachine ? "can-place" : ""}`}
                        ref={mapRef}
                        onClick={placeSelectedMachine}
                        role={selectedMachine ? "button" : undefined}
                        tabIndex={selectedMachine ? 0 : undefined}
                      >
                        {/* The image is served through the app so the storage address stays private. */}
                        <img src={`/api/story1/floor-plan?gymName=${encodeURIComponent(gymName)}`} alt="Gym floor plan" />
                        {mapResults.map((result) => {
                          const position = dashboard.placements[machineKey(result.equipmentName)];
                          if (!position) return null;
                          return (
                            <span
                              key={`${result.equipmentName}-${result.dayCategory}`}
                              className={`map-marker ${result.status === "Backed up" ? "marker-backed" : "marker-clear"}`}
                              style={{ left: `${position.x * 100}%`, top: `${position.y * 100}%` }}
                              aria-label={`${result.equipmentName}: ${result.status}`}
                              onClick={(event) => event.stopPropagation()}
                            >
                              {result.status === "Backed up" ? "Backed up" : "Not backed up"}: {result.equipmentName}
                            </span>
                          );
                        })}
                      </div>
                      <div className="machine-status">
                        <h3>{selectedTime} status</h3>
                        {machineNames.map((name) => {
                          const result = mapResults.find(
                            (item) => machineKey(item.equipmentName) === machineKey(name),
                          );
                          return (
                            <div className="machine-status-row" key={`${name}-status`}>
                              <span className={`status-dot ${result ? (result.status === "Backed up" ? "backed" : "clear") : "unknown"}`} />
                              <span>{name}</span>
                              <strong>{result?.status ?? "No data for this time"}</strong>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </>
                )}
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
