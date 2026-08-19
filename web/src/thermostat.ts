export type ThermostatMode = "OFF" | "HEAT" | "COOL" | "HEATCOOL";
export type TemperatureScale = "F" | "C";

export interface ThermostatState {
  observedAt: string;
  name: string;
  room: string | null;
  online: boolean;
  ambientTemperature: number | null;
  heatSetpoint: number | null;
  coolSetpoint: number | null;
  humidity: number | null;
  mode: ThermostatMode;
  hvacStatus: "OFF" | "HEATING" | "COOLING" | "UNKNOWN";
  ecoMode: string | null;
  availableModes: ThermostatMode[];
  scale: TemperatureScale;
}

export interface ThermostatCommands {
  setSetpoint(request: { mode: "HEAT" | "COOL"; target: number } | { mode: "HEATCOOL"; heat: number; cool: number }): Promise<ThermostatState>;
  setMode(mode: ThermostatMode): Promise<ThermostatState>;
}

export interface ControllerSnapshot {
  confirmed: ThermostatState;
  draftTarget: number | null;
  pending: boolean;
  error: string | null;
}

export function targetFor(state: ThermostatState): number | null {
  if (state.mode === "COOL") return state.coolSetpoint;
  if (state.mode === "HEAT") return state.heatSetpoint;
  return state.heatSetpoint;
}

export function createThermostatController(commands: ThermostatCommands, initial: ThermostatState, delayMs = 650) {
  let snapshot: ControllerSnapshot = { confirmed: initial, draftTarget: targetFor(initial), pending: false, error: null };
  let timer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<(value: ControllerSnapshot) => void>();
  const publish = () => listeners.forEach((listener) => listener(snapshot));

  const sendDraft = async () => {
    const target = snapshot.draftTarget;
    const mode = snapshot.confirmed.mode;
    if (target === null || (mode !== "HEAT" && mode !== "COOL")) return;
    snapshot = { ...snapshot, pending: true, error: null }; publish();
    try {
      const confirmed = await commands.setSetpoint({ mode, target });
      snapshot = { confirmed, draftTarget: targetFor(confirmed), pending: false, error: null };
    } catch (error) {
      snapshot = { ...snapshot, draftTarget: targetFor(snapshot.confirmed), pending: false, error: error instanceof Error ? error.message : "The change did not reach Nest." };
    }
    publish();
  };

  return {
    snapshot: () => snapshot,
    subscribe(listener: (value: ControllerSnapshot) => void) { listeners.add(listener); return () => listeners.delete(listener); },
    adjust(amount: number) {
      if (!snapshot.confirmed.online || snapshot.pending || snapshot.draftTarget === null) return;
      snapshot = { ...snapshot, draftTarget: snapshot.draftTarget + amount, error: null }; publish();
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void sendDraft(); }, delayMs);
    },
    async setMode(mode: ThermostatMode) {
      snapshot = { ...snapshot, pending: true, error: null }; publish();
      try {
        const confirmed = await commands.setMode(mode);
        snapshot = { confirmed, draftTarget: targetFor(confirmed), pending: false, error: null };
      } catch (error) {
        snapshot = { ...snapshot, pending: false, error: error instanceof Error ? error.message : "The mode did not change." };
      }
      publish();
    },
  };
}
