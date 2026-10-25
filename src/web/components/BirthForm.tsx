import { useState } from 'react';
import { ApiError } from '../lib/api';
import { PlaceSearch, type Place } from './PlaceSearch';
import { Button, Checkbox, Field, Input, Select } from './ui/primitives';
import { Notice } from './ui/feedback';

export type Precision = 'exact' | 'within_15m' | 'within_1h' | 'unknown';

export interface BirthValues {
  fullName?: string;
  date: string;
  time: string | null;
  timePrecision: Precision;
  place: { kind: 'geonames'; id: string } | { kind: 'manual'; name: string; latitude: number; longitude: number; timezone?: string };
  consentBirthData: true;
  /** The selected place as shown to the user (client-side only; not sent to the API). */
  placeObject?: Place;
}

/**
 * Birth-data form shared by onboarding and settings. Supports unknown or approximate
 * time explicitly, and manual coordinates when a place is not in the index.
 */
export function BirthForm({ initial, onSubmit, submitLabel = 'Calculate my chart', showName = true, consentLabel, consentDescription }: {
  initial?: Partial<{ fullName: string; date: string; time: string | null; timePrecision: Precision; placeLabel: string; place: Place; manual: { name: string; latitude: number; longitude: number } }>;
  consentLabel?: string;
  consentDescription?: string;
  onSubmit: (v: BirthValues) => Promise<unknown>;
  submitLabel?: string;
  showName?: boolean;
}) {
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [date, setDate] = useState(initial?.date ?? '');
  const [time, setTime] = useState(initial?.time ?? '');
  const [precision, setPrecision] = useState<Precision>(initial?.timePrecision ?? 'exact');
  const [place, setPlace] = useState<Place | null>(initial?.place ?? null);
  const [manual, setManual] = useState(Boolean(initial?.manual));
  const [manualVals, setManualVals] = useState(initial?.manual ? { name: initial.manual.name, latitude: String(initial.manual.latitude), longitude: String(initial.manual.longitude) } : { name: '', latitude: '', longitude: '' });
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const unknownTime = precision === 'unknown';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const errs: Record<string, string> = {};
    if (!date) errs.date = 'Enter your date of birth.';
    if (!unknownTime && !time) errs.time = 'Enter a time, or choose “I don’t know my birth time”.';
    if (!manual && !place) errs.place = 'Choose your birthplace from the list.';
    if (manual && (!manualVals.name || isNaN(Number(manualVals.latitude)) || isNaN(Number(manualVals.longitude)) || manualVals.latitude === '' || manualVals.longitude === '')) errs.place = 'Enter a place name with latitude and longitude.';
    if (!consent) errs.consent = 'Consent is needed to calculate your chart.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await onSubmit({
        fullName: showName ? fullName : undefined,
        date, time: unknownTime ? null : time, timePrecision: precision,
        place: manual ? { kind: 'manual', name: manualVals.name, latitude: Number(manualVals.latitude), longitude: Number(manualVals.longitude) } : { kind: 'geonames', id: place!.id },
        consentBirthData: true,
        placeObject: manual ? undefined : place!,
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const fieldErrs: Record<string, string> = {};
        for (const d of err.details ?? []) fieldErrs[d.path.split('.')[0] || 'form'] = d.message;
        setErrors({ form: err.message, ...fieldErrs });
      } else setErrors({ form: 'Something went wrong. Please try again.' });
    }
    setBusy(false);
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {errors.form && <Notice tone="danger">{errors.form}</Notice>}
      {showName && (
        <Field label="Full name (optional)" hint="Used only for optional numerology and certificates. Never shown publicly unless you choose.">
          {(id, d) => <Input id={id} aria-describedby={d} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" />}
        </Field>
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Date of birth" error={errors.date} required>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={Boolean(errors.date)} type="date" value={date} max={new Date().toISOString().slice(0, 10)} onChange={(e) => setDate(e.target.value)} />}
        </Field>
        <Field label="How sure are you of the time?">
          {(id) => (
            <Select id={id} value={precision} onChange={(e) => setPrecision(e.target.value as Precision)}>
              <option value="exact">Exact (birth certificate or record)</option>
              <option value="within_15m">Within about 15 minutes</option>
              <option value="within_1h">Within about an hour</option>
              <option value="unknown">I don’t know my birth time</option>
            </Select>
          )}
        </Field>
      </div>
      {!unknownTime ? (
        <Field label="Time of birth (local time at the birthplace)" error={errors.time} hint="Use the clock time where you were born. We apply that place’s historical time zone and daylight-saving rules." required>
          {(id, d) => <Input id={id} aria-describedby={d} aria-invalid={Boolean(errors.time)} type="time" value={time ?? ''} onChange={(e) => setTime(e.target.value)} />}
        </Field>
      ) : (
        <Notice tone="info">Without a birth time we calculate for local noon and clearly mark your Ascendant, houses and any Moon-based factors that could change during the day as uncertain. We never invent a time.</Notice>
      )}
      <Field label="Place of birth" error={errors.place} required>
        {(id, d) => manual ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Input aria-label="Place name" placeholder="Place name" value={manualVals.name} onChange={(e) => setManualVals({ ...manualVals, name: e.target.value })} />
            <Input aria-label="Latitude" placeholder="Latitude (e.g. 26.91)" inputMode="decimal" value={manualVals.latitude} onChange={(e) => setManualVals({ ...manualVals, latitude: e.target.value })} />
            <Input aria-label="Longitude" placeholder="Longitude (e.g. 75.79)" inputMode="decimal" value={manualVals.longitude} onChange={(e) => setManualVals({ ...manualVals, longitude: e.target.value })} />
          </div>
        ) : <PlaceSearch id={id} describedBy={d} value={place} onChange={setPlace} label="Place of birth" />}
      </Field>
      <button type="button" className="-mt-3 self-start text-xs text-accent underline-offset-4 hover:underline" onClick={() => setManual(!manual)}>
        {manual ? 'Search the place list instead' : 'Can’t find your birthplace? Enter coordinates'}
      </button>
      <div>
        <Checkbox checked={consent} onChange={setConsent} label={consentLabel ?? "I consent to Nakshatra processing my birth details to calculate my charts."}
          description={consentDescription ?? "Your exact birth date, time and place stay private by default. You can withdraw consent and delete them at any time in Settings → Privacy."} />
        {errors.consent && <p role="alert" className="mt-1 text-xs text-danger">{errors.consent}</p>}
      </div>
      <Button type="submit" size="lg" loading={busy} className="sm:self-start">{submitLabel}</Button>
    </form>
  );
}
