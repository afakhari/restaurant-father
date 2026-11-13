import crypto from 'node:crypto';
import {promisify} from 'node:util';
import {pool} from './db.mjs';
import {HttpError} from './core.mjs';
const scrypt=promisify(crypto.scrypt);
export async function hashPassword(password,salt=crypto.randomBytes(16).toString('hex')){
 const key=await scrypt(password,salt,64);return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function checkPassword(password,stored){
 const [alg,salt,hex]=String(stored).split(':');
 if(alg!=='scrypt'||!salt||!hex||hex.length!==128)return false;
 const ours=await scrypt(password,salt,64);return crypto.timingSafeEqual(ours,Buffer.from(hex,'hex'));
}
export const tokenDigest=token=>crypto.createHash('sha256').update(token).digest('hex');
export function getCookie(req,key){const all=(req.headers.cookie??'').split(';').map(x=>x.trim());const found=all.find(x=>x.startsWith(`${key}=`));return found?.slice(key.length+1)??null;}
export function cookie(name,value,{clear=false}={}){
 const secure=process.env.COOKIE_SECURE==='true'||(process.env.COOKIE_SECURE!=='false'&&process.env.NODE_ENV==='production');
 return `${name}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${clear?0:43200}${secure?'; Secure':''}`;
}
export async function login(email,password){
 if(typeof email!=='string'||email.length>160||typeof password!=='string'||password.length>256)throw new HttpError(401,'AUTH','ایمیل یا رمز عبور نادرست است.');
 const r=await pool.query(`SELECT u.id,u.email,u.full_name,u.password_hash,m.restaurant_id,m.role FROM users u JOIN staff_memberships m ON m.user_id=u.id WHERE u.email=$1 AND u.active AND m.active LIMIT 1`,[email.toLowerCase().trim()]);
 if(!r.rowCount||!(await checkPassword(password,r.rows[0].password_hash)))throw new HttpError(401,'AUTH','ایمیل یا رمز عبور نادرست است.');
 const u=r.rows[0],token=crypto.randomBytes(32).toString('base64url');
 await pool.query("INSERT INTO auth_sessions(token_hash,user_id,restaurant_id,expires_at) VALUES($1,$2,$3,now()+ interval '12 hours')",[tokenDigest(token),u.id,u.restaurant_id]);
 return {token,user:{id:u.id,name:u.full_name,role:u.role,restaurantId:u.restaurant_id}};
}
export async function authenticate(req){
 const token=getCookie(req,'shiftyar_session');if(!token)return null;
 const r=await pool.query(`SELECT u.id,u.full_name,m.role,m.restaurant_id FROM auth_sessions s JOIN users u ON u.id=s.user_id JOIN staff_memberships m ON m.user_id=s.user_id AND m.restaurant_id=s.restaurant_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active AND m.active`,[tokenDigest(token)]);
 if(!r.rowCount)return null;
 const u=r.rows[0];return {id:u.id,name:u.full_name,role:u.role,restaurantId:u.restaurant_id};
}
export async function logout(req){const token=getCookie(req,'shiftyar_session');if(token)await pool.query('DELETE FROM auth_sessions WHERE token_hash=$1',[tokenDigest(token)]);}
