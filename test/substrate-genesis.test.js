import { createRequire } from "node:module";
const require=createRequire(import.meta.url);
const {expect}=require("chai");
const assert=require("node:assert/strict");
const {verifySubstrateGenesisHash,validateSubstrateRpcUrl}=require("../scripts/substrate-genesis.js");
const HASH="0x"+"ab".repeat(32);
class FakeWS extends EventTarget {constructor(url,response={jsonrpc:"2.0",id:1,result:HASH}){super();this.url=url;this.response=response;queueMicrotask(()=>this.dispatchEvent(new Event("open")))}send(raw){this.request=JSON.parse(raw);queueMicrotask(()=>this.dispatchEvent(new MessageEvent("message",{data:JSON.stringify(this.response)})))}close(){}}
describe("PortalDot Substrate genesis identity",function(){
it("requires secure WSS except for local loopback",function(){expect(()=>validateSubstrateRpcUrl("https://rpc.example.invalid")).to.throw(/must use WSS/);expect(()=>validateSubstrateRpcUrl("ws://example.invalid")).to.throw(/must use WSS/);expect(validateSubstrateRpcUrl("ws://127.0.0.1:9944")).to.equal("ws://127.0.0.1:9944/")});
it("requests chain_getBlockHash(0) and compares the pinned hash",async function(){let socket;class Capture extends FakeWS{constructor(url){super(url);socket=this}}expect(await verifySubstrateGenesisHash("wss://rpc.example.invalid",HASH,Capture)).to.equal(HASH);expect(socket.request).to.deep.equal({jsonrpc:"2.0",id:1,method:"chain_getBlockHash",params:[0]})});
it("fails closed on mismatches, invalid IDs, and RPC errors",async function(){class Mismatch extends FakeWS{constructor(url){super(url,{jsonrpc:"2.0",id:1,result:"0x"+"cd".repeat(32)})}}class BadId extends FakeWS{constructor(url){super(url,{jsonrpc:"2.0",id:2,result:HASH})}}class RpcError extends FakeWS{constructor(url){super(url,{jsonrpc:"2.0",id:1,error:{message:"UnknownBlock"}})}}await assert.rejects(()=>verifySubstrateGenesisHash("wss://rpc.example.invalid",HASH,Mismatch),/does not match PORTALDOT_SUBSTRATE_GENESIS_HASH/);await assert.rejects(()=>verifySubstrateGenesisHash("wss://rpc.example.invalid",HASH,BadId),/invalid JSON-RPC response/);await assert.rejects(()=>verifySubstrateGenesisHash("wss://rpc.example.invalid",HASH,RpcError),/UnknownBlock/)});
});
