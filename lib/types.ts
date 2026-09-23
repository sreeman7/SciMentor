export type Member = {
    user_id: string;
    group_id: string;
    role: 'mentor' | 'mentee';
    name: string;
    email: string;
};
export type Slot = {
    id: string;
    group_id: string;
    start: number;
    end: number;
    format: 'online' | 'in-person' | 'both';
    taken: number;
};
export type Meeting = {
    id: string;
    slot_id: string;
    mentee_id: string;
    mentee_name: string;
    start: number;
    end: number;
    format: 'online' | 'in-person';
    location: string;
    link: string;
    agenda: string;
    status: string;
};
export type Announcement = {
    id: string;
    title: string;
    body: string;
    created_at: number;
    sent?: number;
    pending?: number;
};
export type Message = {
    id: string;
    mentee_id: string;
    sender_id: string;
    body: string;
    created_at: number;
    announcement_id: string | null;
    announcement_title?: string;
};
export type Resource = {
    id: string;
    kind: 'faq' | 'resource';
    title: string;
    body: string;
    category: string;
    url: string;
};
export type Invite = {
    hash: string;
    email: string;
    name: string;
    expires_at: number;
    revoked: number;
    used_by: string | null;
};
export type PortalState = {
    member: Member | null;
    group?: {
        id: string;
        name: string;
    };
    people: Member[];
    slots: Slot[];
    meetings: Meeting[];
    announcements: Announcement[];
    messages: Message[];
    resources: Resource[];
    invites: Invite[];
    emailReady: boolean;
    emailPending: number;
};
