import { useParams, Link } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, get, post } from '../lib/api';
import { useMe } from '../lib/session';
import { Badge, Button, Card } from '../components/ui/primitives';
import { Notice, QueryState } from '../components/ui/feedback';

interface GiftPreview { gift: { product: string; description: string; from: string; message: string; status: string; expiresAt: string; sentTo: string; claimedByYou: boolean } }

const STATUS: Record<string, string> = { pending: 'Waiting to be claimed', claimed: 'Claimed', expired: 'Expired', refunded: 'Refunded', cancelled: 'Cancelled' };

/** Public gift link: shows what it is and who sent it; claiming needs the verified email it was sent to. */
export function GiftClaim() {
  const { token = '' } = useParams();
  const me = useMe().data?.user;
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['gift', token], queryFn: () => get<GiftPreview>(`gifts/claim/${token}`), retry: false });
  const claim = useMutation({ mutationFn: () => post(`gifts/claim/${token}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['gift', token] }) });
  const next = encodeURIComponent(`/gifts/claim/${token}`);
  return (
    <div className="mx-auto max-w-xl py-12">
      <QueryState q={q}>{({ gift }) => (
        <Card className="space-y-4">
          <p className="eyebrow">A gift for you</p>
          <h1 className="font-display text-4xl">{gift.product}</h1>
          <p className="text-fg-2">From {gift.from}{gift.message ? <> · “{gift.message}”</> : null}</p>
          <p className="text-sm text-fg-3">{gift.description}</p>
          <div className="flex flex-wrap items-center gap-2 text-sm"><Badge tone={gift.status === 'claimed' ? 'success' : gift.status === 'pending' ? 'accent' : 'neutral'}>{STATUS[gift.status] ?? gift.status}</Badge><span className="text-fg-3">Sent to {gift.sentTo}</span></div>
          {gift.status === 'pending' && (!me ? (
            <div className="space-y-2">
              <p className="text-sm text-fg-2">Sign in or create an account with the email address this gift was sent to. It is added automatically once that email is verified.</p>
              <div className="flex flex-wrap gap-2">
                <Link to={`/signup?next=${next}`} className="inline-flex rounded-full bg-accent px-5 py-2.5 font-semibold text-accent-ink">Create account</Link>
                <Link to={`/signin?next=${next}`} className="inline-flex rounded-full border border-line px-5 py-2.5">Sign in</Link>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <Button loading={claim.isPending} onClick={() => claim.mutate()}>Add to my library</Button>
              {claim.error && <Notice tone="danger">{claim.error instanceof ApiError ? claim.error.message : 'Could not claim this gift.'}</Notice>}
            </div>
          ))}
          {(gift.claimedByYou || claim.isSuccess) && <Notice tone="success" title="It’s yours">Find it in your <Link to="/shop/library" className="underline">library</Link>.</Notice>}
        </Card>
      )}</QueryState>
    </div>
  );
}

interface Received { gifts: { id: string; product: string; from: string; message: string; status: string; expiresAt: string }[]; emailVerified: boolean }
interface Sent { gifts: { id: string; orderId: string; product: string; to: string; status: string; expiresAt: string }[] }

/** Library panel: gifts addressed to you and gifts you sent. */
export function GiftsPanel() {
  const received = useQuery({ queryKey: ['gifts-received'], queryFn: () => get<Received>('gifts/received') });
  const sent = useQuery({ queryKey: ['gifts-sent'], queryFn: () => get<Sent>('gifts/sent') });
  const hasAny = (received.data?.gifts.length ?? 0) + (sent.data?.gifts.length ?? 0) > 0;
  if (!hasAny) return null;
  return (
    <Card className="space-y-3">
      <h2 className="font-display text-2xl">Gifts</h2>
      {!received.data?.emailVerified && <Notice tone="info">Verify your email to receive gifts sent to it.</Notice>}
      <ul className="space-y-2 text-sm">
        {received.data?.gifts.map((g) => <li key={g.id} className="flex flex-wrap justify-between gap-2"><span>{g.product} <span className="text-fg-3">from {g.from}</span></span><Badge>{STATUS[g.status] ?? g.status}</Badge></li>)}
        {sent.data?.gifts.map((g) => <li key={g.id} className="flex flex-wrap justify-between gap-2"><span>{g.product} <span className="text-fg-3">to {g.to}</span></span><span className="flex gap-2"><Badge>{STATUS[g.status] ?? g.status}</Badge><Link to={`/shop/orders/${g.orderId}`} className="text-accent underline">Order</Link></span></li>)}
      </ul>
    </Card>
  );
}
