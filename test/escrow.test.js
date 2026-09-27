import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import ganache from "ganache";
import {BrowserProvider,ContractFactory,keccak256,toUtf8Bytes} from "ethers";

const artifact=(name)=>JSON.parse(fs.readFileSync(new URL(`../artifacts/${name}.json`,import.meta.url),"utf8"));

async function fixture(){
  const eip1193=ganache.provider({logging:{quiet:true}});
  const provider=new BrowserProvider(eip1193);
  const payer=await provider.getSigner(0),recipient=await provider.getSigner(1),resolver=await provider.getSigner(2);
  const tokenArtifact=artifact("MockUSDC"),factoryArtifact=artifact("PactrailEscrowFactory"),escrowArtifact=artifact("PactrailEscrow");
  const token=await new ContractFactory(tokenArtifact.abi,tokenArtifact.bytecode,payer).deploy(await payer.getAddress(),10_000_000_000n);await token.waitForDeployment();
  const factory=await new ContractFactory(factoryArtifact.abi,factoryArtifact.bytecode,payer).deploy();await factory.waitForDeployment();
  const expiry=Math.floor(Date.now()/1000)+86400,policyHash=keccak256(toUtf8Bytes("policy-1")),amounts=[150_000_000n,350_000_000n,500_000_000n];
  const tx=await factory.createEscrow(await recipient.getAddress(),await resolver.getAddress(),await token.getAddress(),policyHash,amounts,expiry);
  const receipt=await tx.wait();
  const event=receipt.logs.map((log)=>{try{return factory.interface.parseLog(log)}catch{return null}}).find((entry)=>entry?.name==="EscrowCreated");
  const escrow=new ContractFactory(escrowArtifact.abi,escrowArtifact.bytecode,payer).attach(event.args.escrow);
  return{provider,payer,recipient,resolver,token,factory,escrow,amounts};
}

test("funds exact amount and releases milestones once",async()=>{
  const {payer,recipient,token,escrow}=await fixture();
  await (await token.connect(payer).approve(await escrow.getAddress(),1_000_000_000n)).wait();
  await (await escrow.connect(payer).fund()).wait();
  assert.equal(await escrow.state(),1n);
  await (await escrow.connect(payer).release(0)).wait();
  assert.equal(await token.balanceOf(await recipient.getAddress()),150_000_000n);
  await assert.rejects(escrow.connect(payer).release(0));
});

test("only parties can dispute and only resolver can refund a dispute",async()=>{
  const {payer,recipient,resolver,token,escrow}=await fixture();
  await (await token.connect(payer).approve(await escrow.getAddress(),1_000_000_000n)).wait();
  await (await escrow.connect(payer).fund()).wait();
  await (await escrow.connect(recipient).raiseDispute()).wait();
  await assert.rejects(escrow.connect(payer).cancel());
  await (await escrow.connect(resolver).cancel()).wait();
  assert.equal(await escrow.state(),4n);
  assert.equal(await token.balanceOf(await payer.getAddress()),10_000_000_000n);
});

test("completes only after every milestone is released",async()=>{
  const {payer,recipient,token,escrow}=await fixture();
  await (await token.connect(payer).approve(await escrow.getAddress(),1_000_000_000n)).wait();
  await (await escrow.connect(payer).fund()).wait();
  for(const index of [0,1,2])await (await escrow.connect(payer).release(index)).wait();
  assert.equal(await escrow.state(),3n);
  assert.equal(await token.balanceOf(await recipient.getAddress()),1_000_000_000n);
});
