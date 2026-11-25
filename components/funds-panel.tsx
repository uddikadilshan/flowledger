"use client";
import {useEffect,useRef,useState,type FormEvent} from "react";
import {type Business,localDate} from "@/lib/domain";
import {readableError} from "@/lib/supabase";
import {decimalAmount,formatMinor} from "@/lib/expenses";
import {fundSchema,fundCommand,fundEntries,fundTotals,fundHistory,monthBounds,availableFunds,type FundEntry,type FundInput,type FundHistory,type Totals} from "@/lib/funds";
import {Button,Notice} from "./ui";
export function FundsPanel({business,owner}:{business:Business;owner:boolean}){
 const today=localDate(business.timezone),canWrite=owner&&!business.archived_at;
 const [month,setMonth]=useState(today.slice(0,7)),[day,setDay]=useState(today),[reversed,setReversed]=useState(false);
 const [rows,setRows]=useState<FundEntry[]>([]),[summary,setSummary]=useState<{daily:Totals;monthly:Totals;all:Totals}|null>(null);
 const [loading,setLoading]=useState(true),[busy,setBusy]=useState(false),[error,setError]=useState(""),[message,setMessage]=useState("");
 const [form,setForm]=useState<FundInput|null>(null),[editing,setEditing]=useState<FundEntry|null>(null),[reason,setReason]=useState(""),[history,setHistory]=useState<{id:string;items:FundHistory[]}|null>(null);
 const lock=useRef(false),generation=useRef(0),request=useRef("");
 async function reload(){
  const n=++generation.current;setLoading(true);setSummary(null);
  try{
   const {from,to}=monthBounds(month);
   const [entries,daily,monthly,all]=await Promise.all([
    fundEntries(business.id,from,to,reversed),fundTotals(business.id,day,day),fundTotals(business.id,from,to),fundTotals(business.id,business.balance_date,today)
   ]);
   if(n===generation.current){setRows(entries);setSummary({daily,monthly,all});}
  }finally{if(n===generation.current)setLoading(false);}
 }
 useEffect(()=>{setRows([]);setHistory(null);setForm(null);reload().catch(e=>setError(readableError(e)));return()=>{generation.current++;};},[business.id,month,day,reversed]);
 async function run(fn:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);setError("");setMessage("");
  try{if(!navigator.onLine)throw Error("offline");await fn();}
  catch(e){setError(readableError(e));}finally{lock.current=false;setBusy(false);}
 }
 function open(entry?:FundEntry,kind:FundInput["kind"]="collection"){
  setEditing(entry??null);setReason("");request.current=crypto.randomUUID();
  setForm(entry?{kind:entry.kind,amount:decimalAmount(entry.amount_minor),received_on:entry.received_on,note:entry.note}:{kind,amount:"",received_on:day,note:""});
 }
 async function save(e:FormEvent){
  e.preventDefault();const parsed=fundSchema.safeParse(form);
  if(!parsed.success){setError(parsed.error.issues[0].message);return;}
  if(parsed.data.received_on<business.balance_date||parsed.data.received_on>today){setError("Choose a date between the opening balance date and today.");return;}
  if(editing&&!reason.trim()){setError("Enter a correction reason.");return;}
  await run(async()=>{
   await fundCommand(editing?"correct":"create",{...parsed.data,business_id:business.id,id:editing?.id??request.current,version:editing?.version,reason:reason.trim()});
   setForm(null);setHistory(null);setMessage("Entry saved.");await reload();
  });
 }
 function change(entry:FundEntry){
  const why=prompt(entry.reversed_at?"Reason for restoring this entry:":"Reason for reversing this entry:");
  if(!why?.trim())return;
  if(why.trim().length>500){setError("Reason must be 500 characters or fewer.");return;}
  run(async()=>{await fundCommand(entry.reversed_at?"restore":"reverse",{business_id:business.id,id:entry.id,version:entry.version,reason:why.trim()});setHistory(null);await reload();setMessage(entry.reversed_at?"Entry restored.":"Entry reversed.");});
 }
 const fmt=(v:bigint)=>formatMinor(v,business.currency);
 return <div className="stack">
  {error&&<Notice error>{error} <button className="text-link" disabled={busy} onClick={()=>run(reload)}>Refresh</button></Notice>}
  {message&&<Notice>{message}</Notice>}
  <section className="card expense-toolbar"><div><span className="eyebrow">Available funds before settlements</span><div className="expense-total">{summary?fmt(availableFunds(business.opening_balance,summary.all)):"—"}</div><p className="muted">Opening balance + incoming funds through {today}. Payments are not deducted yet.</p></div>
   {canWrite&&<div className="actions"><Button disabled={busy||loading} onClick={()=>open(undefined,"collection")}>Add collection</Button><Button secondary disabled={busy||loading} onClick={()=>open(undefined,"external")}>Add external funds</Button></div>}
  </section>
  <section className="card stack"><div className="form-grid"><label>Collection date<input type="date" value={day} max={today} disabled={busy} onChange={e=>{if(e.target.value)setDay(e.target.value);}}/></label><label>Month<input type="month" value={month} max={today.slice(0,7)} disabled={busy} onChange={e=>{if(e.target.value)setMonth(e.target.value);}}/></label></div>
   <div className="overview-grid">
    <div><span className="eyebrow">Daily collections</span><div className="expense-total">{summary?fmt(summary.daily.collection):"—"}</div><p className="muted">External funds: {summary?fmt(summary.daily.external):"—"}</p></div>
    <div><span className="eyebrow">Monthly collections</span><div className="expense-total">{summary?fmt(summary.monthly.collection):"—"}</div><p className="muted">External funds: {summary?fmt(summary.monthly.external):"—"}</p></div>
   </div>
  </section>
  {form&&canWrite&&<section className="card form-card"><h2>{editing?"Correct entry":"New incoming funds"}</h2><form onSubmit={save}><fieldset disabled={busy}><div className="form-grid">
   <label>Type<select value={form.kind} onChange={e=>setForm({...form,kind:e.target.value as FundInput["kind"]})}><option value="collection">Business collection</option><option value="external">External funding</option></select></label>
   <label>Amount ({business.currency})<input required inputMode="decimal" value={form.amount} onChange={e=>setForm({...form,amount:e.target.value})}/></label>
   <label>Received date<input required type="date" min={business.balance_date} max={today} value={form.received_on} onChange={e=>setForm({...form,received_on:e.target.value})}/></label>
   <label>Note / source<input maxLength={500} value={form.note} onChange={e=>setForm({...form,note:e.target.value})}/></label>
   {editing&&<label>Correction reason<input required maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label>}
   </div></fieldset><div className="form-actions"><Button secondary type="button" disabled={busy} onClick={()=>setForm(null)}>Cancel</Button><Button disabled={busy}>{busy?"Saving…":"Save entry"}</Button></div></form></section>}
  <section className="card stack"><div className="section-title"><h2>{month} · {reversed?"Reversed entries":"Incoming funds"}</h2><Button secondary disabled={busy} onClick={()=>setReversed(!reversed)}>{reversed?"Active entries":"Reversed entries"}</Button></div>
   {loading?<p>Loading…</p>:!rows.length?<p className="muted">No entries for this month.</p>:rows.map(entry=><div className="member-row" key={entry.id}><div><strong>{entry.kind==="collection"?"Collection":"External funding"}</strong><small>{entry.received_on} · {entry.note||"No note"}</small><strong>{fmt(BigInt(entry.amount_minor))}</strong></div><div className="actions">{canWrite&&<>{!entry.reversed_at&&<Button secondary disabled={busy} onClick={()=>open(entry)}>Correct</Button>}<Button secondary disabled={busy} onClick={()=>change(entry)}>{entry.reversed_at?"Restore":"Reverse"}</Button></>}{owner&&<Button secondary disabled={busy} onClick={()=>run(async()=>setHistory({id:entry.id,items:await fundHistory(business.id,entry.id)}))}>History</Button>}</div></div>)}
  </section>
  {history&&<section className="card stack"><div className="section-title"><h2>Entry history</h2><Button secondary onClick={()=>setHistory(null)}>Close</Button></div>{history.items.map(h=><details key={h.id}><summary>{h.action} · {new Date(h.created_at).toLocaleString()}</summary><p>{h.reason||"Original entry"}</p><div style={{overflowWrap:"anywhere",whiteSpace:"pre-wrap"}}>Before: {JSON.stringify(h.before_record,null,2)}{"\n"}After: {JSON.stringify(h.after_record,null,2)}</div></details>)}</section>}
 </div>;
}
