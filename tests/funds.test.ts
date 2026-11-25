import test from "node:test";
import assert from "node:assert/strict";
import {sumFunds,availableFunds,monthBounds,fundSchema,type FundEntry} from "../lib/funds";
const entry=(kind:FundEntry["kind"],amount_minor:number,reversed_at:string|null=null):FundEntry=>({id:"test",kind,amount_minor,received_on:"2026-11-24",note:"",version:1,reversed_at});
test("separate funding and collections, exclude reversals",()=>assert.deepEqual(sumFunds([entry("collection",10001),entry("collection",9999),entry("external",5000),entry("collection",900,"2026-11-24")]),{collection:20000n,external:5000n}));
test("available funds include opening and both types exactly",()=>assert.equal(availableFunds("100.25",{collection:20000n,external:5000n}),35025n));
test("month bounds leap year",()=>assert.deepEqual(monthBounds("2028-02"),{from:"2028-02-01",to:"2028-02-29"}));
test("invalid amounts rejected",()=>{for(const amount of ["0","-1","1.001","abc"])assert.equal(fundSchema.safeParse({kind:"collection",amount,received_on:"2026-11-24",note:""}).success,false);});
