import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createDatabase } from '../db/query.ts';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { dashboardSummary } from '../lib/dashboard.ts';
import { canBook, NOTICE_MS, makeSlots, zonedTimestamp, dateKey, shiftDay } from '../lib/rules.ts';
const sql=readFileSync(new URL('../supabase/migrations/001_initial.sql',import.meta.url),'utf8');
let pg;
async function testDatabase() {
 if(pg) await pg.close();
 pg=new PGlite();await pg.exec(sql);await pg.exec(readFileSync(new URL('../supabase/migrations/002_message_reads.sql',import.meta.url),'utf8'));
 await pg.exec(readFileSync(new URL('../supabase/migrations/003_member_access.sql',import.meta.url),'utf8'));
 const query=client=>async(text,values)=>{const r=await client.query(text,values);return {rows:r.rows,rowCount:r.affectedRows??0};};
 return createDatabase(query(pg),fn=>pg.transaction(tx=>fn(query(tx))));
}
const bundled=await build({entryPoints:['lib/server.ts'],bundle:true,write:false,format:'esm',platform:'node',plugins:[{name:'test-bindings',setup(b){b.onResolve({filter:/^(@\/db|@\/lib\/auth)$/},a=>({path:a.path,namespace:'mock'}));b.onLoad({filter:/.*/,namespace:'mock'},a=>({contents:a.path==='@/db'?'export function getDatabase(){return globalThis.__scimentorTestEnv.DB}':'export async function getServerUser(){return globalThis.__scimentorTestUser??null}'}));}}]});
globalThis.__scimentorTestEnv={};
delete process.env.RESEND_API_KEY;delete process.env.EMAIL_FROM;
const {act,state,identity}=await import('data:text/javascript;base64,'+Buffer.from(bundled.outputFiles[0].text).toString('base64'));
const user=(id)=>({userId:id,email:`${id}@example.test`,displayName:id,fullName:id});
const mentor=user('mentor'),other=user('other'),alice=user('alice'),bob=user('bob'),outsider=user('outsider');
async function setup(){const db=await testDatabase();globalThis.__scimentorTestEnv.DB=db;await act(mentor,{action:'create-group',name:'Mentor',title:'Science'});await act(other,{action:'create-group',name:'Other mentor',title:'Other space'});for(const u of [alice,bob]){const inv=await act(mentor,{action:'invite',name:u.userId,email:u.email});await act(u,{action:'join',name:u.userId,code:inv.code});}return db;}
const day=shiftDay(dateKey(Date.now()),7);
test('72-hour boundary, Edmonton DST, and week-specific slots',()=>{
 const now=100000;assert.equal(canBook(now+NOTICE_MS,now),true);assert.equal(canBook(now+NOTICE_MS-1,now),false);
 assert.equal(zonedTimestamp('2026-09-29','13:00'),Date.parse('2026-09-29T19:00:00Z'));
 assert.equal(zonedTimestamp('2026-12-29','13:00'),Date.parse('2026-12-29T20:00:00Z'));
 assert.throws(()=>zonedTimestamp('2027-03-14','02:30'),/daylight/);
 assert.throws(()=>zonedTimestamp('2026-02-30','13:00'),/time/);
 assert.equal(makeSlots(day,'13:00','15:00',30).length,4);
 assert.throws(()=>makeSlots(day,'13:00','14:10',30),/divide/);
});
test('bookings enforce privacy, location, role, notice, atomic conflicts, and cancellation',async()=>{
 await setup();await act(mentor,{action:'publish-slots',day,from:'13:00',to:'15:00',duration:30,format:'both'});
 const slots=(await state(alice)).slots;
 await assert.rejects(()=>act(alice,{action:'publish-slots',day,from:'16:00',to:'17:00',duration:30,format:'both'}),/Only your mentor/);
 await assert.rejects(()=>act(alice,{action:'book',slotId:slots[0].id,format:'in-person',location:'',agenda:'Planning'}),/location/);
 await act(alice,{action:'book',slotId:slots[0].id,format:'in-person',location:'Library entrance',agenda:'Private topic'});
 await assert.rejects(()=>act(bob,{action:'book',slotId:slots[0].id,format:'online',agenda:'Other question'}),/meeting_overlap|UNIQUE/);
 const meeting=(await state(alice)).meetings[0];assert.equal((await state(bob)).meetings.length,0);assert.equal((await state(other)).slots.length,0);
 assert.equal((await state(bob)).people.some(p=>p.user_id===alice.userId),false);
 assert.equal((await state(bob)).slots[0].taken,1);
 await assert.rejects(()=>act(bob,{action:'cancel',id:meeting.id}),/cannot/);
 await assert.rejects(()=>act(mentor,{action:'withdraw-slot',id:slots[0].id}),/booked/);
 await act(alice,{action:'cancel',id:meeting.id});await act(bob,{action:'book',slotId:slots[0].id,format:'online',agenda:'Planning'});
 const before=(await state(mentor)).slots.length;
 await assert.rejects(()=>act(mentor,{action:'publish-slots',day,from:'12:30',to:'13:30',duration:30,format:'online'}),/slot_overlap/);
 assert.equal((await state(mentor)).slots.length,before,'partial availability rolls back');
 const near=Date.now()+3600000;const db=globalThis.__scimentorTestEnv.DB;const group=(await state(mentor)).group.id;
 await db.prepare('INSERT INTO slots(id,group_id,start,end,format) VALUES (?,?,?,?,?)').bind('near',group,near,near+1800000,'online').run();
 await assert.rejects(()=>act(alice,{action:'book',slotId:'near',format:'online',agenda:'Too soon'}),/72 hours/);
 // Even direct concurrent writes must obey the database guard, independent of the API check.
 const choices=await Promise.allSettled([alice,bob].map(u=>act(u,{action:'book',slotId:slots[1].id,format:'online',agenda:'Race'})));
 assert.equal(choices.filter(x=>x.status==='fulfilled').length,1);
 await assert.rejects(()=>db.prepare("INSERT INTO meetings(id,group_id,slot_id,mentee_id,format,agenda,created_at) VALUES ('direct',?,'near',?,'online','too soon',?)").bind(group,alice.userId,Date.now()).run(),/booking_notice/);
});
test('rescheduling is atomic, private, and preserves booking rules', async()=>{
 const db=await setup();
 await act(mentor,{action:'publish-slots',day,from:'13:00',to:'16:00',duration:30,format:'both'});
 const slots=(await state(alice)).slots;
 await act(alice,{action:'book',slotId:slots[0].id,format:'online',agenda:'Original private topic'});
 await act(bob,{action:'book',slotId:slots[1].id,format:'online',agenda:'Bob topic'});
 const old=(await state(alice)).meetings[0];
 const move=(who,slotId,extra={})=>act(who,{action:'reschedule',id:old.id,slotId,format:'online',...extra});
 await act(mentor,{action:'meeting-link',id:old.id,link:'https://meet.google.com/old-link'});
 await assert.rejects(()=>move(bob,slots[2].id),/cannot be rescheduled/);
 await assert.rejects(()=>move(other,slots[2].id),/available slot/);
 await assert.rejects(()=>move(alice,slots[0].id),/cannot be rescheduled/);
 await assert.rejects(()=>move(alice,slots[1].id),/meeting_overlap|unique/i);
 assert.equal((await state(alice)).meetings[0].status,'confirmed','failed replacement keeps original');
 await assert.rejects(()=>move(alice,slots[2].id,{format:'in-person',location:''}),/location/);
 const group=(await state(mentor)).group.id,near=Date.now()+3600000;
 await db.prepare('INSERT INTO slots(id,group_id,start,end,format) VALUES (?,?,?,?,?)').bind('near-reschedule',group,near,near+1800000,'online').run();
 await assert.rejects(()=>move(alice,'near-reschedule'),/72 hours/);
 await act(mentor,{action:'withdraw-slot',id:slots[5].id});
 await assert.rejects(()=>move(alice,slots[5].id),/available slot/);
 await move(alice,slots[2].id,{format:'in-person',location:'Library room 2'});
 const changed=(await state(alice)).meetings;
 assert.equal(changed.find(m=>m.id===old.id).status,'cancelled');
 const current=changed.find(m=>m.status==='confirmed');
 assert.equal(current.slot_id,slots[2].id);assert.equal(current.agenda,old.agenda);
 assert.equal(current.location,'Library room 2');assert.equal(current.link,'');
 assert.equal((await state(alice)).slots.find(s=>s.id===slots[0].id).taken,0);
 assert.equal((await state(bob)).meetings.length,1,'other mentees cannot see rescheduling details');
 await assert.rejects(()=>move(alice,slots[3].id),/cannot be rescheduled/);
 const races=await Promise.allSettled([slots[3],slots[4]].map(s=>act(mentor,{action:'reschedule',id:current.id,slotId:s.id,format:'online'})));
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1,'only one replacement per original');
 assert.equal((await state(alice)).meetings.filter(m=>m.status==='confirmed').length,1);
});
test('meeting links can be edited only by the group mentor and stay private',async()=>{
 await setup();await act(mentor,{action:'publish-slots',day,from:'13:00',to:'14:00',duration:30,format:'online'});
 const slot=(await state(alice)).slots[0];
 await assert.rejects(()=>act(alice,{action:'book',slotId:slot.id,format:'in-person',location:'Library',agenda:'Test'}),/format/);
 await act(alice,{action:'book',slotId:slot.id,format:'online',agenda:'Link test'});
 const id=(await state(alice)).meetings[0].id;
 await assert.rejects(()=>act(alice,{action:'meeting-link',id,link:'https://example.com'}),/Only your mentor/);
 await assert.rejects(()=>act(other,{action:'meeting-link',id,link:'https://example.com'}),/not found/);
 await assert.rejects(()=>act(mentor,{action:'meeting-link',id,link:'javascript:alert(1)'}),/https/);
 for(const link of ['https://meet.google.com/first','https://meet.google.com/updated']) {
  await act(mentor,{action:'meeting-link',id,link});assert.equal((await state(alice)).meetings[0].link,link);
 }
 assert.equal((await state(bob)).meetings.length,0);
 await act(alice,{action:'cancel',id});
 await assert.rejects(()=>act(mentor,{action:'meeting-link',id,link:'https://example.com'}),/not found/);
});
test('messages and announcement replies are private; announcements queue individual emails',async()=>{
 await setup();await act(mentor,{action:'announce',title:'Welcome',body:'Hello everyone'});const a=(await state(alice)).announcements[0];
 await act(alice,{action:'message',body:'Private reply',announcementId:a.id,menteeId:bob.userId});
 assert.equal((await state(alice)).messages.length,1);assert.equal((await state(bob)).messages.length,0);assert.equal((await state(mentor)).messages[0].mentee_id,alice.userId);
 await act(mentor,{action:'message',menteeId:alice.userId,body:'Private response'});assert.equal((await state(alice)).messages.length,2);assert.equal((await state(bob)).messages.length,0);
 await assert.rejects(()=>act(other,{action:'message',menteeId:alice.userId,body:'Cross-group'}),/not found/);
 await assert.rejects(()=>act(alice,{action:'announce',title:'No',body:'No'}),/Only your mentor/);
 const db=globalThis.__scimentorTestEnv.DB;const jobs=await db.prepare('SELECT * FROM email_jobs').all();assert.equal(jobs.results.length,2);assert.equal(jobs.results.every(j=>j.status==='pending'),true);
 assert.equal((await state(alice)).emailPending,0);assert.equal((await state(mentor)).emailPending,2);assert.equal((await state(other)).announcements.length,0);
});
test('unread messages can only be acknowledged by their recipient and known IDs',async()=>{
 const db=await setup();
 await act(alice,{action:'message',body:'First question'});
 await act(bob,{action:'message',body:'Bob question'});
 let mentorState=await state(mentor);
 const first=mentorState.messages.find(m=>m.sender_id===alice.userId);
 const bobMessage=mentorState.messages.find(m=>m.sender_id===bob.userId);
 assert.equal(dashboardSummary(mentorState).unread.length,2);
 assert.equal(dashboardSummary(await state(alice)).unread.length,0,'own messages are never unread');
 await act(alice,{action:'read-messages',ids:[first.id,bobMessage.id]});
 await act(other,{action:'read-messages',ids:[first.id,bobMessage.id]});
 assert.equal(dashboardSummary(await state(mentor)).unread.length,2,'sender and another group cannot acknowledge');
 await act(alice,{action:'message',body:'Arrived after the page loaded'});
 await act(mentor,{action:'read-messages',ids:[first.id]});
 mentorState=await state(mentor);
 assert.equal(dashboardSummary(mentorState).unread.length,2,'new arrivals and other conversations stay unread');
 const readAt=mentorState.messages.find(m=>m.id===first.id).read_at;
 assert.ok(readAt);
 await act(mentor,{action:'read-messages',ids:[first.id]});
 assert.equal((await state(mentor)).messages.find(m=>m.id===first.id).read_at,readAt);
 await act(mentor,{action:'message',menteeId:alice.userId,body:'Private answer'});
 const aliceState=await state(alice),answer=aliceState.messages.find(m=>m.sender_id===mentor.userId);
 assert.equal(dashboardSummary(aliceState).unread.length,1);
 assert.equal(dashboardSummary(aliceState).mentees.length,0);
 assert.equal((await state(bob)).messages.some(m=>m.id===answer.id),false);
 await act(bob,{action:'read-messages',ids:[answer.id]});
 assert.equal(dashboardSummary(await state(alice)).unread.length,1);
 await act(alice,{action:'read-messages',ids:[answer.id]});
 assert.equal(dashboardSummary(await state(alice)).unread.length,0);
 await assert.rejects(()=>act(mentor,{action:'read-messages',ids:[]}),/between 1 and 100/);
 await assert.rejects(()=>act(mentor,{action:'read-messages',ids:Array(101).fill(first.id)}),/between 1 and 100/);
 // Add a meeting and verify the dashboard identifies the missing link.
 await act(mentor,{action:'publish-slots',day,from:'13:00',to:'14:00',duration:30,format:'online'});
 await act(alice,{action:'book',slotId:(await state(alice)).slots[0].id,format:'online',agenda:'Dashboard'});
 let summary=dashboardSummary(await state(mentor));
 assert.equal(summary.missingLinks.length,1);
 assert.equal(summary.mentees.find(m=>m.person.user_id===alice.userId).nextMeeting.agenda,'Dashboard');
 assert.equal(summary.mentees.find(m=>m.person.user_id===alice.userId).lastMessage.body,'Arrived after the page loaded');
 await act(mentor,{action:'meeting-link',id:summary.missingLinks[0].id,link:'https://meet.google.com/ready'});
 assert.equal(dashboardSummary(await state(mentor)).missingLinks.length,0);
});
test('invite codes are email-bound, revocable, single-use, and never grant mentor access',async()=>{
 await setup();const invite=await act(mentor,{action:'invite',name:'Outside',email:outsider.email});
 await assert.rejects(()=>act(user('wrong'),{action:'join',name:'Wrong',code:invite.code}),/invalid/);
 await act(outsider,{action:'join',name:'Outside',code:invite.code});assert.equal((await state(outsider)).member.role,'mentee');
 await assert.rejects(()=>act({...outsider,userId:'replay'},{action:'join',name:'Again',code:invite.code}),/invalid/);
 const second=await act(mentor,{action:'invite',name:'Revoked',email:'revoked@example.test'});const pending=(await state(mentor)).invites.find(i=>i.email==='revoked@example.test');
 await act(mentor,{action:'revoke-invite',hash:pending.hash});await assert.rejects(()=>act(user('revoked'),{action:'join',name:'Revoked',code:second.code}),/invalid/);
});
test('mentors suspend and restore only their mentees while retaining history',async()=>{
 const db=await setup();
 await act(mentor,{action:'publish-slots',day,from:'13:00',to:'15:00',duration:30,format:'online'});
 const before=await state(alice),slots=before.slots,group=before.member.group_id;
 await act(alice,{action:'book',slotId:slots[0].id,format:'online',agenda:'Alice future'});
 await act(bob,{action:'book',slotId:slots[1].id,format:'online',agenda:'Bob future'});
 await act(alice,{action:'message',body:'Preserved question'});
 await act(mentor,{action:'announce',title:'Before suspension',body:'Queued emails'});
 const invite=await act(mentor,{action:'invite',email:alice.email,name:'Duplicate invite'});
 const original=(await state(alice)).meetings[0];
 for(const who of [alice,bob]) await assert.rejects(()=>act(who,{action:'suspend-member',id:alice.userId}),/Only your mentor/);
 await assert.rejects(()=>act(other,{action:'suspend-member',id:alice.userId}),/not found/);
 await assert.rejects(()=>act(mentor,{action:'suspend-member',id:mentor.userId}),/not found/);
 await act(mentor,{action:'suspend-member',id:alice.userId});
 const blocked=await state(alice);
 assert.ok(blocked.member.suspended_at);assert.equal(blocked.group,undefined);
 for(const key of ['people','slots','meetings','messages','announcements','resources','invites']) assert.deepEqual(blocked[key],[]);
 for(const input of [
  {action:'message',body:'Blocked'}, {action:'book',slotId:slots[2].id,format:'online',agenda:'Blocked'},
  {action:'cancel',id:original.id}, {action:'reschedule',id:original.id,slotId:slots[2].id,format:'online'},
  {action:'read-messages',ids:['unknown']}, {action:'restore-member',id:alice.userId},
  {action:'join',code:invite.code,name:'Bypass'}, {action:'create-group',name:'Bypass',title:'Bypass'}
 ]) await assert.rejects(()=>act(alice,input),/suspended/);
 let mentorState=await state(mentor);
 assert.equal(mentorState.meetings.find(m=>m.id===original.id).status,'cancelled');
 assert.equal(mentorState.messages.some(m=>m.body==='Preserved question'),true);
 assert.equal((await state(bob)).meetings[0].status,'confirmed');
 assert.equal((await state(bob)).slots.find(s=>s.id===slots[0].id).taken,0);
 assert.equal(mentorState.invites.find(i=>i.email===alice.email && !i.used_by).revoked,1);
 const jobs=(await db.prepare('SELECT recipient,status FROM email_jobs').all()).results;
 assert.equal(jobs.find(j=>j.recipient===alice.email).status,'cancelled');
 assert.equal(jobs.find(j=>j.recipient===bob.email).status,'pending');
 await act(mentor,{action:'announce',title:'During suspension',body:'Active mentees only'});
 assert.equal((await db.prepare('SELECT * FROM email_jobs WHERE recipient=?').bind(alice.email).all()).results.length,1);
 await assert.rejects(()=>act(mentor,{action:'invite',email:alice.email,name:'Bypass'}),/Restore their access/);
 await assert.rejects(()=>act(mentor,{action:'message',menteeId:alice.userId,body:'Blocked'}),/not found/);
 // Database guards also reject writes that raced with suspension after API authorization.
 await assert.rejects(()=>db.prepare("INSERT INTO meetings(id,group_id,slot_id,mentee_id,format,agenda,created_at) VALUES ('raced-booking',?,?,?,'online','Race',?)").bind(group,slots[2].id,alice.userId,Date.now()).run(),/member_suspended/);
 await assert.rejects(()=>db.prepare("INSERT INTO messages(id,group_id,mentee_id,sender_id,body,created_at) VALUES ('raced-message',?,?,?,'Race',?)").bind(group,alice.userId,alice.userId,Date.now()).run(),/member_suspended/);
 await assert.rejects(()=>act(other,{action:'restore-member',id:alice.userId}),/not found/);
 await act(mentor,{action:'restore-member',id:alice.userId});
 const restored=await state(alice);
 assert.equal(restored.member.suspended_at,null);
 assert.equal(restored.messages[0].body,'Preserved question');
 assert.equal(restored.meetings[0].status,'cancelled','restoration never resurrects cancelled meetings');
 await act(alice,{action:'book',slotId:slots[0].id,format:'online',agenda:'New booking'});
 await act(alice,{action:'message',body:'Back again'});
 assert.equal((await state(alice)).meetings.filter(m=>m.status==='confirmed').length,1);
});
test('resources require mentor ownership and safe URLs',async()=>{
 await setup();await act(mentor,{action:'resource',kind:'faq',title:'Where do we meet?',body:'Choose an available slot and enter a location.',category:'Meetings'});
 assert.equal((await state(alice)).resources.length,1);assert.equal((await state(other)).resources.length,0);
 await assert.rejects(()=>act(mentor,{action:'resource',kind:'resource',title:'Bad link',body:'Bad',category:'General',url:'javascript:alert(1)'}),/https/);
 await assert.rejects(async()=>act(alice,{action:'delete-resource',id:(await state(alice)).resources[0].id}),/Only your mentor/);
});

test('private database schema denies access without explicit grants', async()=>{
 await setup(); await pg.exec('CREATE ROLE scimentor_unauthorized; SET ROLE scimentor_unauthorized;');
 try { await assert.rejects(()=>pg.query('SELECT * FROM scimentor.messages'),/permission denied/); } finally { await pg.exec('RESET ROLE'); await pg.close(); pg=null; }
});

test("anonymous requests cannot obtain a portal identity",async()=>{
 globalThis.__scimentorTestUser=null;await assert.rejects(()=>identity(),/Sign in/);
 globalThis.__scimentorTestUser=user("verified");assert.equal((await identity()).userId,"verified");
 globalThis.__scimentorTestUser=null;
});
