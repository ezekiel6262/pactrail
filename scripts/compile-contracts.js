import fs from "node:fs";
import path from "node:path";
import solc from "solc";

const root=process.cwd();
const sources={};
for(const name of ["PactrailEscrow.sol","MockUSDC.sol"]){sources[name]={content:fs.readFileSync(path.join(root,"contracts",name),"utf8")}}
const input={language:"Solidity",sources,settings:{evmVersion:"paris",optimizer:{enabled:true,runs:200},outputSelection:{"*":{"*":["abi","evm.bytecode.object","evm.deployedBytecode.object"]}}}};
const output=JSON.parse(solc.compile(JSON.stringify(input)));
const errors=(output.errors||[]).filter((item)=>item.severity==="error");
if(errors.length){for(const error of errors)console.error(error.formattedMessage);process.exit(1)}
fs.mkdirSync(path.join(root,"artifacts"),{recursive:true});
for(const [file,contracts] of Object.entries(output.contracts)){
  for(const [name,contract] of Object.entries(contracts)){
    fs.writeFileSync(path.join(root,"artifacts",`${name}.json`),JSON.stringify({contractName:name,sourceName:file,abi:contract.abi,bytecode:`0x${contract.evm.bytecode.object}`,deployedBytecode:`0x${contract.evm.deployedBytecode.object}`},null,2));
  }
}
const factory=JSON.parse(fs.readFileSync(path.join(root,"artifacts","PactrailEscrowFactory.json"),"utf8"));
const escrow=JSON.parse(fs.readFileSync(path.join(root,"artifacts","PactrailEscrow.json"),"utf8"));
fs.writeFileSync(path.join(root,"dist","contracts.js"),`window.PACTRAIL_CONTRACTS=${JSON.stringify({factory:{abi:factory.abi,bytecode:factory.bytecode},escrow:{abi:escrow.abi}})};\n`);
console.log("Compiled PactrailEscrow and PactrailEscrowFactory");
