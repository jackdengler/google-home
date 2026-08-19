import { useEffect, useMemo, useState } from "preact/hooks";
import { ModeSelector } from "./components/ModeSelector.js";
import { StatusPanel } from "./components/StatusPanel.js";
import { ThermostatDial } from "./components/ThermostatDial.js";
import { createThermostatController, type ControllerSnapshot, type ThermostatCommands, type ThermostatState } from "./thermostat.js";

interface AppApi extends ThermostatCommands { unlock(code: string): Promise<void>; getState(): Promise<ThermostatState> }
export function App({ api, initiallyUnlocked }: { api: AppApi; initiallyUnlocked: boolean }) {
  const [unlocked, setUnlocked] = useState(initiallyUnlocked);
  const [code, setCode] = useState("");
  const [state, setState] = useState<ThermostatState | null>(null);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [loading, setLoading] = useState(initiallyUnlocked);
  const controller = useMemo(() => state ? createThermostatController(api, state) : null, [api, state?.observedAt]);
  const [snapshot, setSnapshot] = useState<ControllerSnapshot | null>(null);

  useEffect(() => { if (unlocked) { setLoading(true); api.getState().then(setState).catch((error) => setUnlockError(error instanceof Error ? error.message : "Nest is unavailable.")).finally(() => setLoading(false)); } }, [unlocked]);
  useEffect(() => { if (!controller) return; setSnapshot(controller.snapshot()); return controller.subscribe(setSnapshot); }, [controller]);

  if (!unlocked) return <main class="unlock-shell"><section class="unlock-card"><p class="eyebrow">NEST / PRIVATE CONTROL</p><h1>Your home,<br />one turn away.</h1><p>Enter the shared code once. This phone will stay connected for 30 days.</p><form onSubmit={(event) => { event.preventDefault(); setUnlockError(null); api.unlock(code).then(() => setUnlocked(true)).catch((error) => setUnlockError(error instanceof Error ? error.message : "The code was not accepted.")); }}><label>Shared access code<input aria-label="Shared access code" type="password" minLength={8} value={code} onInput={(event) => setCode(event.currentTarget.value)} autoComplete="current-password" /></label><button type="submit">Unlock thermostat</button></form>{unlockError && <p role="alert" class="error-banner">{unlockError}</p>}</section></main>;
  if (loading || !snapshot || !controller) return <main class="loading-shell"><div class="loading-ring" /><p>Reading the room…</p></main>;

  const theme = snapshot.confirmed.hvacStatus === "HEATING" ? "heat" : snapshot.confirmed.hvacStatus === "COOLING" ? "cool" : "idle";
  return <main class={`thermostat-shell theme-${theme}`}>
    <header><div><p class="eyebrow">{snapshot.confirmed.room ?? "HOME"}</p><h1>{snapshot.confirmed.name}</h1></div><span class="connection-label">{snapshot.confirmed.online ? "LIVE" : "OFFLINE"}</span></header>
    <StatusPanel value={snapshot} />
    <ThermostatDial target={snapshot.draftTarget} ambient={snapshot.confirmed.ambientTemperature} scale={snapshot.confirmed.scale} pending={snapshot.pending} disabled={!snapshot.confirmed.online} onAdjust={(amount) => controller.adjust(amount)} />
    <ModeSelector mode={snapshot.confirmed.mode} available={snapshot.confirmed.availableModes} disabled={snapshot.pending || !snapshot.confirmed.online} onSelect={(mode) => void controller.setMode(mode)} />
    <footer>Last confirmed {new Date(snapshot.confirmed.observedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</footer>
  </main>;
}
