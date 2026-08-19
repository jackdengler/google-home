interface Props { target: number | null; ambient: number | null; scale: "F" | "C"; pending: boolean; disabled: boolean; onAdjust(amount: number): void }

export function ThermostatDial({ target, ambient, scale, pending, disabled, onAdjust }: Props) {
  return <section class="dial-stage" aria-label="Temperature controls">
    <div class={`air-halo ${pending ? "is-pending" : ""}`}>
      <div class="dial-face" aria-label="Target temperature">
        <span class="target-value">{target === null ? "—" : `${target}°`}</span>
        <span class="ambient-value">{ambient === null ? "Indoor temperature unavailable" : `${ambient}° inside`}</span>
      </div>
    </div>
    <div class="stepper">
      <button class="temperature-step" aria-label="Lower target temperature" disabled={disabled} onClick={() => onAdjust(-1)}>−</button>
      <span class="scale-mark" aria-hidden="true">°{scale}</span>
      <button class="temperature-step" aria-label="Raise target temperature" disabled={disabled} onClick={() => onAdjust(1)}>+</button>
    </div>
  </section>;
}
