import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, del, get, put } from '../lib/api';
import { Button, Card, PageHeader, cx } from '../components/ui/primitives';
import { QueryState } from '../components/ui/feedback';
import { useToast } from '../components/ui/overlays';
import { AVATAR_PARTS, AVATAR_PART_KEYS, DEFAULT_AVATAR, randomAvatar, swatch, type AvatarConfig, type AvatarPart } from '../../shared/avatar';
import { AvatarPreview } from '../components/Showcase';
import { StudioNav } from '../components/IdentityIntro';

const PART_LABEL: Record<AvatarPart, string> = { skin: 'Skin tone', face: 'Face shape', hair: 'Hair', hairColor: 'Hair colour', eyes: 'Eyes', brows: 'Eyebrows', mouth: 'Mouth', accessory: 'Extras', background: 'Background' };

/** Avatar creator: build a drawn picture from parts — no photo needed. */
export function AvatarCreatorPage() {
  const q = useQuery({ queryKey: ['avatar-builder'], queryFn: () => get<{ config: AvatarConfig | null; inUse: boolean }>('profile/avatar-builder') });
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <StudioNav />
      <PageHeader kicker="Identity Studio" title="Avatar creator" subtitle="Make a picture of yourself from parts — no photo needed. It shows wherever your picture does." />
      <QueryState q={q}>{(d) => <Builder initial={d.config ?? DEFAULT_AVATAR} inUse={d.inUse} />}</QueryState>
    </div>
  );
}

function Builder({ initial, inUse }: { initial: AvatarConfig; inUse: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [c, setC] = useState<AvatarConfig>(initial);
  useEffect(() => setC(initial), [initial]);
  const done = (msg: string) => { void qc.invalidateQueries({ queryKey: ['me'] }); void qc.invalidateQueries({ queryKey: ['avatar-builder'] }); toast(msg, 'success'); };
  const fail = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Could not save', 'error');
  const save = useMutation({ mutationFn: () => put('profile/avatar-builder', c), onSuccess: () => done('Avatar saved — it’s your picture now'), onError: fail });
  const remove = useMutation({ mutationFn: () => del('profile/avatar'), onSuccess: () => done('Picture removed'), onError: fail });
  return (
    <div className="grid gap-6 md:grid-cols-[minmax(0,260px)_1fr]">
      <div className="space-y-3 md:sticky md:top-20 md:self-start">
        <AvatarPreview config={c} />
        <div className="flex flex-wrap justify-center gap-2">
          <Button loading={save.isPending} onClick={() => save.mutate()}>Save as my picture</Button>
          <Button variant="secondary" onClick={() => setC(randomAvatar())}>Surprise me</Button>
        </div>
        {inUse && <div className="text-center"><Button variant="ghost" size="sm" loading={remove.isPending} onClick={() => remove.mutate()}>Remove my picture</Button></div>}
        <p className="text-center text-xs text-fg-3">Uploading a photo in Profile replaces it; you can switch back here any time.</p>
      </div>
      <Card className="space-y-5">
        {AVATAR_PART_KEYS.map((p) => (
          <section key={p} className="space-y-2">
            <h2 id={`part-${p}`} className="text-sm font-semibold text-fg">{PART_LABEL[p]}</h2>
            <div role="radiogroup" aria-labelledby={`part-${p}`} className="flex flex-wrap gap-2">
              {AVATAR_PARTS[p].map((o) => {
                const on = c[p] === o.key;
                const colour = swatch(p, o.key);
                return (
                  <button key={o.key} type="button" role="radio" aria-checked={on} aria-label={colour ? o.label : undefined} title={colour ? o.label : undefined} onClick={() => setC({ ...c, [p]: o.key })}
                    className={cx('rounded-full border text-sm transition-colors', colour ? 'h-9 w-9 p-1' : 'px-3 py-1.5', on ? 'border-fg text-fg' : 'border-line text-fg-2 hover:border-line-strong')}>
                    {colour ? <span aria-hidden="true" className="block h-full w-full rounded-full" style={{ background: colour }} /> : o.label}
                  </button>
                );
              })}
            </div>
          </section>
        ))}
      </Card>
    </div>
  );
}
