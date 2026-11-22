// Wazaif security tests: group settings by owner only, personal Wazaif isolated,
// group accounting atomic and closed when group is inactive.
const fs=require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {doc,collection,query,where,limit,getDoc,getDocs,setDoc,updateDoc,deleteDoc,runTransaction,serverTimestamp,increment}=require("firebase/firestore");
(async()=>{
 const env=await initializeTestEnvironment({projectId:"demo-durood",
   firestore:{rules:fs.readFileSync("firestore.rules","utf8")}});
 const ownerUid="vt06NK7DcmgPpUKD4R7EgwzAxIH3",memberUid="wazifa-member-a",otherUid="wazifa-member-b";
 const day="2026-11-23",year="2026";
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await setDoc(doc(db,"members",ownerUid),{uid:ownerUid,name:"Owner",username:"owner",memberNumber:1,role:"owner",disabled:false});
   await setDoc(doc(db,"members",memberUid),{uid:memberUid,name:"Member A",username:"a",memberNumber:2,gender:"male",role:"member",disabled:false});
   await setDoc(doc(db,"members",otherUid),{uid:otherUid,name:"Member B",username:"b",memberNumber:3,gender:"female",role:"member",disabled:false});
   for(const uid of [memberUid,otherUid]){
    await setDoc(doc(db,"activeLogins",uid),{sessionId:"correct-device",authTime:1700000000,claimedAt:new Date()});
   }
  });
  const guest=env.unauthenticatedContext().firestore();
  const owner=env.authenticatedContext(ownerUid).firestore();
  const member=env.authenticatedContext(memberUid,{auth_time:1700000000}).firestore();
  const other=env.authenticatedContext(otherUid,{auth_time:1700000000}).firestore();
  const group=doc(owner,"wazaifSettings","group");
  const base={title:"درود ابراہیمی",arabic:"اللهم صل على محمد",instructions:"Read once",purpose:"Durood",kind:"group",dailyGoal:200,yearlyGoal:1000000,startDate:day,active:true,countAsDurood:true};
  await assertFails(getDoc(doc(guest,"wazaifSettings","group")));
  await assertFails(setDoc(doc(member,"wazaifSettings","group"),{...base,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(group,{...base,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(doc(member,"wazaifSettings","group")));
  await assertSucceeds(getDoc(doc(other,"wazaifSettings","group")));
  await assertFails(updateDoc(doc(other,"wazaifSettings","group"),{dailyGoal:999999,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(member,"wazaifSettings","group"),{active:false,updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(group,{dailyGoal:250,updatedAt:serverTimestamp()}));
  const privateRef=doc(member,"memberWazaif",memberUid,"items","WzPrivateABC123456789");
  const personal={uid:memberUid,title:"آیت الکرسی",arabic:"الله لا إله إلا هو",instructions:"Read daily",purpose:"Personal",kind:"daily",goal:100,startDate:day,endDate:"",total:0,today:0,day};
  const memberSeq=doc(member,"memberWazaif",memberUid,"meta","sequence");
  await assertFails(setDoc(privateRef,{...personal,wNumber:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertFails(setDoc(privateRef,{...personal,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertSucceeds(runTransaction(member,async tx=>{
    tx.set(privateRef,{...personal,wNumber:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(memberSeq,{next:1,lastItemId:privateRef.id,updatedAt:serverTimestamp()});
  }));
  if((await getDoc(privateRef)).data().wNumber!==1)throw Error("W-1 not assigned");
  await assertFails(updateDoc(privateRef,{wNumber:8,updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(privateRef));
  await assertSucceeds(getDocs(query(collection(member,"memberWazaif",memberUid,"items"),limit(100))));
  await assertFails(getDoc(doc(other,"memberWazaif",memberUid,"items","WzPrivateABC123456789")));
  await assertFails(getDoc(doc(owner,"memberWazaif",memberUid,"items","WzPrivateABC123456789")));
  await assertFails(getDocs(query(collection(other,"memberWazaif",memberUid,"items"),limit(100))));
  await assertFails(updateDoc(doc(other,"memberWazaif",memberUid,"items","WzPrivateABC123456789"),{goal:10,updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(privateRef,{instructions:"Read after prayers",updatedAt:serverTimestamp()}));
  await assertSucceeds(runTransaction(member,async tx=>{
   const snap=await tx.get(privateRef);
   tx.update(privateRef,{total:snap.data().total+1,today:snap.data().today+1,day,updatedAt:serverTimestamp()});
  }));
  await assertFails(updateDoc(privateRef,{total:999999,today:999999,updatedAt:serverTimestamp()}));
  const groupStats=db=>doc(db,"wazaifGroupStats","main");
  const personStats=db=>doc(db,"wazaifGroupStats","main","members",memberUid);
  const yearStats=db=>doc(db,"wazaifGroupStats","main","years",year);
  async function countGroup(amount=3){
   await assertSucceeds(runTransaction(member,async tx=>{
    const g=groupStats(member),m=personStats(member),y=yearStats(member);
    const [gs,ms,ys]=await Promise.all([tx.get(g),tx.get(m),tx.get(y)]);
    const old=gs.exists()?gs.data():{},own=ms.exists()?ms.data():{},annual=ys.exists()?ys.data():{};
    tx.set(g,{total:Number(old.total||0)+amount,day,year,
      today:(old.day===day?Number(old.today||0):0)+amount,
      lastUid:memberUid,lastAmount:amount,updatedAt:serverTimestamp()});
    tx.set(m,{uid:memberUid,total:Number(own.total||0)+amount,day,
      today:(own.day===day?Number(own.today||0):0)+amount,
      lastAmount:amount,updatedAt:serverTimestamp()});
    tx.set(y,{year,total:Number(annual.total||0)+amount,lastUid:memberUid,
      lastAmount:amount,updatedAt:serverTimestamp()});
   }));
  }
  await countGroup(3);
  await countGroup(2);
  // A group Durood tap also writes its existing Durood personal/global/
  // gender/day/reader records within the SAME transaction. If this fails,
  // a production tap must not silently lose either group or global counting.
  await assertSucceeds(runTransaction(member,async tx=>{
   const person=doc(member,"memberCounts",memberUid);
   const world=doc(member,"publicStats","global");
   const side=doc(member,"genderStats","male");
   const dayRef=doc(member,"genderStats","male","days",day);
   const readerRef=doc(member,"genderStats","male","days",day,"readers",memberUid);
   const groupRef=groupStats(member),one=personStats(member),annual=yearStats(member);
   const [p,sg,gs,ms,ys]=await Promise.all([
     tx.get(person),tx.get(side),tx.get(groupRef),tx.get(one),tx.get(annual)
   ]);
   const amount=1;
   tx.set(person,{memberUid,gender:"male",total:Number(p.data()?.total||0)+amount,
     lastEntryAmount:amount,updatedAt:serverTimestamp()});
   tx.set(world,{totalRecitations:increment(amount),lastEntryUid:memberUid,
     lastEntryAmount:amount,updatedAt:serverTimestamp()},{merge:true});
   tx.set(side,{gender:"male",totalRecitations:Number(sg.data()?.totalRecitations||0)+amount,
     lastEntryUid:memberUid,lastEntryAmount:amount,lastEntryDay:day,updatedAt:serverTimestamp()});
   tx.set(dayRef,{day,total:increment(amount),updatedAt:serverTimestamp()},{merge:true});
   tx.set(readerRef,{name:"Member A",total:increment(amount),lastTap:serverTimestamp(),
     seen:serverTimestamp()},{merge:true});
   tx.set(groupRef,{total:gs.data().total+amount,day,year,today:gs.data().today+amount,
     lastUid:memberUid,lastAmount:amount,updatedAt:serverTimestamp()});
   tx.set(one,{uid:memberUid,total:ms.data().total+amount,day,today:ms.data().today+amount,
     lastAmount:amount,updatedAt:serverTimestamp()});
   tx.set(annual,{year,total:ys.data().total+amount,lastUid:memberUid,
     lastAmount:amount,updatedAt:serverTimestamp()});
  }));
  if((await getDoc(doc(member,"memberCounts",memberUid))).data().total!==1)
    throw Error("Atomic Durood personal total missing");
  if((await getDoc(groupStats(owner))).data().total!==6)throw Error("Group total must equal member increments");
  if((await getDoc(groupStats(other))).data().today!==6)throw Error("Group daily total not visible to female member");
  await assertSucceeds(getDoc(yearStats(other)));
  await assertFails(getDoc(personStats(other)));
  await assertFails(updateDoc(groupStats(member),{total:100,updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(group,{active:false,updatedAt:serverTimestamp()}));
  await assertFails(runTransaction(member,async tx=>{
   const g=groupStats(member),m=personStats(member),y=yearStats(member);
   const [gs,ms,ys]=await Promise.all([tx.get(g),tx.get(m),tx.get(y)]);
   tx.update(g,{total:gs.data().total+1,today:gs.data().today+1,lastAmount:1,updatedAt:serverTimestamp()});
   tx.update(m,{total:ms.data().total+1,today:ms.data().today+1,lastAmount:1,updatedAt:serverTimestamp()});
   tx.update(y,{total:ys.data().total+1,lastAmount:1,updatedAt:serverTimestamp()});
  }));
  // Qaza dates and paid records: signed-in owner and members may write ONLY
  // their own private document. No member, including Owner, reads someone
  // else's date; this is separate from gender grouping and shared Wazaif.
  const ownQaza=doc(owner,"memberPrivate",ownerUid,"qaza","plan");
  const memberQaza=doc(member,"memberPrivate",memberUid,"qaza","plan");
  const firstQaza={start:"2003-05-15",target:25,
    done:{fajr:{"2026-11-21":true},isha:{"2026-11-20":true}},
    updatedAt:serverTimestamp()};
  await assertSucceeds(setDoc(ownQaza,firstQaza));
  await assertSucceeds(getDoc(ownQaza));
  await assertSucceeds(setDoc(memberQaza,{
    start:"2019-01-02",target:15,done:{},updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(ownQaza,{
    target:45,updatedAt:serverTimestamp()
  }));
  const ownerPlan=(await getDoc(ownQaza)).data();
  if(ownerPlan.start!=="2003-05-15"||ownerPlan.target!==45||
    ownerPlan.done.fajr["2026-11-21"]!==true)
    throw Error("Owner Qaza date or paid history unexpectedly reset");
  await assertFails(getDoc(doc(member,"memberPrivate",ownerUid,"qaza","plan")));
  await assertFails(getDoc(doc(other,"memberPrivate",ownerUid,"qaza","plan")));
  await assertFails(getDoc(doc(owner,"memberPrivate",memberUid,"qaza","plan")));
  await assertFails(getDoc(doc(guest,"memberPrivate",ownerUid,"qaza","plan")));
  await assertFails(setDoc(doc(owner,"memberPrivate",memberUid,"qaza","plan"),firstQaza));
  await assertFails(setDoc(doc(member,"memberPrivate",ownerUid,"qaza","plan"),firstQaza));
  await assertFails(updateDoc(ownQaza,{target:-5,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ownQaza,{start:"2026-99-99",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(ownQaza,{done:{fajr:{"2026-11-22":false}},updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(owner,"memberPrivate",memberUid,"qaza","other")));
  await assertFails(getDocs(collection(owner,"memberPrivate",ownerUid,"qaza")));

  // Private numbering: each member starts at W-1, then W-2. An old serial
  // can never be recycled after deletion. No one else can mutate the sequence.
  const oldLegacy=doc(member,"memberWazaif",memberUid,"items","LegacyWazifaRecord0001");
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),"memberWazaif",memberUid,"items",oldLegacy.id),
      {...personal,title:"Old private Zikr",createdAt:new Date(),updatedAt:new Date()});
  });
  await assertSucceeds(runTransaction(member,async tx=>{
    const seq=await tx.get(memberSeq);
    tx.update(oldLegacy,{wNumber:seq.data().next+1,updatedAt:serverTimestamp()});
    tx.update(memberSeq,{next:seq.data().next+1,lastItemId:oldLegacy.id,updatedAt:serverTimestamp()});
  }));
  const serial2=(await getDoc(oldLegacy)).data().wNumber;
  if(serial2!==2)throw Error("Legacy personal Wazifa did not receive W-2");
  await assertFails(updateDoc(oldLegacy,{wNumber:99,updatedAt:serverTimestamp()}));
  await assertFails(getDoc(doc(other,"memberWazaif",memberUid,"meta","sequence")));
  await assertFails(updateDoc(doc(other,"memberWazaif",memberUid,"meta","sequence"),
    {next:1000,lastItemId:privateRef.id,updatedAt:serverTimestamp()}));
  // A female account starts independently at W-1.
  const femaleItem=doc(other,"memberWazaif",otherUid,"items","FemalePrivateWz00123");
  const femaleSeq=doc(other,"memberWazaif",otherUid,"meta","sequence");
  await assertSucceeds(runTransaction(other,async tx=>{
    tx.set(femaleItem,{...personal,uid:otherUid,wNumber:1,createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()});
    tx.set(femaleSeq,{next:1,lastItemId:femaleItem.id,updatedAt:serverTimestamp()});
  }));
  // Querying by same gender is allowed; listing the opposite gender is not.
  await assertSucceeds(getDocs(query(collection(member,"members"),where("gender","==","male"),limit(200))));
  await assertFails(getDocs(query(collection(member,"members"),where("gender","==","female"),limit(200))));
  await assertSucceeds(getDocs(query(collection(other,"members"),where("gender","==","female"),limit(200))));
  await assertFails(getDocs(query(collection(other,"members"),where("gender","==","male"),limit(200))));
  // The inbox contains a read-only snapshot of a personal task, verified by
  // source ownership and recipient gender. The group Wazifa can't be sent.
  const shareDoc=doc(owner,"wazifaInbox",ownerUid,"items","ShareMsgOwner0001");
  const source= (await getDoc(privateRef)).data();
  const outgoing={title:source.title,arabic:source.arabic,instructions:source.instructions,
    purpose:source.purpose,kind:source.kind,goal:source.goal,
    startDate:source.startDate,endDate:source.endDate};
  const accepted={...outgoing,senderUid:memberUid,recipientUid:ownerUid,
    senderSerial:"DI-2",sourceId:privateRef.id,createdAt:serverTimestamp()};
  await assertSucceeds(setDoc(doc(member,"wazifaInbox",ownerUid,"items",shareDoc.id),accepted));
  await assertSucceeds(getDoc(shareDoc));
  await assertSucceeds(getDocs(query(collection(owner,"wazifaInbox",ownerUid,"items"),limit(100))));
  await assertFails(getDoc(doc(other,"wazifaInbox",ownerUid,"items",shareDoc.id)));
  await assertFails(getDoc(doc(member,"wazifaInbox",ownerUid,"items",shareDoc.id)));
  await assertFails(setDoc(doc(member,"wazifaInbox",otherUid,"items","CrossSide00000000001"),
    {...accepted,recipientUid:otherUid,createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(other,"wazifaInbox",memberUid,"items","CrossSide00000000002"),
    {...accepted,senderUid:otherUid,recipientUid:memberUid,
      senderSerial:"DI-3",sourceId:femaleItem.id,createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(member,"wazifaInbox",ownerUid,"items","ForgedWazifa0000001"),
    {...accepted,title:"Changed text",createdAt:serverTimestamp()}));
  await assertFails(deleteDoc(doc(member,"wazifaInbox",ownerUid,"items",shareDoc.id)));
  // Accept share atomically: private W-1 is created and only the recipient
  // can delete their own pending inbox card. A second accept cannot duplicate.
  const ownerSeq=doc(owner,"memberWazaif",ownerUid,"meta","sequence");
  const acceptedItem=doc(owner,"memberWazaif",ownerUid,"items","ReceivedWazifa00001");
  await assertSucceeds(runTransaction(owner,async tx=>{
    const message=await tx.get(shareDoc);
    if(!message.exists())throw Error("Pending share is missing");
    tx.set(acceptedItem,{...outgoing,uid:ownerUid,total:0,today:0,day:"2026-11-23",
      wNumber:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(ownerSeq,{next:1,lastItemId:acceptedItem.id,updatedAt:serverTimestamp()});
    tx.delete(shareDoc);
  }));
  if((await getDoc(acceptedItem)).data().wNumber!==1)throw Error("Recipient W-1 not assigned");
  if((await getDoc(shareDoc)).exists())throw Error("Accepted share still in inbox");
  const rejected=doc(owner,"wazifaInbox",ownerUid,"items","RejectShare000000001");
  await assertSucceeds(setDoc(doc(member,"wazifaInbox",ownerUid,"items",rejected.id),
    {...accepted,createdAt:serverTimestamp()}));
  await assertSucceeds(deleteDoc(rejected));
  if((await getDoc(rejected)).exists())throw Error("Rejected share remained visible");
  await assertSucceeds(deleteDoc(acceptedItem));
  const nextW=doc(owner,"memberWazaif",ownerUid,"items","SecondSavedWazifa001");
  await assertSucceeds(runTransaction(owner,async tx=>{
    const seq=await tx.get(ownerSeq);
    tx.set(nextW,{...outgoing,uid:ownerUid,total:0,today:0,day:"2026-11-23",
      wNumber:seq.data().next+1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.update(ownerSeq,{next:seq.data().next+1,lastItemId:nextW.id,updatedAt:serverTimestamp()});
  }));
  if((await getDoc(nextW)).data().wNumber!==2)
    throw Error("W-1 was reused after deleting a saved Wazifa");
  console.log("W serial and share tests passed: per-UID W-1, migration, same-gender DI lookup, inbox accept/reject, never-reused serials.");
  console.log("Qaza security tests passed: per-UID date retention, Owner isolation, valid goals and paid records.");
  console.log("Wazaif security tests passed: owner-only group settings, personal privacy, group accounting and inactive blocking.");
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
