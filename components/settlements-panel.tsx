"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {type Business,localDate} from "@/lib/domain";
import {formatMinor,decimalAmount} from "@/lib/expenses";
import {monthBounds} from "@/lib/funds";
import {settlementBalance,targetsFor,settlementsFor,settlementCommand,remaining,paymentStatus,parseAllocation,type Target,type Settlement} from "@/lib/settlements";
import {readableError} from "@/lib/supabase";
import {Button,Notice} from "./ui";
export function SettlementsPanel({business,owner}:{business:Business;owner:boolean}){
 const today=localDate(business.timezone),canWrite=owner&&!business.archived_at;
 const [month,setMonth]=useState(today.slice(0,7)),[allDue,setAllDue]=useState(false);
 const [data,setData]=useState<{targets:Target[];payments:Settlement[];balance:{business:bigint;external:bigint}}|null>(null);
 const [error,setError]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
 const [target,setTarget]=useState<Target|null>(null),[bm,setBm]=useState("0"),[em,setEm]=useState("0"),[date,setDate]=useState(today),[note,setNote]=useState("");
 const lock=useRef(false),generation=useRef(0),request=useRef("");
 const fmt=(v:bigint)=>formatMinor(v,business.currency);
 async function reload(){
  const n=++generation.current;setData(null);const {from,to}=monthBounds(month);
  const [targets,payments,balance]=await Promise.all([targetsFor(business.id,allDue?"2000-01-01":from,allDue?"2100-12-31":to),settlementsFor(business.id,from,to),settlementBalance(business.id,today)]);
  if(n===generation.current)setData({targets,payments,balance});
 }
 useEffect(()=>{setTarget(null);setError("");reload().catch(e=>setError(readableError(e)));return()=>{generation.current++;};},[business.id,month,allDue]);
 async function run(fn:()=>Promise<void>){if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");try{if(!navigator.onLine)throw Error("offline");await fn();}catch(e){setError(readableError(e));}finally{lock.current=false;setBusy(false);}}
 function open(t:Target){if(!data)return;setTarget(t);const part=data.balance.business<remaining(t)?data.balance.business:remaining(t);setBm(decimalAmount(part));setEm(decimalAmount(data.balance.external<remaining(t)-part?data.balance.external:remaining(t)-part));setDate(today);setNote("");request.current=crypto.randomUUID();}
 async function save(e:FormEvent){e.preventDefault();if(!target)return;try{const a=parseAllocation(bm,em);if(a.total>remaining(target))throw Error("Payment exceeds remaining amount.");if(date<business.balance_date||date>today)throw Error("Choose a valid tracking date.");}catch(e){setError(e instanceof Error?e.message:"Invalid payment.");return;}
 await run(async()=>{await settlementCommand("create",{business_id:business.id,id:request.current,expense_id:target.kind==="expense"?target.id:null,instalment_id:target.kind==="loan"?target.id:null,business_amount:bm,external_amount:em,paid_on:date,note});setTarget(null);setMessage("Payment recorded.");await reload();});
 }
 function reverse(p:Settlement){const reason=prompt("Reason for reversing this payment:");if(!reason?.trim())return;if(reason.trim().length>500){setError("Reason must be 500 characters or fewer.");return;}run(async()=>{await settlementCommand("reverse",{business_id:business.id,id:p.id,reason:reason.trim()});setMessage("Payment reversed.");await reload();});}
 return <div className="stack">
 {error&&<Notice error>{error} <button className="text-link" disabled={busy} onClick={()=>run(reload)}>Refresh</button></Notice>}{message&&<Notice>{message}</Notice>}
 <section className="card stack"><span className="eyebrow">Available funds after payments</span><div className="expense-total">{data?fmt(data.balance.business+data.balance.external):"—"}</div><div className="form-grid"><div>Business funds<br/><strong>{data?fmt(data.balance.business):"—"}</strong></div><div>External funds<br/><strong>{data?fmt(data.balance.external):"—"}</strong></div></div><p className="muted">Opening balance and incoming funds less active payments through {today}.</p></section>
 <section className="card stack"><div className="form-grid"><label>Month<input type="month" value={month} disabled={busy} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label><label><input type="checkbox" checked={allDue} disabled={busy} onChange={e=>setAllDue(e.target.checked)}/> Show all due dates</label></div></section>
 {target&&canWrite&&<section className="card form-card"><h2>Pay {target.label}</h2><p>Remaining: {fmt(remaining(target))} · Due {target.due_date}</p><form onSubmit={save}><fieldset disabled={busy}><div className="form-grid"><label>Business funds<input required inputMode="decimal" value={bm} onChange={e=>setBm(e.target.value)}/></label><label>External funds<input required inputMode="decimal" value={em} onChange={e=>setEm(e.target.value)}/></label><label>Payment date<input required type="date" min={business.balance_date} max={today} value={date} onChange={e=>setDate(e.target.value)}/></label><label>Note<input maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label></div></fieldset><div className="form-actions"><Button secondary type="button" disabled={busy} onClick={()=>setTarget(null)}>Cancel</Button><Button disabled={busy}>Record payment</Button></div></form></section>}
 <section className="card stack"><h2>Expenses and loan instalments</h2>{!data?<p>Loading…</p>:!data.targets.length?<p>No obligations in this period.</p>:data.targets.map(t=><div className="member-row" key={t.kind+t.id}><div><strong>{t.label}</strong><small>{t.kind==="loan"?"Loan instalment":"Expense"} · {t.due_date} · {paymentStatus(t)}</small><small>Scheduled {fmt(BigInt(t.amount_minor))} · Paid {fmt(BigInt(t.paid_minor))}</small><strong>Remaining {fmt(remaining(t))}</strong></div>{canWrite&&remaining(t)>0n&&<Button secondary disabled={busy} onClick={()=>open(t)}>Pay</Button>}</div>)}</section>
 <section className="card stack"><h2>Payment history · {month}</h2>{!data?<p>Loading…</p>:!data.payments.length?<p>No payments recorded.</p>:data.payments.map(p=><div className="member-row" key={p.id}><div><strong>{p.target_label} · {fmt(BigInt(p.business_minor)+BigInt(p.external_minor))}</strong><small>{p.paid_on} · {p.reversed_at?"Reversed":"Recorded"} · Due {p.due_date}</small><small>Business {fmt(BigInt(p.business_minor))} · External {fmt(BigInt(p.external_minor))}</small><small>{p.note}</small>{p.reversed_at&&<small>Reversal: {p.reversal_reason}</small>}</div>{canWrite&&!p.reversed_at&&<Button secondary disabled={busy} onClick={()=>reverse(p)}>Reverse</Button>}</div>)}</section>
 </div>;
}
