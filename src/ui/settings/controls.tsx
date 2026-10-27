import { useState, type CSSProperties, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { getFeatures } from '../../core/features';
import { useSettings, type Settings } from '../../core/settings';
import type { Format, SettingItem } from '../../core/settingsSchema';
import { kmhToUnit, speedLabel, unitToKmh } from '../../core/units';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Overlays';
import { TextInput } from '../components/TextInput';

const WEIGHTS: Record<number, string> = { 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold' };

export function formatSettingValue(
  format: Format | undefined,
  value: number,
  s: Pick<Settings, 'speedUnit'>,
): string {
  switch (format) {
    case 'px':
      return `${value} px`;
    case 'percent':
    case 'percentPoints':
      return `${value}%`;
    case 'seconds':
      return `${value} s`;
    case 'minutes':
    case 'offAtZero':
      return value === 0 ? 'Off' : `${value} min`;
    case 'speed':
      return value === 0 ? 'Off' : `${Math.round(kmhToUnit(value, s.speedUnit))} ${speedLabel(s.speedUnit)}`;
    case 'weight':
      return WEIGHTS[value] ?? String(value);
    default:
      return String(value);
  }
}

export function ToggleControl({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      onClick={() => onChange(!checked)}
    />
  );
}

export function Segmented({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          role="radio"
          aria-checked={value === o.value}
          className="seg__item"
          onClick={() => onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function SelectControl({
  value,
  options,
  onChange,
  label,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  if (options.length <= 4)
    return <Segmented value={value} options={options} onChange={onChange} label={label} />;
  const current = options.find((o) => o.value === value)?.label ?? value;
  return (
    <>
      <button className="btn set-select" onClick={() => setOpen(true)} aria-haspopup="dialog">
        {current}
        <Icon name="chevron-down" size="1.1em" />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="list">
          {options.map((o) => (
            <button
              key={o.value}
              className="row"
              role="radio"
              aria-checked={o.value === value}
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
            >
              <span className="row__text">
                <span className="row__title">{o.label}</span>
              </span>
              {o.value === value && <Icon name="check" />}
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

function SliderControl({
  item,
  value,
  onChange,
  label,
}: {
  item: SettingItem;
  value: number;
  onChange: (v: number) => void;
  label: string;
}) {
  const unit = useSettings((s) => s.speedUnit);
  const isSpeed = item.format === 'speed';
  // Speed sliders move in the unit the user sees; the stored value is always km/h.
  const toView = (v: number) => (isSpeed ? Math.round(kmhToUnit(v, unit)) : v);
  const fromView = (v: number) => (isSpeed ? Math.round(unitToKmh(v, unit) * 10) / 10 : v);
  const min = toView(item.min ?? 0);
  const max = toView(item.max ?? 100);
  const view = toView(value);
  const pct = ((view - min) / (max - min || 1)) * 100;
  return (
    <div className="set-slider">
      <input
        className="slider"
        type="range"
        min={min}
        max={max}
        step={item.step ?? 1}
        value={view}
        aria-label={label}
        aria-valuetext={formatSettingValue(item.format, value, { speedUnit: unit })}
        style={{ '--pct': `${pct}%` } as CSSProperties}
        onChange={(e) => onChange(fromView(Number(e.target.value)))}
      />
      <span className="set-slider__value tabular">
        {formatSettingValue(item.format, value, { speedUnit: unit })}
      </span>
    </div>
  );
}

function SecretControl({
  value,
  onChange,
  label,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
}) {
  const { t } = useTranslation();
  const [shown, setShown] = useState(false);
  return (
    <div className="set-text">
      <TextInput
        type={shown ? 'text' : 'password'}
        value={value}
        autoComplete="off"
        autoCapitalize="off"
        spellCheck={false}
        aria-label={label}
        onChange={(e) => onChange(e.target.value.trim())}
      />
      <button
        className="btn btn--icon btn--ghost"
        onClick={() => setShown((v) => !v)}
        aria-label={shown ? t('settings.hide') : t('settings.show')}
      >
        <Icon name={shown ? 'eye-off' : 'eye'} />
      </button>
    </div>
  );
}

/** One row of the settings menu for a plain (non-custom) item. */
export function SettingRow({ item, layout = 'auto' }: { item: SettingItem; layout?: 'auto' | 'stacked' }) {
  const { t } = useTranslation();
  const settings = useSettings();
  const key = item.key!;
  const value = settings[key];
  const set = <K extends keyof Settings>(v: Settings[K]) => settings.set(key as K, v);
  const label = t(`set.items.${item.id}.label`);
  const hint = item.hint ? t(`set.items.${item.id}.hint`) : null;
  const options = item.options?.map((o) => ({
    value: o.value,
    label: t(`set.items.${item.id}.opt.${o.value}`),
  }));
  const inline = item.type === 'toggle';

  let control: ReactNode;
  switch (item.type) {
    case 'toggle':
      control = <ToggleControl checked={value as boolean} onChange={(v) => set(v as never)} label={label} />;
      break;
    case 'select':
      control = (
        <SelectControl
          value={String(value)}
          options={options!}
          onChange={(v) => set(v as never)}
          label={label}
        />
      );
      break;
    case 'slider':
      control = (
        <SliderControl item={item} value={value as number} onChange={(v) => set(v as never)} label={label} />
      );
      break;
    case 'secret':
      control = <SecretControl value={value as string} onChange={(v) => set(v as never)} label={label} />;
      break;
    case 'time':
      control = (
        <TextInput
          type="time"
          value={value as string}
          aria-label={label}
          onChange={(e) => e.target.value && set(e.target.value as never)}
        />
      );
      break;
    default:
      control = (
        <TextInput
          value={value as string}
          placeholder={item.placeholder}
          aria-label={label}
          autoCapitalize="off"
          autoCorrect="off"
          onChange={(e) => set(e.target.value as never)}
        />
      );
  }
  return (
    <div className="set-row" data-inline={inline && layout === 'auto'} data-item={item.id}>
      <div className="set-row__head">
        <div className="set-row__text">
          <div className="set-row__label">{label}</div>
          {hint && <div className="set-row__hint">{hint}</div>}
        </div>
        {inline && control}
      </div>
      {!inline && <div className="set-row__control">{control}</div>}
    </div>
  );
}

/** Shared frame for custom editors so they look like the other rows. */
export function EditorCard({ itemId, children }: { itemId: string; children: ReactNode }) {
  const { t } = useTranslation();
  const hint = t(`set.items.${itemId}.hint`, { defaultValue: '' });
  return (
    <div className="set-row" data-item={itemId}>
      <div className="set-row__text">
        <div className="set-row__label">{t(`set.items.${itemId}.label`)}</div>
        {hint && <div className="set-row__hint">{hint}</div>}
      </div>
      <div className="set-row__control">{children}</div>
    </div>
  );
}

export const supports = (feature: keyof ReturnType<typeof getFeatures>) => getFeatures()[feature];
