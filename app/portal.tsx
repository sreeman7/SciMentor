"use client";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarDays, GraduationCap, LayoutDashboard, MessageSquare, Megaphone, BookOpen, Users, ArrowUpRight, Clock3, ShieldCheck, Plus, ChevronLeft, ChevronRight, Video, MapPin, LockKeyhole, ArrowRight, LogOut, Copy, ExternalLink, Mail, Check, Trash2, LoaderCircle } from 'lucide-react';
import { Sidebar, SidebarProvider, SidebarContent, SidebarHeader, SidebarFooter, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Toaster } from '@/components/ui/sonner';
import { toast } from 'sonner';
import type { PortalState, Slot, Meeting } from '@/lib/types';
import { dateKey, monday, shiftDay, clockTime, fullDate, canBook, TIMEZONE } from '@/lib/rules';
type View = 'overview' | 'availability' | 'meetings' | 'messages' | 'announcements' | 'resources' | 'mentees';
type Modal = {
    type: 'availability' | 'book' | 'announce' | 'invite' | 'resource' | 'link';
    slot?: Slot;
    meeting?: Meeting;
};
type Confirm = {
    action: string;
    id?: string;
    hash?: string;
    title: string;
    description: string;
};
const titles: Record<View, string> = { overview: 'Overview', availability: 'Weekly availability', meetings: 'Meetings', messages: 'Private messages', announcements: 'Announcements', resources: 'FAQs & resources', mentees: 'Mentees' };
function SelectField({ name, label, options, initial, onChange }: {
    name: string;
    label: string;
    options: [
        string,
        string
    ][];
    initial: string;
    onChange?: (value: string) => void;
}) { return <label className="field"><span>{label}</span><Select name={name} defaultValue={initial} onValueChange={onChange}><SelectTrigger className="w-full h-11 bg-white" aria-label={label}><SelectValue /></SelectTrigger><SelectContent>{options.map(([v, t]) => <SelectItem key={v} value={v}>{t}</SelectItem>)}</SelectContent></Select></label>; }
function Field({ label, name, type = 'text', value, required = true, max = 2000, hint }: {
    label: string;
    name: string;
    type?: string;
    value?: string;
    required?: boolean;
    max?: number;
    hint?: string;
}) { return <label className="field"><span>{label}</span>{type === 'textarea' ? <textarea name={name} defaultValue={value} required={required} maxLength={max}/> : <input name={name} type={type} defaultValue={value} required={required} maxLength={max}/>} {hint && <small>{hint}</small>}</label>; }
function Empty({ icon: Icon = CalendarDays, title, children, action }: {
    icon?: typeof CalendarDays;
    title: string;
    children: ReactNode;
    action?: ReactNode;
}) { return <div className="empty-box"><Icon size={30}/><h3>{title}</h3><p>{children}</p>{action}</div>; }
function Navigation({ view, go, mentor, count }: {
    view: View;
    go: (v: View) => void;
    mentor: boolean;
    count: number;
}) { const { setOpenMobile } = useSidebar(); const items: [
    View,
    typeof CalendarDays
][] = [['overview', LayoutDashboard], ['availability', CalendarDays], ['meetings', Clock3], ['messages', MessageSquare], ['announcements', Megaphone], ['resources', BookOpen], ...(mentor ? [['mentees', Users] as [
            View,
            typeof CalendarDays
        ]] : [])]; return <nav className="nav-list">{items.map(([v, Icon]) => <button key={v} className={`nav-item ${view === v ? 'active' : ''}`} onClick={() => { go(v); setOpenMobile(false); }} aria-current={view === v ? 'page' : undefined}><Icon size={19}/>{v === 'availability' && !mentor ? 'Book a meeting' : v === 'meetings' && !mentor ? 'My meetings' : titles[v]}{v === 'mentees' && count > 0 && <span className="count">{count}</span>}</button>)}</nav>; }
