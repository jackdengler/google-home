interface Props {
  active: boolean;
  timeout: string | null;
  minutes: number;
  busy: boolean;
  onMinutes(value: number): void;
  onStart(): void;
  onStop(): void;
}

export function FanControl({ active, timeout, minutes, busy, onMinutes, onStart, onStop }: Props) {
  const ending = active && timeout ? new Date(timeout).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : null;
  return <section class="fan-control" aria-label="Fan timer">
    <div><p class="eyebrow">FAN</p><strong>{active ? `Running${ending ? ` until ${ending}` : ""}` : "Off"}</strong></div>
    <div class="fan-actions">
      <button type="button" aria-label="Reduce fan time" disabled={busy || minutes <= 15} onClick={() => onMinutes(minutes - 15)}>−</button>
      <span>{minutes} min</span>
      <button type="button" aria-label="Increase fan time" disabled={busy || minutes >= 720} onClick={() => onMinutes(minutes + 15)}>+</button>
      {active
        ? <button type="button" class="fan-primary" disabled={busy} onClick={onStop}>Stop</button>
        : <button type="button" class="fan-primary" disabled={busy} onClick={onStart}>Start</button>}
    </div>
  </section>;
}
