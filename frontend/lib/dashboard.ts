import type { PortalState } from '../../shared/types';

export function dashboardSummary(data: PortalState, now = Date.now()) {
    const unread = data.messages.filter(message => message.sender_id !== data.member?.user_id && message.read_at == null);
    const upcoming = data.meetings.filter(meeting => meeting.status === 'confirmed' && meeting.end > now)
        .sort((a, b) => a.start - b.start);
    const missingLinks = upcoming.filter(meeting => meeting.format === 'online' && !meeting.link);
    const mentees = data.member?.role === 'mentor' ? data.people.filter(person => person.role === 'mentee').map(person => {
        const lastMessage = data.messages.filter(message => message.sender_id === person.user_id)
            .sort((a, b) => b.created_at - a.created_at)[0];
        return {
            person,
            unreadCount: unread.filter(message => message.mentee_id === person.user_id).length,
            lastMessage,
            nextMeeting: upcoming.find(meeting => meeting.mentee_id === person.user_id),
        };
    }).sort((a, b) => b.unreadCount - a.unreadCount || (b.lastMessage?.created_at ?? 0) - (a.lastMessage?.created_at ?? 0) || a.person.name.localeCompare(b.person.name)) : [];
    return { unread, upcoming, missingLinks, mentees };
}
