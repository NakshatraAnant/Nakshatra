import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, api, del, get, post } from '../lib/api';
import { relative, time } from '../lib/format';
import { Avatar, Badge, Button, Card, IconButton, PageHeader, Textarea, cx } from '../components/ui/primitives';
import { QueryState, Notice, EmptyState } from '../components/ui/feedback';
import { ConfirmDialog, useToast } from '../components/ui/overlays';
import { Icon } from '../components/ui/icons';
import { ReportDialog } from './identity';

interface Conv { id: string; kind: string; closed: boolean; myState: string; participants: { userId: string; state: string; displayName?: string; handle?: string; avatarUrl?: string | null }[]; lastMessage: { body: string; kind: string; createdAt: string; mine: boolean } | null; unread: number }
const KIND_LABEL: Record<string, string> = { direct: '', dating_match: 'Match', matchmaking: 'Matchmaking', consultation: 'Consultation', vendor: 'Vendor', wedding: 'Wedding' };

export function Inbox() {
  const [params] = useSearchParams();
  const to = params.get('to');
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['conversations'], queryFn: () => get<{ conversations: Conv[] }>('conversations'), refetchInterval: 15000 });
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const start = useMutation({ mutationFn: () => post<{ conversationId: string; request?: boolean }>('conversations', { userId: to, message: draft }), onSuccess: (r) => nav(`/messages/${r.conversationId}`), onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not send') });
  const requests = q.data?.conversations.filter((c) => c.myState === 'requested') ?? [];
  const active = q.data?.conversations.filter((c) => c.myState !== 'requested') ?? [];
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker="Messages" title="Conversations" subtitle="Message requests from people you’re not connected with wait here until you accept." />
      {to && (
        <Card className="mb-6">
          <h2 className="font-display text-2xl">New message</h2>
          {error && <Notice tone="danger" className="mt-2">{error}</Notice>}
          <Textarea className="mt-3" rows={3} value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="Message" placeholder="Say hello…" />
          <p className="mt-1 text-xs text-fg-3">If you aren’t connected, this arrives as a request and you can send up to three messages until they accept.</p>
          <Button className="mt-3" disabled={!draft.trim()} loading={start.isPending} onClick={() => start.mutate()} icon="send">Send</Button>
        </Card>
      )}
      <QueryState q={q} empty={(d) => (!d.conversations.length && !to ? <EmptyState icon="messages" title="No conversations yet" body="Messages from matches, consultations and connections appear here." /> : null)}>{() => (
        <>
          {requests.length > 0 && (<><h2 className="mb-2 font-display text-2xl">Requests</h2><ConvList list={requests} /><div className="orbit-rule my-6" /></>)}
          <ConvList list={active} />
        </>
      )}</QueryState>
    </div>
  );
}

