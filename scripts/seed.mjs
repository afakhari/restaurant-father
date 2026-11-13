import crypto from 'node:crypto';
import {promisify} from 'node:util';
import pg from 'pg';
const scrypt=promisify(crypto.scrypt);
const url=process.env.ADMIN_DATABASE_URL;
if(process.env.SEED_DEMO!=='true'){console.log(JSON.stringify({event:'seed_skipped',reason:'SEED_DEMO is not true'}));process.exit(0);}
if(!url||!process.env.DEMO_PASSWORD)throw Error('ADMIN_DATABASE_URL and DEMO_PASSWORD required');
const pool=new pg.Pool({connectionString:url});
async function passwordHash(p){const salt=crypto.randomBytes(16).toString('hex'),key=await scrypt(p,salt,64);return `scrypt:${salt}:${key.toString('hex')}`;}
const id=()=>crypto.randomUUID();
async function put(c,sql,values){return (await c.query(sql,values)).rows[0];}
async function user(c,email,name,role,restaurantId,hash){const uid=id();await c.query('INSERT INTO users(id,email,full_name,password_hash) VALUES($1,$2,$3,$4)',[uid,email,name,hash]);await c.query('INSERT INTO staff_memberships(restaurant_id,user_id,role) VALUES($1,$2,$3)',[restaurantId,uid,role]);return uid;}
async function item(c,rest,category,name,price,description,sort){return put(c,'INSERT INTO menu_items(restaurant_id,category,name,price_toman,description,sort_order) VALUES($1,$2,$3,$4,$5,$6) RETURNING id',[rest,category,name,price,description,sort]);}
async function addDemoRound(c,restaurantId,sessionId,actor,items){const r=await put(c,'INSERT INTO order_rounds(restaurant_id,session_id,created_by,idempotency_key) VALUES($1,$2,$3,$4) RETURNING id',[restaurantId,sessionId,actor,id()]);for(const x of items){await c.query('INSERT INTO order_items(restaurant_id,round_id,menu_item_id,name_snapshot,quantity,unit_price_toman,note,status,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,now())',[restaurantId,r.id,x.i.id,x.name,x.qty,x.price,x.note??'',x.status]);}return r;}
const c=await pool.connect();
try{
 await c.query('BEGIN');
 const existing=await c.query('SELECT 1 FROM restaurants LIMIT 1');
 if(existing.rowCount){await c.query('COMMIT');console.log(JSON.stringify({event:'seed_skipped',reason:'restaurants already exist'}));process.exitCode=0;}
 else {
 const pw=await passwordHash(process.env.DEMO_PASSWORD);
 const naranj=(await put(c,"INSERT INTO restaurants(name,slug) VALUES('کافه و رستوران نارنج','narenj') RETURNING id")).id;
 const darband=(await put(c,"INSERT INTO restaurants(name,slug) VALUES('رستوران دربند','darband') RETURNING id")).id;
 const branchA=(await put(c,'INSERT INTO branches(restaurant_id,name,address) VALUES($1,$2,$3) RETURNING id',[naranj,'شعبه مرکزی','تهران، خیابان کریم‌خان'])).id;
 const branchB=(await put(c,'INSERT INTO branches(restaurant_id,name,address) VALUES($1,$2,$3) RETURNING id',[naranj,'شعبه جمهوری','تهران، خیابان جمهوری'])).id;
 const branchD=(await put(c,'INSERT INTO branches(restaurant_id,name,address) VALUES($1,$2,$3) RETURNING id',[darband,'شعبه تجریش','تهران، میدان تجریش'])).id;
 const waiter=await user(c,'waiter@narenj.demo','مریم رضایی','waiter',naranj,pw);
 const kitchen=await user(c,'kitchen@narenj.demo','حسین محمدی','kitchen',naranj,pw);
 await user(c,'cashier@narenj.demo','نرگس کریمی','cashier',naranj,pw);
 await user(c,'manager@narenj.demo','آرش توکلی','manager',naranj,pw);
 const other=await user(c,'manager@darband.demo','سارا قنبری','manager',darband,pw);
 const tables={};for(let n=1;n<=8;n++){const row=await put(c,'INSERT INTO dining_tables(restaurant_id,branch_id,number,seats) VALUES($1,$2,$3,$4) RETURNING id',[naranj,branchA,n,n===8?6:4]);tables[n]=row.id;}
 for(let n=1;n<=5;n++)await c.query('INSERT INTO dining_tables(restaurant_id,branch_id,number,seats) VALUES($1,$2,$3,4)',[naranj,branchB,n]);
 const dTables=[];for(let n=1;n<=4;n++){const row=await put(c,'INSERT INTO dining_tables(restaurant_id,branch_id,number,seats) VALUES($1,$2,$3,4) RETURNING id',[darband,branchD,n]);dTables.push(row.id);}
 const menu=[
 ['غذای ایرانی','چلوکباب کوبیده',345000,'دو سیخ کباب با برنج ایرانی'],
 ['غذای ایرانی','زرشک پلو با مرغ',298000,'مرغ زعفرانی و زرشک'],
 ['غذای ایرانی','ته‌چین مرغ',275000,'ته‌چین برشته با ماست چکیده'],
 ['غذای ایرانی','میرزاقاسمی',165000,'بادمجان دودی و تخم‌مرغ'],
 ['غذای ایرانی','سوپ روز',90000,'پیش‌غذای گرم روز'],
 ['نوشیدنی','دوغ محلی',55000,'دوغ بدون گاز'],
 ['نوشیدنی','آب معدنی',22000,'بطری ۵۰۰ میلی‌لیتری'],
 ['نوشیدنی','لیموناد',98000,'لیمو تازه و نعنا'],
 ['کافه','لاته',125000,'اسپرسو با شیر گرم'],
 ['کافه','اسپرسو',85000,'یک شات قهوه'],
 ['کافه','چای زعفرانی',68000,'چای دم‌کرده با زعفران'],
 ['دسر','چیزکیک',148000,'برش کیک پنیری']
 ];
 const ids={};for(let j=0;j<menu.length;j++){const [cat,name,price,desc]=menu[j];const row=await item(c,naranj,cat,name,price,desc,j);ids[name]={id:row.id,price,name};}
 const dMenu=[['غذای ایرانی','کباب برگ',635000],['غذای ایرانی','جوجه زعفرانی',315000],['نوشیدنی','دوغ سبزی',65000],['نوشیدنی','چای سیاه',44000]];
 let dfirst;for(let j=0;j<dMenu.length;j++){const [cat,name,price]=dMenu[j];const row=await item(c,darband,cat,name,price,'تهیه‌شده در آشپزخانه دربند',j);if(j===0)dfirst={id:row.id,name,price};}
 const sess=(table)=>put(c,'INSERT INTO table_sessions(restaurant_id,branch_id,table_id,opened_by) VALUES($1,$2,$3,$4) RETURNING id',[naranj,branchA,table,waiter]);
 const s3=(await sess(tables[3])).id;
 await addDemoRound(c,naranj,s3,waiter,[{i:ids['چلوکباب کوبیده'],...ids['چلوکباب کوبیده'],qty:2,note:'یکی بدون پیاز',status:'served'},{i:ids['دوغ محلی'],...ids['دوغ محلی'],qty:2,status:'ready'}]);
 await addDemoRound(c,naranj,s3,waiter,[{i:ids['چیزکیک'],...ids['چیزکیک'],qty:1,status:'queued'}]);
 const s5=(await sess(tables[5])).id;await addDemoRound(c,naranj,s5,waiter,[{i:ids['زرشک پلو با مرغ'],...ids['زرشک پلو با مرغ'],qty:2,status:'preparing'},{i:ids['آب معدنی'],...ids['آب معدنی'],qty:2,status:'ready'}]);
 const s6=(await sess(tables[6])).id;await addDemoRound(c,naranj,s6,waiter,[{i:ids['لاته'],...ids['لاته'],qty:2,note:'یکی با شیر کم‌چرب',status:'queued'}]);
 const s2=(await sess(tables[2])).id;await addDemoRound(c,naranj,s2,waiter,[{i:ids['ته‌چین مرغ'],...ids['ته‌چین مرغ'],qty:2,status:'served'},{i:ids['چای زعفرانی'],...ids['چای زعفرانی'],qty:2,status:'served'}]);
 await c.query("UPDATE table_sessions SET discount_toman=20000,paid_amount_toman=666000,payment_method='pos',paid_at=now()- interval '20 minutes',closed_at=now()- interval '20 minutes',opened_at=now()- interval '1 hour' WHERE id=$1",[s2]);
 await c.query("INSERT INTO order_events(restaurant_id,session_id,actor_id,event_type,payload,created_at) VALUES($1,$2,$3,'session.checked_out',$4,now()- interval '20 minutes')",[naranj,s2,waiter,JSON.stringify({total:666000,method:'pos',demo:true})]);
 for(const idS of [s3,s5,s6])await c.query("INSERT INTO order_events(restaurant_id,session_id,actor_id,event_type,payload) VALUES($1,$2,$3,'round.created',$4)",[naranj,idS,waiter,JSON.stringify({demo:true})]);
 const sd=(await put(c,'INSERT INTO table_sessions(restaurant_id,branch_id,table_id,opened_by) VALUES($1,$2,$3,$4) RETURNING id',[darband,branchD,dTables[0],other])).id;
 await addDemoRound(c,darband,sd,other,[{i:dfirst,name:dfirst.name,price:dfirst.price,qty:1,status:'queued'}]);
 await c.query('COMMIT');console.log(JSON.stringify({event:'demo_seed_complete',restaurantCount:2,demoAccounts:5}));
 }
}catch(err){await c.query('ROLLBACK');console.error(err);process.exitCode=1;}
finally{c.release();await pool.end();}
