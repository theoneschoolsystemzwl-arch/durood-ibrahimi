import assert from "node:assert/strict";
import {sideSerialDirectory,parseSideSerial} from "../public/member-side-serial.js";
const rows=[{uid:"owner",role:"owner",gender:"male",memberNumber:1},{uid:"f1",gender:"female",memberNumber:2},{uid:"f2",gender:"female",memberNumber:3},{uid:"m2",gender:"male",memberNumber:4},{uid:"m3",gender:"male",memberNumber:5,deleted:true},{uid:"m4",gender:"male",memberNumber:6}];
const male=sideSerialDirectory(rows,"male"),female=sideSerialDirectory(rows,"female");
assert.equal(male.get("owner").label,"M1");assert.equal(male.get("m2").label,"M2");assert.equal(male.get("m4").label,"M4");
assert.equal(female.get("f1").label,"F1");assert.equal(female.get("f2").label,"F2");assert.equal(male.has("f1"),false);
assert.deepEqual(parseSideSerial("m-2"),{type:"male",number:2});assert.deepEqual(parseSideSerial("F-2"),{type:"female",number:2});assert.deepEqual(parseSideSerial("DI-4"),{type:"global",number:4});assert.equal(parseSideSerial("F-0"),null);assert.deepEqual(parseSideSerial("M2"),{type:"male",number:2});assert.deepEqual(parseSideSerial("F2"),{type:"female",number:2});
assert.throws(()=>sideSerialDirectory([{...rows[1],sideNumber:1},{...rows[2],sideNumber:1}],"female"),/Duplicate/);
console.log("Side serial numbering and compatibility tests passed");
