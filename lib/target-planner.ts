// Pure deadline-aware planning in integer minor units. No persisted targets.
export type Obligation={id:string;kind:"expense"|"loan";label:string;due_date:string;amount_minor:string;paid_minor:string};
export type Deadline={date:string;outstanding:bigint;cumulative:bigint;shortfall:bigint;workdays:number;rate:bigint;urgent:boolean};
const max=(a:bigint,b:bigint)=>a>b?a:b;
export function nextDay(day:string){const d=new Date(day+"T00:00:00Z");d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
export function isWorkingDay(day:string,days:number[]){return days.includes(new Date(day+"T00:00:00Z").getUTCDay());}
export function ceilDivide(n:bigint,d:number){if(d<=0)throw Error("No working days");return (n+BigInt(d)-1n)/BigInt(d);}
export function planTargets(input:{today:string;end:string;days:number[];business:bigint;external:bigint;obligations:Obligation[]}){
 const {today,end,days,business,external}=input;
 if(end<today||!days.length||days.some(d=>!Number.isInteger(d)||d<0||d>6))throw Error("Invalid planning period or working days.");
 if(business<0n||external<0n)throw Error("Negative available funds require reconciliation.");
 const cash=business+external, grouped=new Map<string,bigint>();
 let overdue=0n,expenses=0n,loans=0n;
 for(const t of input.obligations){
  if(t.due_date>end)continue;
  const left=BigInt(t.amount_minor)-BigInt(t.paid_minor);
  if(left<0n)throw Error("Payment exceeds obligation.");
  if(left===0n)continue;
  if(t.kind==="expense")expenses+=left;else loans+=left;
  if(t.due_date<today)overdue+=left;
  const date=t.due_date<today?today:t.due_date;
  grouped.set(date,(grouped.get(date)??0n)+left);
 }
 const dates=[...grouped.keys()].sort(), deadlines:Deadline[]=[];
 let cursor=today,workdays=0,cumulative=0n,rate=0n,urgent=0n;
 for(const date of dates){
  while(cursor<=date){if(isWorkingDay(cursor,days))workdays++;cursor=nextDay(cursor);}
  const outstanding=grouped.get(date)!;cumulative+=outstanding;
  const shortfall=max(0n,cumulative-cash);
  const immediate=workdays===0&&shortfall>0n;
  const daily=workdays?ceilDivide(shortfall,workdays):0n;
  if(immediate)urgent=max(urgent,shortfall);
  rate=max(rate,daily);
  deadlines.push({date,outstanding,cumulative,shortfall,workdays,rate:daily,urgent:immediate});
 }
 const workingToday=isWorkingDay(today,days);
 // On non-working days, show the next working day's rate separately from emergency cash.
 const targetToday=workingToday?rate:0n;
 const critical=deadlines.find(d=>d.rate===rate&&rate>0n)?.date??null;
 return {cash,expenses,loans,overdue,required:max(0n,cumulative-cash),deadlines,rate,targetToday,urgent,workingToday,critical};
}
