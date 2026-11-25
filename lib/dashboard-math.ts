// Exact dashboard aggregation; chart ratios alone use floating point.
export type FlowEntry={kind:"collection"|"external";amount_minor:number;received_on:string;reversed_at:string|null};
export type PaymentEntry={business_minor:number;external_minor:number;paid_on:string;reversed_at:string|null};
export type Flow={collection:bigint;external:bigint;payments:bigint;net:bigint};
export function aggregateFlow(funds:FlowEntry[],payments:PaymentEntry[],from:string,to:string):Flow{
 let collection=0n,external=0n,paid=0n;
 for(const f of funds)if(!f.reversed_at&&f.received_on>=from&&f.received_on<=to){if(f.kind==="collection")collection+=BigInt(f.amount_minor);else external+=BigInt(f.amount_minor);}
 for(const p of payments)if(!p.reversed_at&&p.paid_on>=from&&p.paid_on<=to)paid+=BigInt(p.business_minor)+BigInt(p.external_minor);
 return {collection,external,payments:paid,net:collection+external-paid};
}
export function changePercent(current:bigint,previous:bigint):string{
 if(previous===0n)return current===0n?"0.0%":"New activity";
 const delta=(current-previous)*1000n/previous;
 return (delta<0n?"−":delta>0n?"+":"")+String((delta<0n?-delta:delta)/10n)+"."+String((delta<0n?-delta:delta)%10n)+"%";
}
export function ratio(value:bigint,total:bigint){return total>0n?Number(value*10000n/total)/100:0;}
export function signedMoney(value:bigint,currency:string){const n=value<0n?-value:value;return (value<0n?"−":"")+currency+" "+(n/100n).toLocaleString("en-US")+"."+String(n%100n).padStart(2,"0");}
export function monthShift(month:string,offset:number){const [y,m]=month.split("-").map(Number);return new Date(Date.UTC(y,m-1+offset,1)).toISOString().slice(0,7);}
export function monthRange(month:string){const next=monthShift(month,1);const d=new Date(next+"-01T00:00:00Z");d.setUTCDate(d.getUTCDate()-1);return {from:month+"-01",to:d.toISOString().slice(0,10)};}
export function comparableRange(month:string,today:string){const range=monthRange(month),previous=monthRange(monthShift(month,-1));if(month===today.slice(0,7)){range.to=today;previous.to=previous.from.slice(0,8)+String(Math.min(Number(today.slice(8)),Number(previous.to.slice(8)))).padStart(2,"0");}return {range,previous};}
export function expenseBreakdown(expenses:{category_id:string;amount_minor:number;deleted_at:string|null}[],categories:{id:string;name:string}[]){
 const totals=new Map<string,bigint>();for(const e of expenses)if(!e.deleted_at)totals.set(e.category_id,(totals.get(e.category_id)??0n)+BigInt(e.amount_minor));
 const names=new Map(categories.map(c=>[c.id,c.name]));
 return [...totals].map(([id,amount])=>({id,label:names.get(id)??"Uncategorized",amount})).sort((a,b)=>a.amount>b.amount?-1:a.amount<b.amount?1:a.label.localeCompare(b.label));
}