function ConvList({ list }: { list: Conv[] }) {
  return (
    <ul className="divide-y divide-[var(--line)] overflow-hidden rounded-[var(--radius-lg)] border border-line">
      {list.map((c) => {
        const other = c.participants[0];
        return (
          <li key={c.id}>
            <Link to={`/messages/${c.id}`} className="flex items-center gap-3 bg-surface px-4 py-3 hover:bg-surface-2">
              <Avatar name={other?.displayName} src={other?.avatarUrl} size={44} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2"><p className={cx('truncate', c.unread ? 'font-semibold text-fg' : 'text-fg')}>{c.participants.map((p) => p.displayName).join(', ')}</p>{KIND_LABEL[c.kind] && <Badge tone="violet">{KIND_LABEL[c.kind]}</Badge>}{c.closed && <Badge>Closed</Badge>}</div>
                <p className="truncate text-sm text-fg-3">{c.lastMessage ? `${c.lastMessage.mine ? 'You: ' : ''}${c.lastMessage.body}` : 'No messages yet'}</p>
              </div>
              <div className="flex flex-col items-end gap-1">{c.lastMessage && <span className="text-xs text-fg-3">{relative(c.lastMessage.createdAt)}</span>}{c.unread > 0 && <span className="rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">{c.unread}</span>}</div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

interface MsgResp { conversation: { id: string; kind: string; contextId: string | null; closed: boolean; myState: string; participants: { userId: string; state: string; displayName?: string; handle?: string; avatarUrl?: string | null }[] }; messages: { id: string; kind: string; body: string; deleted: boolean; attachment: string | null; createdAt: string; sender: { userId: string; displayName?: string } | null; mine: boolean; readByOthers: boolean }[]; hasMore: boolean }

export function Conversation() {
  const { id } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const nav = useNavigate();
  const [body, setBody] = useState('');
  const [report, setReport] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  // Polling keeps messages fresh; authorization is re-checked by the server on every request.
  const q = useQuery({ queryKey: ['messages', id], queryFn: () => get<MsgResp>(`conversations/${id}/messages`), refetchInterval: 4000 });
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [q.data?.messages.length]);
  const send = useMutation({ mutationFn: () => post(`conversations/${id}/messages`, { body }), onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['messages', id] }); qc.invalidateQueries({ queryKey: ['msg-count'] }); }, onError: (e) => toast(e instanceof ApiError ? e.message : 'Not sent', 'error') });
  const attach = useMutation({ mutationFn: (f: File) => { const form = new FormData(); form.append('file', f); form.append('body', body); return api(`conversations/${id}/messages`, { method: 'POST', form }); }, onSuccess: () => { setBody(''); qc.invalidateQueries({ queryKey: ['messages', id] }); }, onError: (e) => toast((e as Error).message, 'error') });
  const respond = useMutation({ mutationFn: (accept: boolean) => post(`conversations/${id}/respond`, { accept }), onSuccess: (_r, accept) => { qc.invalidateQueries({ queryKey: ['messages', id] }); if (!accept) nav('/messages'); } });
  const settings = useMutation({ mutationFn: (s: { muted?: boolean; leave?: boolean }) => post(`conversations/${id}/settings`, s), onSuccess: (_r, s) => { if (s.leave) nav('/messages'); else toast('Notifications muted', 'success'); } });
  const delMsg = useMutation({ mutationFn: (mid: string) => del(`messages/${mid}`), onSuccess: () => qc.invalidateQueries({ queryKey: ['messages', id] }) });
  return (
    <QueryState q={q}>{(d) => {
      const other = d.conversation.participants[0];
      return (
        <div className="mx-auto flex h-[calc(100dvh-10rem)] max-w-3xl flex-col md:h-[calc(100dvh-8rem)]">
          <header className="flex items-center gap-3 border-b border-line pb-3">
            <Link to="/messages" className="md:hidden" aria-label="Back to messages"><Icon name="chevronLeft" /></Link>
            <Avatar name={other?.displayName} src={other?.avatarUrl} size={40} />
            <div className="flex-1"><p className="text-fg">{d.conversation.participants.map((p) => p.displayName).join(', ')}</p><p className="text-xs text-fg-3">{KIND_LABEL[d.conversation.kind] || 'Direct message'}{other?.state === 'requested' ? ' · request pending' : ''}</p></div>
            {d.conversation.kind === 'consultation' && d.conversation.contextId && <Link to={`/experts/bookings/${d.conversation.contextId}`} className="text-sm text-accent">Booking</Link>}
            <IconButton icon="bell" label="Mute notifications" onClick={() => settings.mutate({ muted: true })} />
            {other && <IconButton icon="flag" label="Block this person" onClick={() => setBlockOpen(true)} />}
          </header>
          {d.conversation.kind === 'dating_match' && <Notice tone="info" className="mt-3">Keep chats on Nakshatra until you’re comfortable. Never send money to someone you haven’t met.</Notice>}
          <div className="flex-1 overflow-y-auto py-4 scrollbar-thin" aria-live="polite" aria-label="Messages">
            <ol className="space-y-2">
              {d.messages.map((m) => m.kind === 'system' ? (
                <li key={m.id} className="mx-auto max-w-sm text-center text-xs text-fg-3">{m.body}</li>
              ) : (
                <li key={m.id} className={cx('group flex', m.mine ? 'justify-end' : 'justify-start')}>
                  <div className={cx('max-w-[78%] rounded-[var(--radius-lg)] px-3.5 py-2 text-[15px]', m.mine ? 'rounded-br-sm bg-accent text-accent-ink' : 'rounded-bl-sm bg-surface-2 text-fg')}>
                    {m.deleted ? <em className="opacity-70">Message deleted</em> : <p className="whitespace-pre-line">{m.body}</p>}
                    {m.attachment && <img src={m.attachment} alt="Attachment" className="mt-2 max-h-64 rounded" loading="lazy" />}
                    <p className={cx('mt-0.5 text-[10px]', m.mine ? 'text-accent-ink/70' : 'text-fg-3')}>{time(m.createdAt)}{m.mine && m.readByOthers ? ' · Read' : ''}</p>
                  </div>
                  {!m.deleted && (m.mine
                    ? <button type="button" className="ml-1 self-center text-xs text-fg-3 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => delMsg.mutate(m.id)}>Delete</button>
                    : <button type="button" className="ml-1 self-center text-xs text-fg-3 opacity-0 group-hover:opacity-100 focus:opacity-100" onClick={() => setReport(m.id)}>Report</button>)}
                </li>
              ))}
            </ol>
            <div ref={endRef} />
          </div>
          {d.conversation.myState === 'requested' ? (
            <Card className="flex flex-wrap items-center justify-between gap-3 p-4"><p className="text-sm text-fg-2">Accept this message request to reply. They won’t know if you decline.</p><div className="flex gap-2"><Button size="sm" onClick={() => respond.mutate(true)}>Accept</Button><Button size="sm" variant="ghost" onClick={() => respond.mutate(false)}>Decline</Button></div></Card>
          ) : d.conversation.closed ? (
            <Notice tone="info">This conversation is closed.</Notice>
          ) : (
            <form className="flex items-end gap-2 border-t border-line pt-3" onSubmit={(e) => { e.preventDefault(); if (body.trim()) send.mutate(); }}>
              <label className="cursor-pointer rounded-full p-2 text-fg-3 hover:bg-surface-2" aria-label="Attach an image"><Icon name="image" /><input type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" onChange={(e) => e.target.files?.[0] && attach.mutate(e.target.files[0])} /></label>
              <Textarea rows={1} value={body} onChange={(e) => setBody(e.target.value)} aria-label="Write a message" className="min-h-11 flex-1" onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); if (body.trim()) send.mutate(); } }} />
              <Button type="submit" icon="send" loading={send.isPending} disabled={!body.trim()} aria-label="Send" />
            </form>
          )}
          <ReportDialog open={Boolean(report)} onClose={() => setReport(null)} targetType="message" targetId={report ?? ''} />
          <ConfirmDialog open={blockOpen} onClose={() => setBlockOpen(false)} danger title={`Block ${other?.displayName}?`} confirmLabel="Block" body="They won’t be able to message you, see your profile or find you in discovery. Any Bonds and matches with them end."
            onConfirm={async () => { await post(`blocks/${other!.userId}`); setBlockOpen(false); toast('Blocked', 'success'); nav('/messages'); }} />
        </div>
      );
    }}</QueryState>
  );
}