export default function Portal({ user }: {
    user: {
        name: string;
        email: string;
    };
}) {
    const [data, setData] = useState<PortalState | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [view, setView] = useState<View>('overview'), [busy, setBusy] = useState(false), [modal, setModal] = useState<Modal | null>(null), [confirm, setConfirm] = useState<Confirm | null>(null), [week, setWeek] = useState(() => monday(dateKey(Date.now()))), [format, setFormat] = useState('online'), [kind, setKind] = useState('faq'), [inviteCode, setInviteCode] = useState(''), [person, setPerson] = useState(''), [replyTo, setReplyTo] = useState<{
        id: string;
        title: string;
    } | null>(null), [message, setMessage] = useState(''), [search, setSearch] = useState('');
    const lock = useRef(false);
    const mentor = data?.member?.role === 'mentor';
    const mentees = data?.people.filter(p => p.role === 'mentee') ?? [];
    const now = Date.now();
    const upcoming = data?.meetings.filter(m => m.status === 'confirmed' && m.end > now) ?? [];
    async function load() { setLoading(true); try {
        const r = await fetch('/api/portal', { cache: 'no-store' });
        const d = await r.json() as PortalState & {
            error?: string;
        };
        if (!r.ok)
            throw new Error(d.error);
        setData(d);
        setError('');
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { void load(); const sync = () => { const v = location.hash.slice(1) as View; if (v in titles)
        setView(v); }; sync(); window.addEventListener('hashchange', sync); return () => window.removeEventListener('hashchange', sync); }, []);
    function go(v: View) { setView(v); location.hash = v; setError(''); }
    async function run(input: Record<string, unknown>) { if (lock.current)
        return null; lock.current = true; setBusy(true); setError(''); try {
        const r = await fetch('/api/portal', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
        const result = await r.json() as {
            state: PortalState;
            message: string;
            error?: string;
            code?: string;
        };
        if (!r.ok)
            throw new Error(result.error);
        setData(result.state);
        toast.success(result.message);
        return result;
    }
    catch (e) {
        const m = (e as Error).message;
        setError(m);
        toast.error(m);
        return null;
    }
    finally {
        lock.current = false;
        setBusy(false);
    } }
    function open(m: Modal) { setError(''); if (m.type === 'book')
        setFormat(m.slot?.format === 'in-person' ? 'in-person' : 'online'); if (m.type === 'resource')
        setKind('faq'); setModal(m); }
    async function submit(event: FormEvent<HTMLFormElement>, action: string, extra: Record<string, unknown> = {}) { event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); const r = await run({ ...values, ...extra, action }); if (r) {
        setModal(null);
        if (r.code)
            setInviteCode(r.code);
    } return r; }
    const heading = (title: string, subtitle: string, action?: ReactNode) => <div className="page-heading"><div><p className="eyebrow">YOUR SCIENCE MENTORING SPACE</p><h1>{title}</h1><p className="muted">{subtitle}</p></div>{action}</div>;
    const addButton = (label: string, type: Modal['type']) => <button className="button" onClick={() => open({ type })}><Plus size={17}/>{label}</button>;
    const meetingRows = (list: Meeting[]) => list.map(m => <div className="list-row" key={m.id}><div className="row"><span className="avatar">{m.format === 'online' ? <Video size={18}/> : <MapPin size={18}/>}</span><div><h3>{mentor ? m.mentee_name : m.agenda}</h3><p>{fullDate(m.start)} · {clockTime(m.start)}–{clockTime(m.end)}</p><p>{m.format === 'in-person' ? m.location : 'Online meeting'}{m.status === 'cancelled' ? ' · Cancelled' : ''}</p>{mentor && <p className="pre-line">{m.agenda}</p>}</div></div><div className="actions">{m.status === 'confirmed' && m.format === 'online' && (m.link ? <a className="button secondary small" href={m.link} target="_blank" rel="noreferrer">Join meeting <ExternalLink size={14}/></a> : mentor ? <button className="button secondary small" onClick={() => open({ type: 'link', meeting: m })}>Add meeting link</button> : <span className="badge yellow">Link coming soon</span>)}{m.status === 'confirmed' && m.start > now && <button className="text-link" onClick={() => setConfirm({ action: 'cancel', id: m.id, title: 'Cancel this meeting?', description: 'The meeting will be marked cancelled for both of you. To reschedule, book another available slot.' })}>Cancel</button>}</div></div>);
    return <SidebarProvider><Sidebar><SidebarHeader><div className="brand"><GraduationCap /><span>SciMentor<span className="brand-sub">SCIENCE MENTORING</span></span></div></SidebarHeader><SidebarContent><div className="nav-label">YOUR WORKSPACE</div><Navigation view={view} go={go} mentor={!!mentor} count={mentees.length}/><div className="sidebar-note"><ShieldCheck size={22}/><strong>A little support goes a long way.</strong><p>Your questions and replies stay between you and your mentor.</p></div></SidebarContent><SidebarFooter><div className="profile"><span className="avatar">{(data?.member?.name || user.name || user.email).charAt(0).toUpperCase()}</span><div className="min-w-0 flex-1"><div className="truncate">{data?.member?.name || user.name || 'Your account'}</div><span>{data?.member ? (mentor ? 'Science mentor' : 'Science mentee') : 'Let’s get you settled'}</span></div><form action="/auth/signout" method="post"><button type="submit" aria-label="Sign out" title="Sign out"><LogOut size={17}/></button></form></div></SidebarFooter></Sidebar><main className="workspace"><header className="topbar"><div className="row"><SidebarTrigger /><span>{data?.group?.name || 'Your mentoring space'}</span></div><span className="pill"><LockKeyhole size={12}/> Private workspace</span></header><div className="page">
 {error && <div className="error" role="alert">{error}{!data && <button className="button secondary small ml-3" onClick={load}>Try again</button>}</div>}
 {loading && !data ? <div className="loading"><LoaderCircle className="animate-spin mx-auto mb-4"/><p className="muted">Opening your mentoring space…</p></div> : data && !data.member ? <div className="onboarding">{heading('A good place to begin.', 'Create your mentoring space, or join your mentor with an invite code.')}<section className="welcome-card"><div><span className="tag">WELCOME TO SCIMENTOR</span><h2>Big questions.<br />A little guidance.</h2><p>A private space for your science journey.</p></div><GraduationCap size={75} strokeWidth={1} className="text-[#f2d57b]"/></section><section className="panel"><Tabs defaultValue="mentor"><TabsList className="w-full mb-6"><TabsTrigger value="mentor" className="flex-1">I’m a mentor</TabsTrigger><TabsTrigger value="mentee" className="flex-1">I’m a mentee</TabsTrigger></TabsList><TabsContent value="mentor"><form className="form-stack" onSubmit={e => submit(e, 'create-group')}><Field label="Your name" name="name" value={user.name} max={80}/><Field label="Mentoring space name" name="title" value="Science mentoring" max={100}/><p className="muted">You’ll set your availability and invite your own mentees. Your space stays separate from other mentors.</p><button className="button" disabled={busy}>Create my space <ArrowRight size={17}/></button></form></TabsContent><TabsContent value="mentee"><form className="form-stack" onSubmit={e => submit(e, 'join')}><Field label="Your name" name="name" value={user.name} max={80}/><Field label="Mentor’s invite code" name="code" max={80} hint="Use the code your mentor shared with you. It expires after seven days."/><p className="muted">Signed in as {user.email}. Your invite must be assigned to this email address.</p><button className="button" disabled={busy}>Join my mentor <ArrowRight size={17}/></button></form></TabsContent></Tabs></section></div> : data?.member && <>
 {view === 'overview' && <>{heading(`Welcome${data.member.name ? ' back, ' + data.member.name.split(' ')[0] : ''}.`, mentor ? 'A little planning makes room for meaningful conversations.' : 'Your meetings, questions, and next steps, together.', mentor ? addButton('Set availability', 'availability') : <button className="button" onClick={() => go('availability')}><Plus size={17}/>Book a meeting</button>)}<section className="welcome-card"><div><span className="tag">ONE WEEK AT A TIME</span><h2>{mentor ? <>Your time.<br />Their next step.</> : <>You don’t have to<br />figure it out alone.</>}</h2><p>{mentor ? 'Publish the hours that work for you this week.' : 'Bring your questions. Your mentor is here to help.'}<br />{mentor ? 'Your mentees take it from there.' : 'Book a conversation or send a private message.'}</p><button className="button gold" onClick={() => go(mentor ? 'availability' : 'messages')}>{mentor ? 'Plan your week' : 'Ask your mentor'}<ArrowUpRight size={17}/></button></div><div className="welcome-aside"><CalendarDays size={38}/><strong>Time to prepare.</strong><span>Every booking gives you<br />at least 3 days’ notice.</span></div></section><div className="stats"><div className="stat"><CalendarDays /><strong>{upcoming.length}</strong><span>Upcoming meetings</span></div><div className="stat"><Users /><strong>{mentor ? mentees.length : data.people.find(p => p.role === 'mentor')?.name.split(' ')[0] || 'Your mentor'}</strong><span>{mentor ? 'Mentees in your space' : 'Your science mentor'}</span></div><div className="stat"><Clock3 /><strong>{data.slots.filter(s => !s.taken && canBook(s.start)).length}</strong><span>Bookable time slots</span></div></div><div className="two-col"><section className="panel"><div className="section-head"><h2>Coming up</h2><button className="text-link" onClick={() => go('meetings')}>All meetings <ArrowRight size={15}/></button></div>{upcoming.length ? meetingRows(upcoming.slice(0, 3)) : <Empty title="Room for a conversation" action={<button className="button secondary small" onClick={() => go('availability')}>{mentor ? 'Manage availability' : 'Find a time'}</button>}>{mentor ? 'Publish your availability so mentees can book a time.' : 'Find an available time with your mentor when you’re ready.'}</Empty>}</section><section className="panel"><div className="section-head"><h2>From your mentor</h2><Megaphone size={19}/></div>{data.announcements.length ? <><span className="badge">Latest announcement</span><h3 className="mt-4 mb-2">{data.announcements[0].title}</h3><p className="muted pre-line line-clamp-4">{data.announcements[0].body}</p><button className="text-link mt-5" onClick={() => go('announcements')}>Read announcement <ArrowRight size={15}/></button></> : <Empty icon={Megaphone} title="Keep everyone in the loop" action={mentor ? <button className="button secondary small" onClick={() => open({ type: 'announce' })}>Write an announcement</button> : undefined}>{mentor ? 'Share a welcome, a reminder, or something worth knowing.' : 'Your mentor’s announcements will appear here.'}</Empty>}</section></div></>}
 {view === 'availability' && <>{heading(mentor ? 'Make time for your mentees.' : 'Find a time to talk.', mentor ? 'Set your availability separately for each week. Nothing repeats automatically.' : 'Choose a published time at least 72 hours ahead.', mentor ? addButton('Add availability', 'availability') : undefined)}<div className="section-head"><div className="week-nav"><button className="icon-button" aria-label="Previous week" onClick={() => setWeek(shiftDay(week, -7))}><ChevronLeft size={17}/></button><h2>{new Date(week + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', timeZone: 'UTC' })} – {new Date(shiftDay(week, 6) + 'T12:00:00Z').toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' })}</h2><button className="icon-button" aria-label="Next week" onClick={() => setWeek(shiftDay(week, 7))}><ChevronRight size={17}/></button></div><span className="pill"><Clock3 size={13}/> Edmonton time</span></div><div className="week-grid">{Array.from({ length: 7 }, (_, i) => { const day = shiftDay(week, i), slots = data.slots.filter(s => dateKey(s.start) === day); return <div className="day-col" key={day}><div className={`day-head ${day === dateKey(now) ? 'today' : ''}`}>{new Date(day + 'T12:00:00Z').toLocaleDateString('en-CA', { weekday: 'short', timeZone: 'UTC' })}<strong>{Number(day.slice(-2))}</strong></div>{slots.length ? slots.map(s => <button key={s.id} className={`slot ${s.taken ? 'booked' : ''}`} disabled={!mentor && (!!s.taken || !canBook(s.start))} onClick={() => mentor ? setConfirm({ action: 'withdraw-slot', id: s.id, title: s.taken ? 'This slot is booked' : 'Remove this availability?', description: s.taken ? 'Cancel the meeting in Meetings before removing this slot.' : 'This removes the unbooked slot from your published availability.' }) : open({ type: 'book', slot: s })}><strong>{clockTime(s.start)}</strong><span>{(s.end - s.start) / 60000} min · {s.format === 'both' ? 'Either format' : s.format === 'online' ? 'Online' : 'In-person'}</span><span className="block mt-1">{s.taken ? 'Booked' : !canBook(s.start) ? 'Within 72h' : mentor ? 'Available · remove' : 'Book this time'}</span></button>) : <div className="day-empty">No availability</div>}</div>; })}</div><div className="notice info mt-5"><strong>Every week is different.</strong> Only published slots can be booked. {mentor ? 'Adding or removing availability never silently cancels a meeting.' : 'If nothing fits, send your mentor a private message.'}</div></>}
 {view === 'meetings' && <>{heading(mentor ? 'A little time, well spent.' : 'Your conversations, planned.', 'Meeting details are visible only to the mentor and the booked mentee.', !mentor ? <button className="button" onClick={() => go('availability')}><Plus size={17}/>Book a meeting</button> : undefined)}<div className="notice info"><Clock3 size={15} className="inline mr-2"/>All times are shown in {TIMEZONE}. To reschedule, cancel your meeting and book a new slot with 72 hours’ notice.</div><section className="panel">{data.meetings.length ? meetingRows(data.meetings) : <Empty title="No meetings yet">Your confirmed bookings will appear here, with the location or online meeting link.</Empty>}</section></>}
 {view === 'messages' && <>{heading('A safe place to ask.', 'Only you and the other person in this conversation can read these messages.')}<div className="panel chat-layout"><aside className="chat-list">{(mentor ? mentees : data.people.filter(p => p.role === 'mentor')).map(p => <button className={`chat-person ${person === p.user_id || (!person && p.user_id === (mentor ? mentees[0]?.user_id : data.people.find(p => p.role === 'mentor')?.user_id)) ? 'active' : ''}`} key={p.user_id} onClick={() => { setPerson(p.user_id); setReplyTo(null); setMessage(''); }}><span className="avatar">{p.name.charAt(0)}</span><span>{p.name}</span></button>)}{mentor && !mentees.length && <p className="muted">Invite your mentees to start a conversation.</p>}</aside><section className="chat-main"><div className="section-head"><h2>{(mentor ? mentees : data.people.filter(p => p.role === 'mentor')).find(p => p.user_id === person)?.name || (mentor ? mentees[0]?.name : data.people.find(p => p.role === 'mentor')?.name) || 'Private messages'}</h2><span className="privacy-line"><LockKeyhole size={13}/> Only you two</span></div><div className="chat-messages">{data.messages.filter(m => m.mentee_id === (mentor ? (person || mentees[0]?.user_id) : data.member!.user_id)).map(m => <div key={m.id} className={`bubble ${m.sender_id === data.member!.user_id ? 'mine' : ''}`}>{m.announcement_title && <div className="badge mb-2">Re: {m.announcement_title}</div>}<div>{m.body}</div><small>{fullDate(m.created_at)} · {clockTime(m.created_at)}</small></div>)}{!data.messages.some(m => m.mentee_id === (mentor ? (person || mentees[0]?.user_id) : data.member!.user_id)) && <Empty icon={MessageSquare} title="Start with a question">Big or small, this is your space to talk.</Empty>}</div>{(!mentor || mentees.length > 0) && <form className="form-stack" onSubmit={async (e) => { e.preventDefault(); const r = await run({ action: 'message', menteeId: mentor ? (person || mentees[0]?.user_id) : data.member!.user_id, body: message, announcementId: replyTo?.id }); if (r) {
            setMessage('');
            setReplyTo(null);
        } }}>{replyTo && <div className="notice info mb-0">Replying privately to “{replyTo.title}” <button type="button" className="text-link ml-2" onClick={() => setReplyTo(null)}>Clear</button></div>}<label className="field"><span className="sr-only">Private message</span><textarea placeholder="Write a private message…" value={message} onChange={e => setMessage(e.target.value)} required maxLength={5000}/></label><div className="section-head mb-0"><span className="privacy-line"><ShieldCheck size={14}/> Other mentees cannot see your replies.</span><button className="button" disabled={busy || !message.trim()}>Send privately <ArrowRight size={15}/></button></div></form>}</section></div></>}
 {view === 'announcements' && <>{heading('Keep everyone in the loop.', 'Announcements are shared with your group. Mentee replies always stay private.', mentor ? addButton('New announcement', 'announce') : undefined)}{mentor && !data.emailReady && <div className="notice"><Mail size={16} className="inline mr-2"/><strong>Email delivery needs connecting.</strong> Announcements appear in the portal now. Email copies are queued until a verified sender is configured.</div>}{mentor && data.emailPending > 0 && <div className="section-head"><span className="muted">{data.emailPending} email{data.emailPending === 1 ? '' : 's'} awaiting delivery or review</span><button className="button secondary small" disabled={busy || !data.emailReady} onClick={() => run({ action: 'retry-email' })}>Retry email delivery</button></div>}<div className="stack">{data.announcements.map(a => <article className="panel content-card" key={a.id}><div className="section-head mb-3"><span className="badge"><Megaphone size={12}/> For everyone in your group</span><span className="muted">{fullDate(a.created_at)}</span></div><h3>{a.title}</h3><p className="pre-line">{a.body}</p><div className="divider"/><div className="section-head mb-0"><span className="privacy-line"><LockKeyhole size={13}/> Replies are private</span>{mentor ? <span className="muted">{a.sent ?? 0} emails sent · {a.pending ?? 0} pending</span> : <button className="text-link" onClick={() => { setReplyTo({ id: a.id, title: a.title }); go('messages'); }}>Reply privately <ArrowRight size={14}/></button>}</div></article>)}{!data.announcements.length && <section className="panel"><Empty icon={Megaphone} title="Nothing announced just yet">{mentor ? 'Post a welcome or a helpful reminder for your mentees.' : 'Your mentor’s updates will appear here.'}</Empty></section>}</div></>}
 {view === 'resources' && <>{heading('A little knowledge goes a long way.', 'Answers and useful links, curated by your mentor.', mentor ? addButton('Add FAQ or resource', 'resource') : undefined)}<label className="field mb-6"><span className="sr-only">Search FAQs and resources</span><input type="search" placeholder="Search questions, answers, or resources…" value={search} onChange={e => setSearch(e.target.value)}/></label><Tabs defaultValue="faq"><TabsList className="mb-6"><TabsTrigger value="faq">Common questions</TabsTrigger><TabsTrigger value="resource">Useful resources</TabsTrigger></TabsList>{(['faq', 'resource'] as const).map(k => <TabsContent key={k} value={k}><section className="panel"><div className={k === 'faq' ? 'faq-list' : 'stack'}>{data.resources.filter(r => r.kind === k && `${r.title} ${r.body} ${r.category}`.toLowerCase().includes(search.toLowerCase())).map(r => k === 'faq' ? <details key={r.id}><summary>{r.title}</summary><p>{r.body}</p><div className="section-head mt-4 mb-0"><span className="badge">{r.category}</span>{mentor && <button className="text-link" onClick={() => setConfirm({ action: 'delete-resource', id: r.id, title: 'Remove this FAQ?', description: 'This answer will no longer appear in your group’s knowledge base.' })}>Remove</button>}</div></details> : <article key={r.id} className="content-card"><span className="badge">{r.category}</span><h3>{r.title}</h3><p className="pre-line">{r.body}</p><div className="section-head mt-4 mb-0"><a href={r.url} target="_blank" rel="noreferrer" className="text-link">Open resource <ExternalLink size={14}/></a>{mentor && <button className="text-link" onClick={() => setConfirm({ action: 'delete-resource', id: r.id, title: 'Remove this resource?', description: 'The link will be removed from your group’s library.' })}>Remove</button>}</div></article>)}</div>{!data.resources.some(r => r.kind === k && `${r.title} ${r.body} ${r.category}`.toLowerCase().includes(search.toLowerCase())) && <Empty icon={BookOpen} title={search ? 'No matches found' : k === 'faq' ? 'Your answers belong here' : 'Build a useful little library'}>{search ? 'Try a different word or clear your search.' : mentor ? 'Add the FAQs and resources you want your mentees to reference.' : 'Your mentor will add trusted information here.'}</Empty>}</section></TabsContent>)}</Tabs></>}
 {view === 'mentees' && mentor && <>{heading('Your mentoring circle.', 'Individual invite codes bring each mentee into your private group.', addButton('Invite a mentee', 'invite'))}<section className="panel"><div className="section-head"><h2>Your mentees</h2><span className="badge">{mentees.length} joined</span></div>{mentees.map(p => <div className="list-row" key={p.user_id}><div className="row"><span className="avatar">{p.name.charAt(0)}</span><div><h3>{p.name}</h3><p>{p.email}</p></div></div><button className="text-link" onClick={() => { setPerson(p.user_id); go('messages'); }}>Message privately <ArrowRight size={15}/></button></div>)}{!mentees.length && <Empty icon={Users} title="Start with your first invite">Create a code for each mentee and share it with them directly.</Empty>}</section><section className="panel mt-6"><div className="section-head"><h2>Invitations</h2><span className="muted">Valid for 7 days</span></div>{data.invites.map(i => <div className="list-row" key={i.hash}><div><h3>{i.name}</h3><p>{i.email}</p></div><div className="actions"><span className={`badge ${i.used_by ? '' : 'gray'}`}>{i.used_by ? 'Joined' : i.revoked ? 'Revoked' : i.expires_at < now ? 'Expired' : 'Awaiting mentee'}</span>{!i.used_by && !i.revoked && i.expires_at > now && <button className="text-link" onClick={() => setConfirm({ action: 'revoke-invite', hash: i.hash, title: 'Revoke this invite?', description: 'This unused code will no longer allow someone to join your space.' })}>Revoke</button>}</div></div>)}{!data.invites.length && <p className="muted">No invitations yet.</p>}</section></>}
 </>}
 </div><footer className="footer">SciMentor · An independent student mentoring project · Times in Edmonton</footer></main>
 <Dialog open={!!modal} onOpenChange={v => { if (!v && !busy)
        setModal(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto bg-white"><DialogHeader><DialogTitle>{modal?.type === 'availability' ? 'Make room for a conversation' : modal?.type === 'book' ? 'Book your meeting' : modal?.type === 'announce' ? 'Share an announcement' : modal?.type === 'invite' ? 'Invite a mentee' : modal?.type === 'link' ? 'Add an online meeting link' : 'Add to your knowledge base'}</DialogTitle><DialogDescription>{modal?.type === 'availability' ? 'Publish a time block for a specific date. We’ll split it into bookable meetings.' : modal?.type === 'book' ? 'Your booking details stay between you and your mentor.' : modal?.type === 'announce' ? 'Visible to your group. An email copy is queued for every joined mentee.' : modal?.type === 'invite' ? 'The code is tied to this email and can be used once within seven days.' : modal?.type === 'link' ? 'Only the booked mentee and you can see this link.' : 'Share an answer or a useful link with your mentees.'}</DialogDescription></DialogHeader>{error && <div className="error" role="alert">{error}</div>}
 {modal?.type === 'availability' && <form className="form-stack" onSubmit={async (e) => { const form = e.currentTarget; const day = String(new FormData(form).get('day')); const r = await submit(e, 'publish-slots'); if (r) {
        setWeek(monday(day));
        go('availability');
    } }}><Field name="day" label="Date" type="date" value={week > dateKey(now) ? week : shiftDay(dateKey(now), 3)}/><div className="form-grid"><Field name="from" label="From (Edmonton time)" type="time" value="13:00"/><Field name="to" label="Until (Edmonton time)" type="time" value="15:00"/></div><SelectField name="duration" label="Meeting length" initial="30" options={['15', '30', '45', '60'].map(v => [v, `${v} minutes`])}/><SelectField name="format" label="Meeting formats offered" initial="both" options={[["both", "Online or in-person"], ["online", "Online only"], ["in-person", "In-person only"]]}/><div className="notice info mb-0">Mentees can book only when the start time is at least 72 hours away. This availability does not repeat.</div><button className="button" disabled={busy}>Publish availability <Check size={16}/></button></form>}
 {modal?.type === 'book' && <form className="form-stack" onSubmit={e => submit(e, 'book', { slotId: modal.slot!.id })}><div className="notice info mb-0"><strong>{fullDate(modal.slot!.start)}</strong><br />{clockTime(modal.slot!.start)}–{clockTime(modal.slot!.end)} · Edmonton time</div><SelectField name="format" label="How would you like to meet?" initial={format} onChange={setFormat} options={modal.slot!.format === 'both' ? [['online', 'Online'], ['in-person', 'In-person']] : [[modal.slot!.format, modal.slot!.format === 'online' ? 'Online' : 'In-person']]}/>{format === 'in-person' ? <Field name="location" label="In-person meeting location" max={250} hint="Include the building, room, or a clear meeting point."/> : <p className="muted">Your mentor will add an online meeting link to your booking.</p>}<Field name="agenda" label="What would you like to discuss?" type="textarea" hint="A little context helps your mentor prepare."/><button className="button" disabled={busy}>Confirm meeting <Check size={16}/></button></form>}
 {modal?.type === 'announce' && <form className="form-stack" onSubmit={e => submit(e, 'announce')}><Field name="title" label="Title" max={150}/><Field name="body" label="Your announcement" type="textarea" max={10000}/>{!data?.emailReady && <div className="notice mb-0">Emails will remain queued until the email service is connected.</div>}<button className="button" disabled={busy}>Publish to my group <Megaphone size={16}/></button></form>}
 {modal?.type === 'invite' && <form className="form-stack" onSubmit={e => submit(e, 'invite')}><Field name="name" label="Mentee’s name" max={80}/><Field name="email" label="Mentee’s sign-in email" type="email" max={254} hint="Use the email they will use to sign in to SciMentor."/><button className="button" disabled={busy}>Create invite code <ArrowRight size={16}/></button></form>}
 {modal?.type === 'resource' && <form className="form-stack" onSubmit={e => submit(e, 'resource')}><SelectField name="kind" label="What are you adding?" initial="faq" onChange={setKind} options={[["faq", "Frequently asked question"], ["resource", "Useful resource"]]}/><Field name="title" label={kind === 'faq' ? 'Question' : 'Resource title'} max={200}/><Field name="body" label={kind === 'faq' ? 'Your answer' : 'Short description'} type="textarea" max={10000}/>{kind === 'resource' && <Field name="url" label="Resource link" type="url" max={1500} hint="Use a full https:// address."/>}<Field name="category" label="Topic" value="General advice" max={60}/><button className="button" disabled={busy}>Add to library <BookOpen size={16}/></button></form>}
 {modal?.type === 'link' && <form className="form-stack" onSubmit={e => submit(e, 'meeting-link', { id: modal.meeting!.id })}><Field name="link" label="Online meeting link" type="url" value={modal.meeting!.link} max={1500}/><button className="button" disabled={busy}>Save meeting link</button></form>}
 </DialogContent></Dialog>
 <Dialog open={!!inviteCode} onOpenChange={v => { if (!v)
        setInviteCode(''); }}><DialogContent className="bg-white"><DialogHeader><DialogTitle>Your mentee’s invite is ready</DialogTitle><DialogDescription>Copy this code now and share it privately. It is only shown once and expires in seven days.</DialogDescription></DialogHeader><p className="code">{inviteCode}</p><button className="button" onClick={async () => { try {
        await navigator.clipboard.writeText(inviteCode);
        toast.success('Invite code copied.');
    }
    catch {
        toast.error('Please select and copy the code manually.');
    } }}><Copy size={16}/>Copy invite code</button><p className="muted">When the portal is shared with them, they can sign in and select “I’m a mentee” to enter their code. Creating this code does not send an invitation email.</p></DialogContent></Dialog>
 <AlertDialog open={!!confirm} onOpenChange={v => { if (!v && !busy)
        setConfirm(null); }}><AlertDialogContent className="bg-white"><AlertDialogHeader><AlertDialogTitle>{confirm?.title}</AlertDialogTitle><AlertDialogDescription>{confirm?.description}</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={busy}>Keep it</AlertDialogCancel><AlertDialogAction disabled={busy || confirm?.title === 'This slot is booked'} onClick={async (e) => { e.preventDefault(); if (confirm) {
        const r = await run(confirm);
        if (r)
            setConfirm(null);
    } }}>Confirm</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>
 <Toaster theme="light" richColors position="bottom-right"/>
 </SidebarProvider>;
}
