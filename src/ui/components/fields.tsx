
export const COLOR_PRESETS: Array<{ name: string; value: string }> = [
  { name: 'Negro', value: '#000000' },
  { name: 'Rojo', value: '#C0392B' },
  { name: 'Azul', value: '#1F6FB2' },
  { name: 'Verde', value: '#2E7D32' },
  { name: 'Naranja', value: '#D4780A' },
  { name: 'Violeta', value: '#7B3FA0' },
  { name: 'Gris', value: '#7F8C8D' },
];

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span className="field__label">
        {label}
        {hint && <span className="field__hint"> {hint}</span>}
      </span>
      {children}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  placeholder,
  multiline,
  rows,
  mono,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  multiline?: boolean;
  /** Alto inicial del textarea, en líneas. Solo aplica con `multiline`. */
  rows?: number;
  mono?: boolean;
}) {
  const className = 'input' + (mono ? ' input--mono' : '');
  if (multiline) {
    return (
      <textarea
        className={className}
        value={value}
        placeholder={placeholder}
        rows={rows ?? 2}
        onChange={(e) => onChange(e.target.value)}
      />
    );
  }
  return <input className={className} type="text" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />;
}

export function ColorInput({
  value,
  defaultValue,
  onChange,
}: {
  value: string | undefined;
  defaultValue: string;
  onChange: (value: string | undefined) => void;
}) {
  const effective = value ?? defaultValue;
  return (
    <div className="color-input">
      <div className="color-input__swatches">
        {COLOR_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            className={'swatch' + (effective.toLowerCase() === preset.value.toLowerCase() ? ' is-active' : '')}
            style={{ background: preset.value }}
            title={preset.name}
            onClick={() => onChange(preset.value)}
          />
        ))}
        <input
          type="color"
          className="swatch swatch--custom"
          value={toHex6(effective)}
          title="Color personalizado"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
      <div className="color-input__footer">
        <code>{effective}</code>
        <button type="button" className="button button--small" disabled={value === undefined} onClick={() => onChange(undefined)}>
          Predeterminado
        </button>
      </div>
    </div>
  );
}

function toHex6(color: string): string {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(color.trim());
  if (!match) return '#000000';
  const hex = match[1] ?? '000';
  if (hex.length === 6) return '#' + hex.toLowerCase();
  return '#' + hex.split('').map((c) => c + c).join('').toLowerCase();
}

export function CurvatureInput({
  value,
  effective,
  isSelfLoop,
  onChange,
}: {
  value: number | undefined;
  effective: number;
  isSelfLoop: boolean;
  onChange: (value: number | undefined) => void;
}) {
  const step = 0.05;
  const clamp = (n: number) => Math.max(-1, Math.min(1, Math.round(n * 100) / 100));
  return (
    <div className="curvature-input">
      <div className="curvature-input__row">
        <button type="button" className="button button--small" onClick={() => onChange(clamp(effective - 0.1))} title="Menos">
          −
        </button>
        <input
          type="range"
          min={-1}
          max={1}
          step={step}
          value={effective}
          onChange={(e) => onChange(clamp(Number(e.target.value)))}
        />
        <button type="button" className="button button--small" onClick={() => onChange(clamp(effective + 0.1))} title="Más">
          +
        </button>
        <code className="curvature-input__value">{effective.toFixed(2)}</code>
      </div>
      <div className="curvature-input__footer">
        <span className="muted">
          {value === undefined ? 'Automática' : 'Manual'}
          {isSelfLoop ? ' · posición del bucle' : ' · 0 = recta'}
        </span>
        <span className="curvature-input__buttons">
          <button type="button" className="button button--small" onClick={() => onChange(0)} disabled={value === 0}>
            Recta
          </button>
          <button type="button" className="button button--small" onClick={() => onChange(undefined)} disabled={value === undefined}>
            Auto
          </button>
        </span>
      </div>
    </div>
  );
}
