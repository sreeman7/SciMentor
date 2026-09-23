import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { createDatabase } from '../db/query.ts';
import { readFileSync } from 'node:fs';
import { build } from 'esbuild';
import { canBook, NOTICE_MS, makeSlots, zonedTimestamp, dateKey, shiftDay } from '../lib/rules.ts';
const sql=readFileSync(new URL('../supabase/migrations/001_initial.sql',import.meta.url),'utf8');
let pg;
async function testDatabase() {
 if(pg) await pg.close();
 pg=new PGlite();await pg.exec(sql);
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
test('invite codes are email-bound, revocable, single-use, and never grant mentor access',async()=>{
 await setup();const invite=await act(mentor,{action:'invite',name:'Outside',email:outsider.email});
 await assert.rejects(()=>act(user('wrong'),{action:'join',name:'Wrong',code:invite.code}),/invalid/);
 await act(outsider,{action:'join',name:'Outside',code:invite.code});assert.equal((await state(outsider)).member.role,'mentee');
 await assert.rejects(()=>act({...outsider,userId:'replay'},{action:'join',name:'Again',code:invite.code}),/invalid/);
 const second=await act(mentor,{action:'invite',name:'Revoked',email:'revoked@example.test'});const pending=(await state(mentor)).invites.find(i=>i.email==='revoked@example.test');
 await act(mentor,{action:'revoke-invite',hash:pending.hash});await assert.rejects(()=>act(user('revoked'),{action:'join',name:'Revoked',code:second.code}),/invalid/);
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
