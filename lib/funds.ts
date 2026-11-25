import {z} from "zod";
import {client} from "./supabase";
import {toMinor} from "./expenses";
export const fundSchema=z.object({
 kind:z.enum(["collection","external"]),
 amount:z.string().regex(/^\d{1,12}(\.\d{1,2})?$/,"Enter an amount with up to two decimals.").refine(v=>/^\d+(\.\d{1,2})?$/.test(v)&&toMinor(v)>0n,"Amount must be positive."),
 received_on:z.iso.date(),
 note:z.string().trim().max(500)
});
export type FundInput=z.infer<typeof fundSchema>;
export type FundEntry={id:string;kind:"collection"|"external";amount_minor:number;received_on:string;note:string;version:number;reversed_at:string|null};
export type FundHistory={id:number;action:string;reason:string;created_at:string;before_record:unknown;after_record:unknown};
export type Totals={collection:bigint;external:bigint};
export function sumFunds(rows:FundEntry[]):Totals {
 return rows.reduce((s,r)=>{if(!r.reversed_at)s[r.kind]+=BigInt(r.amount_minor);return s;},{collection:0n,external:0n});
}
export function availableFunds(opening:string|number,totals:Totals){return toMinor(String(opening))+totals.collection+totals.external;}
export async function fundEntries(bid:string,from:string,to:string,reversed:boolean):Promise<FundEntry[]>{
 let q=client().from("fund_entries").select("id,kind,amount_minor,received_on,note,version,reversed_at").eq("business_id",bid).gte("received_on",from).lte("received_on",to).order("received_on",{ascending:false}).order("id");
 q=reversed?q.not("reversed_at","is",null):q.is("reversed_at",null);
 const rows:FundEntry[]=[];
 for(let offset=0;;offset+=500){const {data,error}=await q.range(offset,offset+499);if(error)throw error;rows.push(...(data??[]) as FundEntry[]);if(!data||data.length<500)return rows;}
}
export async function fundTotals(bid:string,from:string,to:string):Promise<Totals>{
 const {data,error}=await client().rpc("fund_totals",{bid,from_date:from,to_date:to});
 if(error)throw error;
 return {collection:BigInt(data.collection),external:BigInt(data.external)};
}
export async function fundHistory(bid:string,id:string):Promise<FundHistory[]>{
 const rows:FundHistory[]=[];
 for(let offset=0;;offset+=500){const {data,error}=await client().from("fund_history").select("id,action,reason,created_at,before_record,after_record").eq("business_id",bid).eq("entry_id",id).order("id",{ascending:false}).range(offset,offset+499);if(error)throw error;rows.push(...(data??[]) as FundHistory[]);if(!data||data.length<500)return rows;}
}
export async function fundCommand(action:string,payload:Record<string,unknown>){
 const {data,error}=await client().rpc("fund_command",{action,payload});if(error)throw error;return data;
}
export function monthBounds(month:string){
 const [y,m]=month.split("-").map(Number);
 return {from:month+"-01",to:month+"-"+String(new Date(Date.UTC(y,m,0)).getUTCDate()).padStart(2,"0")};
}
