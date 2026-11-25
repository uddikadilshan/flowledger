import {client} from "./supabase";
export type Preferences={upcoming:boolean;overdue:boolean;targets:boolean;lead_days:number};
export type Notification={id:string;kind:"upcoming"|"overdue"|"target"|"funding"|"funded";title:string;detail:string;amount_minor:number|string;alert_date:string;created_at:string;read_at:string|null;dismissed_at:string|null};
export const defaults:Preferences={upcoming:true,overdue:true,targets:true,lead_days:3};
export async function notificationInbox(bid:string,uid:string){
 const rows:Notification[]=[];
 for(let offset=0;;offset+=500){
 const {data,error}=await client().from("notifications").select("id,kind,title,detail,amount_minor,alert_date,created_at,read_at,dismissed_at").eq("business_id",bid).eq("user_id",uid).is("dismissed_at",null).order("created_at",{ascending:false}).order("id").range(offset,offset+499);
 if(error)throw error;rows.push(...(data??[]) as Notification[]);if(!data||data.length<500)return rows;
 }
}
export async function notificationCount(bid:string,uid:string){const {count,error}=await client().from("notifications").select("id",{count:"exact",head:true}).eq("business_id",bid).eq("user_id",uid).is("read_at",null).is("dismissed_at",null);if(error)throw error;return count??0;}
export async function refreshNotifications(bid:string){const {error}=await client().rpc("refresh_notifications",{bid});if(error)throw error;}
export async function notificationPreferences(bid:string,uid:string):Promise<Preferences>{const {data,error}=await client().from("notification_preferences").select("upcoming,overdue,targets,lead_days").eq("business_id",bid).eq("user_id",uid).maybeSingle();if(error)throw error;return data??defaults;}
export async function savePreferences(bid:string,uid:string,p:Preferences){const {error}=await client().from("notification_preferences").upsert({...p,business_id:bid,user_id:uid});if(error)throw error;}
export async function changeNotification(bid:string,uid:string,id:string,action:"read"|"unread"|"dismiss"){const {error}=await client().from("notifications").update(action==="dismiss"?{dismissed_at:new Date().toISOString()}:{read_at:action==="read"?new Date().toISOString():null}).eq("business_id",bid).eq("user_id",uid).eq("id",id);if(error)throw error;}
export async function markAllRead(bid:string,uid:string){const {error}=await client().from("notifications").update({read_at:new Date().toISOString()}).eq("business_id",bid).eq("user_id",uid).is("read_at",null).is("dismissed_at",null);if(error)throw error;}
