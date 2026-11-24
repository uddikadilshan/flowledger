import { z } from "zod";
import { client } from "./supabase";
import { addMonths, toMinor } from "./expenses";
const amount = z.string().regex(/^\d{1,12}(\.\d{1,2})?$/, "Enter an amount with up to two decimal places.");
const date = z.iso.date().refine(v => v >= "2000-01-01" && v <= "2100-12-31", "Choose a date between 2000 and 2100.");
export const loanSchema = z.object({
 title: z.string().trim().min(1).max(100), lender: z.string().trim().max(150),
 total: amount, prior: amount, monthly: amount, start_date: date, first_due: date, end_date: date
}).superRefine((v,ctx)=>{
 if (v.start_date > v.first_due || v.first_due > v.end_date || v.end_date > addMonths(v.first_due,360)) {
  ctx.addIssue({code:"custom",message:"Check the start, first due and end dates (maximum 30 years).",path:["end_date"]}); return;
 }
 try { buildSchedule(v.total,v.prior,v.monthly,v.first_due,v.end_date); }
 catch(e) { ctx.addIssue({code:"custom",message:e instanceof Error?e.message:"Invalid schedule",path:["monthly"]}); }
});
export type LoanInput = z.infer<typeof loanSchema>;
export function buildSchedule(total:string,prior:string,monthly:string,first:string,end:string) {
 let remaining=toMinor(total)-toMinor(prior); const instalment=toMinor(monthly);
 if(toMinor(total)<=0n || toMinor(prior)<0n || remaining<0n || instalment<=0n) throw Error("Check total, prior payments and monthly amount.");
 const rows:{due_date:string;amount_minor:bigint}[]=[];
 while(remaining>0n) {
  const due_date=addMonths(first,rows.length);
  if(due_date>end || rows.length>=361) throw Error("Instalments do not fit within the loan end date.");
  const amount_minor=remaining<instalment?remaining:instalment;
  rows.push({due_date,amount_minor}); remaining-=amount_minor;
 }
 return rows;
}
export type Loan = {id:string;title:string;lender:string;total_minor:number;prior_minor:number;monthly_minor:number;start_date:string;first_due:string;end_date:string;version:number;deleted_at:string|null};
export type Instalment = {id:string;due_date:string;amount_minor:number};
export type LoanHistory = {id:number;action:string;created_at:string;before_record:unknown;after_record:unknown};
export async function loansFor(bid:string,deleted:boolean):Promise<Loan[]> {
 let q=client().from("loans").select("*").eq("business_id",bid).order("title").order("id");
 q=deleted?q.not("deleted_at","is",null):q.is("deleted_at",null);
 const rows:Loan[]=[];
 for(let offset=0;;offset+=500){
  const {data,error}=await q.range(offset,offset+499); if(error)throw error;
  rows.push(...(data??[]) as Loan[]); if(!data||data.length<500)return rows;
 }
}
export async function instalmentsFor(bid:string,id:string):Promise<Instalment[]> {
 const {data,error}=await client().from("loan_instalments").select("id,due_date,amount_minor").eq("business_id",bid).eq("loan_id",id).order("occurrence").limit(361);
 if(error)throw error;return data??[];
}
export async function loanHistoryFor(bid:string,id:string):Promise<LoanHistory[]> {
 const rows:LoanHistory[]=[];
 for(let offset=0;;offset+=500){
 const {data,error}=await client().from("loan_history").select("id,action,created_at,before_record,after_record").eq("business_id",bid).eq("loan_id",id).order("id",{ascending:false}).range(offset,offset+499);
 if(error)throw error;rows.push(...(data??[]) as LoanHistory[]);if(!data||data.length<500)return rows;
 }
}
export async function loanCommand(action:string,payload:Record<string,unknown>){
 const {data,error}=await client().rpc("loan_command",{action,payload});if(error)throw error;return data;
}
