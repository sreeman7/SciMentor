import { MessageSquare, Video } from 'lucide-react';
import type { Meeting, PortalState } from '@/lib/types';
import { dashboardSummary } from '@/lib/dashboard';
import { clockTime, fullDate } from '@/lib/rules';

export function DashboardInsights({ data, onConversation, onMeetingLink }: {
    data: PortalState;
    onConversation: (menteeId: string) => void;
    onMeetingLink: (meeting: Meeting) => void;
}) {
    const { mentees, missingLinks } = dashboardSummary(data);
    if (data.member?.role !== 'mentor') return null;
    return <div className="two-col mt-6">
        <section className="panel"><div className="section-head"><h2>Mentee activity</h2><MessageSquare size={19}/></div>
            <p className="muted">Messages and upcoming meetings in your mentoring space.</p>
            {mentees.length ? mentees.map(({ person, unreadCount, lastMessage, nextMeeting }) => <div className="list-row" key={person.user_id}>
                <div><h3>{person.name} {person.suspended_at != null && <span className="badge gray">Suspended</span>} {unreadCount > 0 && <span className="badge yellow">{unreadCount} unread</span>}</h3>
                    <p>{lastMessage ? `Last message: ${fullDate(lastMessage.created_at)} · ${clockTime(lastMessage.created_at)}` : 'No messages from this mentee yet'}</p>
                    <p>{nextMeeting ? `Next meeting: ${fullDate(nextMeeting.start)} · ${clockTime(nextMeeting.start)}` : 'No upcoming meeting'}</p>
                </div>
                <button className="text-link" onClick={() => onConversation(person.user_id)}>Open conversation</button>
            </div>) : <p className="muted mt-4">Invite your first mentee to see their messages and meetings here.</p>}
        </section>
        <section className="panel"><div className="section-head"><h2>Meeting links to add</h2><Video size={19}/></div>
            {missingLinks.length ? missingLinks.map(meeting => <div className="list-row" key={meeting.id}>
                <div><h3>{meeting.mentee_name}</h3><p>{fullDate(meeting.start)} · {clockTime(meeting.start)}</p></div>
                <button className="button secondary small" onClick={() => onMeetingLink(meeting)}>Add link</button>
            </div>) : <p className="muted">No upcoming online meetings are missing a link.</p>}
        </section>
    </div>;
}
