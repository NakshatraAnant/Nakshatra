import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { describeApiError, get, post } from '../lib/api';
import { relative } from '../lib/format';
import { useMe } from '../lib/session';
import { Button, Card, Field, PageHeader, Textarea } from './ui/primitives';
import { LoadingBlock, Notice } from './ui/feedback';

const COPY = {
  creator: { title: 'Teach on Nakshatra', subtitle: 'Creators publish courses after editorial review. Tell us what you would like to teach and your background.', placeholder: 'e.g. I have taught Vedic astrology basics for 6 years and would like to publish a beginner course on nakshatras…' },
  seller: { title: 'Sell on Nakshatra', subtitle: 'Seller listings are reviewed before they go live. Tell us what you sell and how you source it. Outcome claims about products are not allowed.', placeholder: 'e.g. I make handmade brass diyas in Moradabad and ship across India…' },
} as const;

/** Shows the studio when the member has the role; otherwise an application form or its review status. */
export function RoleGate({ role, children }: { role: 'creator' | 'seller'; children: ReactNode }) {
  const me = useMe().data?.user;
  // Mirrors the server: creators/experts/admins may use creator tools; sellers/creators/vendors/admins seller tools.
  const allowed = role === 'creator' ? ['creator', 'expert', 'admin'] : ['seller', 'creator', 'vendor', 'admin'];
  const has = Boolean(me?.roles.some((r) => allowed.includes(r)));
  const q = useQuery({ queryKey: ['role-application', role], queryFn: () => get<{ hasRole: boolean; application: { status: string; reviewNote: string | null; createdAt: string } | null }>(`role-applications/${role}`), enabled: Boolean(me) && !has });
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const qc = useQueryClient();
  const apply = useMutation({ mutationFn: () => post('role-applications', { role, note }), onSuccess: () => qc.invalidateQueries({ queryKey: ['role-application', role] }), onError: (e) => setErr(describeApiError(e, 'Could not submit your application')) });
  if (has) return <>{children}</>;
  const c = COPY[role];
  const app = q.data?.application;
  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader kicker={role === 'creator' ? 'Creator studio' : 'Seller studio'} title={c.title} subtitle={c.subtitle} />
      {q.isLoading ? <LoadingBlock /> : app?.status === 'pending' ? (
        <Notice tone="info" title="Application under review">Submitted {relative(app.createdAt)}. You will get a notification when the team has reviewed it.</Notice>
      ) : (
        <Card className="space-y-4">
          {app?.status === 'rejected' && <Notice tone="warning" title="Previous application not approved">{app.reviewNote ?? 'You can apply again with more detail.'}</Notice>}
          {!me?.emailVerified && <Notice tone="warning">Verify your email before applying.</Notice>}
          {err && <Notice tone="danger">{err}</Notice>}
          <Field label="About you and what you plan to offer" hint="At least 30 characters. Reviewed by a person.">{(id, d) => <Textarea id={id} aria-describedby={d} rows={5} value={note} placeholder={c.placeholder} onChange={(e) => setNote(e.target.value)} />}</Field>
          <Button disabled={note.trim().length < 30 || !me?.emailVerified} loading={apply.isPending} onClick={() => { setErr(null); apply.mutate(); }}>Submit application</Button>
        </Card>
      )}
    </div>
  );
}
