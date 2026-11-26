// Wazaif security tests: group settings by owner only, personal Wazaif isolated,
// group accounting atomic and closed when group is inactive.
const fs=require("node:fs");
const {initializeTestEnvironment,assertSucceeds,assertFails}=require("@firebase/rules-unit-testing");
const {doc,collection,query,where,limit,getDoc,getDocs,setDoc,updateDoc,deleteDoc,runTransaction,serverTimestamp,increment,Bytes}=require("firebase/firestore");
(async()=>{
 const env=await initializeTestEnvironment({projectId:"demo-durood",
   firestore:{rules:fs.readFileSync("firestore.rules","utf8")}});
 const ownerUid="vt06NK7DcmgPpUKD4R7EgwzAxIH3",memberUid="wazifa-member-a",otherUid="wazifa-member-b",femaleFriendUid="wazifa-member-c";
 const day="2026-11-23",year="2026";
 try{
  await env.withSecurityRulesDisabled(async ctx=>{
   const db=ctx.firestore();
   await setDoc(doc(db,"members",ownerUid),{uid:ownerUid,name:"Owner",username:"owner",memberNumber:1,role:"owner",disabled:false});
   await setDoc(doc(db,"members",memberUid),{uid:memberUid,name:"Member A",username:"a",memberNumber:2,gender:"male",role:"member",disabled:false});
   await setDoc(doc(db,"members",otherUid),{uid:otherUid,name:"Member B",username:"b",memberNumber:3,gender:"female",role:"member",disabled:false});
   await setDoc(doc(db,"members",femaleFriendUid),{uid:femaleFriendUid,name:"Member C",username:"c",memberNumber:4,sideNumber:3,gender:"female",role:"member",disabled:false});
   for(const uid of [memberUid,otherUid,femaleFriendUid]){
    await setDoc(doc(db,"activeLogins",uid),{sessionId:"correct-device",authTime:1700000000,claimedAt:new Date()});
   }
  });
  const guest=env.unauthenticatedContext().firestore();
  const owner=env.authenticatedContext(ownerUid).firestore();
  const member=env.authenticatedContext(memberUid,{auth_time:1700000000}).firestore();
  const other=env.authenticatedContext(otherUid,{auth_time:1700000000}).firestore();
  const femaleFriend=env.authenticatedContext(femaleFriendUid,{auth_time:1700000000}).firestore();
  const pdfId="0123456789abcdef0123456789abcdef";
  const chunkData={data:Bytes.fromUint8Array(new Uint8Array([37,80,68,70,45]))};
  const personalChunk=db=>doc(db,"wazifaPdfPrivate",memberUid,"files",pdfId,"chunks","0");
  const groupChunk=db=>doc(db,"wazifaPdfGroup",pdfId,"chunks","0");
  await assertSucceeds(setDoc(personalChunk(member),chunkData));
  await assertSucceeds(getDoc(personalChunk(member)));
  await assertFails(getDoc(personalChunk(other)));
  await assertFails(getDoc(personalChunk(owner)));
  await assertFails(getDoc(personalChunk(guest)));
  const grant=doc(owner,"wazifaInbox",ownerUid,"items",pdfId);
  await env.withSecurityRulesDisabled(async ctx=>{
   await setDoc(doc(ctx.firestore(),"wazifaInbox",ownerUid,"items",pdfId),{
    senderUid:memberUid,recipientUid:ownerUid,arabic:"[[WZPDF:"+pdfId+":19:1]]"
   });
  });
  await assertSucceeds(getDoc(personalChunk(owner)));
  await assertFails(getDoc(personalChunk(other)));
  await assertFails(setDoc(personalChunk(owner),chunkData));
  await assertSucceeds(deleteDoc(grant));
  await assertFails(getDoc(personalChunk(owner)));
  await assertFails(setDoc(personalChunk(other),chunkData));
  await assertFails(setDoc(personalChunk(member),{data:"not binary"}));
  await assertFails(setDoc(personalChunk(member),{data:Bytes.fromUint8Array(new Uint8Array(400001))}));
  await assertFails(setDoc(doc(member,"wazifaPdfPrivate",memberUid,"files",pdfId,"chunks","66"),chunkData));
  await assertSucceeds(setDoc(groupChunk(owner),chunkData));
  await assertSucceeds(getDoc(groupChunk(member)));
  await assertFails(getDoc(groupChunk(guest)));
  await assertFails(setDoc(groupChunk(member),chunkData));
  await assertSucceeds(deleteDoc(personalChunk(member)));
  await assertSucceeds(deleteDoc(groupChunk(owner)));
  const goalRef=doc(member,"memberPrivate",memberUid,"duroodGoals",day);
  await assertSucceeds(setDoc(goalRef,{date:day,goal:100,updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(goalRef,{date:day,goal:0,updatedAt:serverTimestamp()}));
  await assertSucceeds(getDoc(doc(owner,"memberPrivate",memberUid,"duroodGoals",day)));
  await assertFails(getDoc(doc(other,"memberPrivate",memberUid,"duroodGoals",day)));
  await assertFails(setDoc(goalRef,{date:day,goal:-1,updatedAt:serverTimestamp()}));
  await assertFails(setDoc(doc(owner,"memberPrivate",memberUid,"duroodGoals",day),{date:day,goal:50,updatedAt:serverTimestamp()}));
  await assertSucceeds(setDoc(goalRef,{date:day,goal:250,updatedAt:serverTimestamp()}));
  const group=doc(owner,"wazaifSettings","group");
  const base={title:"درود ابراہیمی",arabic:"اللهم صل على محمد",instructions:"Read once",purpose:"Durood",kind:"group",dailyGoal:200,yearlyGoal:1000000,startDate:day,active:true,countAsDurood:true};
  await assertFails(getDoc(doc(guest,"wazaifSettings","group")));
  await assertFails(setDoc(doc(member,"wazaifSettings","group"),{...base,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_1");await assertSucceeds(setDoc(group,{...base,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_2");await assertSucceeds(getDoc(doc(member,"wazaifSettings","group")));
  console.log("W1_RULE_TEST_STEP_3");await assertSucceeds(getDoc(doc(other,"wazaifSettings","group")));
  await assertFails(updateDoc(doc(other,"wazaifSettings","group"),{dailyGoal:999999,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(doc(member,"wazaifSettings","group"),{active:false,updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_4");await assertSucceeds(updateDoc(group,{dailyGoal:250,updatedAt:serverTimestamp()}));
  // Owner's group Arabic can contain a long complete Surah, but must stay
  // within the 25,000-word and 600,000-byte Firestore field limits.
  const fullSurahSample="الحمد ".repeat(25000).trim();
  const oversizedArabic=fullSurahSample+" الحمد";
  await assertSucceeds(updateDoc(group,{arabic:fullSurahSample,updatedAt:serverTimestamp()}));
  if((await getDoc(group)).data().arabic!==fullSurahSample)
    throw Error("Group Arabic text was unexpectedly truncated");
  await assertFails(updateDoc(group,{arabic:oversizedArabic,updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(group,{arabic:base.arabic,updatedAt:serverTimestamp()}));
  const privateRef=doc(member,"memberWazaif",memberUid,"items","WzPrivateABC123456789");
  const personal={uid:memberUid,title:"آیت الکرسی",arabic:"الله لا إله إلا هو",instructions:"Read daily",purpose:"Personal",kind:"daily",goal:100,startDate:day,endDate:"",total:0,today:0,day};
  const memberSeq=doc(member,"memberWazaif",memberUid,"meta","sequence");
  await assertFails(setDoc(privateRef,{...personal,wNumber:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  await assertFails(setDoc(privateRef,{...personal,createdAt:serverTimestamp(),updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_5");await assertSucceeds(runTransaction(member,async tx=>{
    tx.set(privateRef,{...personal,wNumber:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.set(memberSeq,{next:1,lastItemId:privateRef.id,updatedAt:serverTimestamp()});
  }));
  if((await getDoc(privateRef)).data().wNumber!==1)throw Error("W-1 not assigned");
  await assertFails(updateDoc(privateRef,{wNumber:8,updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_6");await assertSucceeds(getDoc(privateRef));
  console.log("W1_RULE_TEST_STEP_7");await assertSucceeds(getDocs(query(collection(member,"memberWazaif",memberUid,"items"),limit(100))));
  await assertFails(getDoc(doc(other,"memberWazaif",memberUid,"items","WzPrivateABC123456789")));
  await assertFails(getDoc(doc(owner,"memberWazaif",memberUid,"items","WzPrivateABC123456789")));
  await assertFails(getDocs(query(collection(other,"memberWazaif",memberUid,"items"),limit(100))));
  await assertFails(updateDoc(doc(other,"memberWazaif",memberUid,"items","WzPrivateABC123456789"),{goal:10,updatedAt:serverTimestamp()}));
  // Member's own Wazifa must accept the same long Arabic text for W-1,
  // including updates to an already-saved shortened Surah.
  await assertSucceeds(updateDoc(privateRef,{arabic:fullSurahSample,updatedAt:serverTimestamp()}));
  if((await getDoc(privateRef)).data().arabic!==fullSurahSample)
    throw Error("Personal Wazifa Arabic text was unexpectedly truncated");
  await assertFails(updateDoc(privateRef,{arabic:oversizedArabic,updatedAt:serverTimestamp()}));
  await assertSucceeds(updateDoc(privateRef,{arabic:personal.arabic,updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_8");await assertSucceeds(updateDoc(privateRef,{instructions:"Read after prayers",updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_9");await assertSucceeds(runTransaction(member,async tx=>{
   const snap=await tx.get(privateRef);
   tx.update(privateRef,{total:snap.data().total+1,today:snap.data().today+1,day,updatedAt:serverTimestamp()});
  }));
  // 41-day configuration must be an allowed, private, bounded edit.
  console.log("W1_RULE_TEST_STEP_10");await assertSucceeds(updateDoc(privateRef,{durationDays:41,updatedAt:serverTimestamp()}));
  // The first new recorded day may coexist with legacy aggregate counts.
  console.log("W1_RULE_TEST_STEP_11");await assertSucceeds(runTransaction(member,async tx=>{
    const snap=await tx.get(privateRef),d=snap.data();
    tx.update(privateRef,{total:d.total+1,today:d.today+1,day,
      dailyLedger:{[day]:{count:1,durationMs:1200,intervals:1}},
      updatedAt:serverTimestamp()});
  }));
  console.log("W1_RULE_TEST_STEP_12");await assertSucceeds(runTransaction(member,async tx=>{
    const snap=await tx.get(privateRef),d=snap.data(),prior=d.dailyLedger[day];
    tx.update(privateRef,{total:d.total+1,today:d.today+1,day,
      dailyLedger:{[day]:{count:prior.count+1,durationMs:prior.durationMs+900,intervals:prior.intervals+1}},
      updatedAt:serverTimestamp()});
  }));
  // New source-aware history: current tasbih is green, manual is yellow,
  // and a past-day save must leave the newest-day summary unchanged.
  console.log("W1_RULE_TEST_STEP_13");await assertSucceeds(updateDoc(privateRef,{startDate:"2026-11-20",updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_14");await assertSucceeds(runTransaction(member,async tx=>{
   const snap=await tx.get(privateRef),d=snap.data(),old=d.dailyLedger[day];
   tx.update(privateRef,{
    total:d.total+1,today:d.today+1,day,
    dailyLedger:{...d.dailyLedger,[day]:{
      ...old,count:old.count+1,durationMs:old.durationMs+2000,
      intervals:old.intervals+1,tasbihCount:1,manualCount:0
    }},
    lastReadingDay:day,lastReadingSource:"tasbih",updatedAt:serverTimestamp()
   });
  }));
  const priorDay="2026-11-22";
  const beforePast=(await getDoc(privateRef)).data();
  console.log("W1_RULE_TEST_STEP_15");await assertSucceeds(runTransaction(member,async tx=>{
   const snap=await tx.get(privateRef),d=snap.data();
   tx.update(privateRef,{total:d.total+500,today:d.today,day:d.day,
    dailyLedger:{...d.dailyLedger,[priorDay]:{
     count:500,durationMs:600000,intervals:0,tasbihCount:0,manualCount:500
    }},lastReadingDay:priorDay,lastReadingSource:"manual",updatedAt:serverTimestamp()});
  }));
  const afterPast=(await getDoc(privateRef)).data();
  if(afterPast.day!==day||afterPast.today!==beforePast.today||
     afterPast.dailyLedger[priorDay].manualCount!==500)
    throw Error("Backdated manual save changed the current daily summary");
  console.log("W1_RULE_TEST_STEP_16");await assertSucceeds(runTransaction(member,async tx=>{
   const snap=await tx.get(privateRef),d=snap.data(),entry=d.dailyLedger[priorDay];
   tx.update(privateRef,{total:d.total-100,today:d.today,day:d.day,
    dailyLedger:{...d.dailyLedger,[priorDay]:{...entry,count:400,manualCount:400}},
    lastReadingDay:priorDay,lastReadingSource:"manual",updatedAt:serverTimestamp()});
  }));
  const corrected=(await getDoc(privateRef)).data();
  if(corrected.dailyLedger[priorDay].tasbihCount!==0||
     corrected.dailyLedger[priorDay].durationMs!==600000||
     corrected.dailyLedger[priorDay].manualCount!==400)
    throw Error("Manual-only correction changed the verified timer or tasbih count");
  await assertFails(updateDoc(privateRef,{lastReadingSource:"tasbih",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(privateRef,{total:999999,today:999999,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(privateRef,{dailyLedger:{[day]:{count:999,durationMs:999,intervals:999}},updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(privateRef,{durationDays:99999,updatedAt:serverTimestamp()}));
  const groupStats=db=>doc(db,"wazaifGroupStats","main");
  const personStats=db=>doc(db,"wazaifGroupStats","main","members",memberUid);
  const yearStats=db=>doc(db,"wazaifGroupStats","main","years",year);
  async function countGroup(amount=3){
   console.log("W1_RULE_TEST_STEP_17");await assertSucceeds(runTransaction(member,async tx=>{
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
  console.log("W1_RULE_TEST_STEP_18");await assertSucceeds(runTransaction(member,async tx=>{
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
  console.log("W1_RULE_TEST_STEP_19");await assertSucceeds(getDoc(yearStats(other)));
  await assertFails(getDoc(personStats(other)));
  await assertFails(updateDoc(groupStats(member),{total:100,updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_20");await assertSucceeds(updateDoc(group,{active:false,updatedAt:serverTimestamp()}));
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
  console.log("W1_RULE_TEST_STEP_21");await assertSucceeds(setDoc(ownQaza,firstQaza));
  console.log("W1_RULE_TEST_STEP_22");await assertSucceeds(getDoc(ownQaza));
  console.log("W1_RULE_TEST_STEP_23");await assertSucceeds(setDoc(memberQaza,{
    start:"2019-01-02",target:15,done:{},updatedAt:serverTimestamp()
  }));
  console.log("W1_RULE_TEST_STEP_24");await assertSucceeds(updateDoc(ownQaza,{
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

  // Private numbering starts at W-1 and fills deleted gaps first.
  // The event counter advances on every allocation; no other account can mutate it.
  const oldLegacy=doc(member,"memberWazaif",memberUid,"items","LegacyWazifaRecord0001");
  await env.withSecurityRulesDisabled(async ctx=>{
    await setDoc(doc(ctx.firestore(),"memberWazaif",memberUid,"items",oldLegacy.id),
      {...personal,title:"Old private Zikr",createdAt:new Date(),updatedAt:new Date()});
  });
  console.log("W1_RULE_TEST_STEP_25");await assertSucceeds(runTransaction(member,async tx=>{
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
  console.log("W1_RULE_TEST_STEP_26");await assertSucceeds(runTransaction(other,async tx=>{
    tx.set(femaleItem,{...personal,uid:otherUid,wNumber:1,createdAt:serverTimestamp(),
      updatedAt:serverTimestamp()});
    tx.set(femaleSeq,{next:1,lastItemId:femaleItem.id,updatedAt:serverTimestamp()});
  }));
  // Querying by same gender is allowed; listing the opposite gender is not.
  console.log("W1_RULE_TEST_STEP_27");await assertSucceeds(getDocs(query(collection(member,"members"),where("gender","==","male"),limit(200))));
  await assertFails(getDocs(query(collection(member,"members"),where("gender","==","female"),limit(200))));
  console.log("W1_RULE_TEST_STEP_28");await assertSucceeds(getDocs(query(collection(other,"members"),where("gender","==","female"),limit(200))));
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
  console.log("W1_RULE_TEST_STEP_29");await assertSucceeds(setDoc(doc(member,"wazifaInbox",ownerUid,"items",shareDoc.id),accepted));
  console.log("W1_RULE_TEST_STEP_30");await assertSucceeds(getDoc(shareDoc));
  console.log("W1_RULE_TEST_STEP_31");await assertSucceeds(getDocs(query(collection(owner,"wazifaInbox",ownerUid,"items"),limit(100))));
  await assertFails(getDoc(doc(other,"wazifaInbox",ownerUid,"items",shareDoc.id)));
  await assertFails(getDoc(doc(member,"wazifaInbox",ownerUid,"items",shareDoc.id)));
  await assertFails(setDoc(doc(member,"wazifaInbox",otherUid,"items","CrossSide00000000001"),
    {...accepted,recipientUid:otherUid,createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(other,"wazifaInbox",memberUid,"items","CrossSide00000000002"),
    {...accepted,senderUid:otherUid,recipientUid:memberUid,
      senderSerial:"DI-3",sourceId:femaleItem.id,createdAt:serverTimestamp()}));
  await assertFails(setDoc(doc(member,"wazifaInbox",ownerUid,"items","ForgedWazifa0000001"),
    {...accepted,title:"Changed text",createdAt:serverTimestamp()}));
  // Female recipients are addressed by D1, D2, ... rather than DI
  // numbers. The legacy founding D2 sender has no sideNumber field yet.
  const ladiesShareId="FemaleShare00000001";
  const ladiesInbox=doc(femaleFriend,"wazifaInbox",femaleFriendUid,"items",ladiesShareId);
  const femaleData=(await getDoc(femaleItem)).data();
  // The female sender's exact own Wazifa is shared, not the male sender's
  // edited copy; Firestore correctly rejects payloads differing from source.
  const femaleOutgoing={title:femaleData.title,arabic:femaleData.arabic,
    instructions:femaleData.instructions,purpose:femaleData.purpose,
    kind:femaleData.kind,goal:femaleData.goal,
    startDate:femaleData.startDate,endDate:femaleData.endDate};
  const femalePayload={...femaleOutgoing,senderUid:otherUid,recipientUid:femaleFriendUid,
    senderSerial:"D2",sourceId:femaleItem.id,createdAt:serverTimestamp()};
  console.log("W1_RULE_TEST_STEP_32");await assertSucceeds(setDoc(doc(other,"wazifaInbox",femaleFriendUid,"items",ladiesShareId),femalePayload));
  console.log("W1_RULE_TEST_STEP_33");await assertSucceeds(getDoc(ladiesInbox));
  await assertFails(getDoc(doc(member,"wazifaInbox",femaleFriendUid,"items",ladiesShareId)));
  await assertFails(setDoc(doc(member,"wazifaInbox",femaleFriendUid,"items","CrossFromMan00000001"),
    {...femalePayload,senderUid:memberUid,senderSerial:"DI-2",sourceId:privateRef.id,
      createdAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_34");await assertSucceeds(deleteDoc(ladiesInbox));
  await assertFails(deleteDoc(doc(member,"wazifaInbox",ownerUid,"items",shareDoc.id)));
  // Accept share atomically: private W-1 is created and only the recipient
  // can delete their own pending inbox card. A second accept cannot duplicate.
  const ownerSeq=doc(owner,"memberWazaif",ownerUid,"meta","sequence");
  const acceptedItem=doc(owner,"memberWazaif",ownerUid,"items","ReceivedWazifa00001");
  console.log("W1_RULE_TEST_STEP_35");await assertSucceeds(runTransaction(owner,async tx=>{
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
  console.log("W1_RULE_TEST_STEP_36");await assertSucceeds(setDoc(doc(member,"wazifaInbox",ownerUid,"items",rejected.id),
    {...accepted,createdAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_37");await assertSucceeds(deleteDoc(rejected));
  if((await getDoc(rejected)).exists())throw Error("Rejected share remained visible");
  console.log("W1_RULE_TEST_STEP_38");await assertSucceeds(deleteDoc(acceptedItem));
  const nextW=doc(owner,"memberWazaif",ownerUid,"items","SecondSavedWazifa001");
  console.log("W1_RULE_TEST_STEP_39");await assertSucceeds(runTransaction(owner,async tx=>{
    const seq=await tx.get(ownerSeq);
    tx.set(nextW,{...outgoing,uid:ownerUid,total:0,today:0,day:"2026-11-23",
      wNumber:1,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.update(ownerSeq,{next:seq.data().next+1,lastNumber:1,lastItemId:nextW.id,updatedAt:serverTimestamp()});
  }));
  if((await getDoc(nextW)).data().wNumber!==1)
    throw Error("Deleted W-1 must be reused before allocating W-2");
  const secondSlot=doc(owner,"memberWazaif",ownerUid,"items","ThirdSavedWazifa002");
  console.log("W1_RULE_TEST_STEP_39B");await assertSucceeds(runTransaction(owner,async tx=>{
    const seq=await tx.get(ownerSeq);
    tx.set(secondSlot,{...outgoing,uid:ownerUid,total:0,today:0,day:"2026-11-23",
      wNumber:2,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.update(ownerSeq,{next:seq.data().next+1,lastNumber:2,lastItemId:secondSlot.id,updatedAt:serverTimestamp()});
  }));
  if((await getDoc(secondSlot)).data().wNumber!==2)
    throw Error("W-2 must follow when the recycled W-1 is occupied");
  // Repro: W-1 originally ended 14 Nov. Saving a DAILY continuation
  // beginning 15 Nov must not be blocked by Firestore rules.
  console.log("W1_RULE_TEST_CONTINUATION_REPRO");
  await assertSucceeds(updateDoc(nextW,{
    kind:"fixed",goal:1400,startDate:"2026-11-01",endDate:"2026-11-14",
    durationDays:14,updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(nextW,{
    continuePeriods:[{mode:"daily",startDate:"2026-11-15",endDate:"",durationDays:0,goal:100}],
    updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(secondSlot,{
    kind:"fixed",goal:1400,startDate:"2026-11-01",endDate:"2026-11-14",
    durationDays:14,updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(secondSlot,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-15",endDate:"2026-11-24",durationDays:10,goal:1000}],
    updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(secondSlot,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-15",endDate:"2026-11-24",durationDays:10,goal:1000},
      {mode:"daily",startDate:"2026-11-25",endDate:"",durationDays:0,goal:100}],
    updatedAt:serverTimestamp()
  }));
  // Existing W-1 daily goal can be revised more than once without altering
  // its date, original W number, read totals, or previous periods.
  console.log("W1_RULE_TEST_REPEAT_GOAL");
  await assertSucceeds(updateDoc(nextW,{
    continuePeriods:[{mode:"daily",startDate:"2026-11-15",endDate:"",durationDays:0,goal:150}],
    updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(nextW,{
    continuePeriods:[{mode:"daily",startDate:"2026-11-15",endDate:"",durationDays:0,goal:250}],
    updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(nextW,{
    continuePeriods:[{mode:"daily",startDate:"2026-11-14",endDate:"",durationDays:0,goal:300}],
    updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(nextW,{
    continuePeriods:[{mode:"daily",startDate:"2026-11-15",endDate:"",durationDays:0,goal:-1}],
    updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(secondSlot,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-15",endDate:"2026-11-24",durationDays:10,goal:1000},
      {mode:"daily",startDate:"2026-11-25",endDate:"",durationDays:0,goal:350}],
    updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(secondSlot,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-15",endDate:"2026-11-24",durationDays:10,goal:2000},
      {mode:"daily",startDate:"2026-11-25",endDate:"",durationDays:0,goal:350}],
    updatedAt:serverTimestamp()
  }));
  const unchanged=(await getDoc(nextW)).data();
  if(unchanged.continuePeriods[0].goal!==250||unchanged.goal!==1400||
     unchanged.startDate!=="2026-11-01"||unchanged.wNumber!==1)
    throw Error("Repeat-goal edit altered original Wazifa identity or plan");
  // Fix-period goal correction also allowed when it is the last phase.
  // Create a distinct account task to verify a fixed phase before it expires.
  const fixedOnly=doc(owner,"memberWazaif",ownerUid,"items","EditFixedGoalStage001");
  await assertSucceeds(runTransaction(owner,async tx=>{
    const seq=await tx.get(ownerSeq);
    tx.set(fixedOnly,{...outgoing,uid:ownerUid,total:0,today:0,day:"2026-11-23",
      wNumber:3,createdAt:serverTimestamp(),updatedAt:serverTimestamp()});
    tx.update(ownerSeq,{next:seq.data().next+1,lastNumber:3,lastItemId:fixedOnly.id,updatedAt:serverTimestamp()});
  }));
  await assertSucceeds(updateDoc(fixedOnly,{
    kind:"fixed",goal:1400,startDate:"2026-11-01",endDate:"2026-11-14",
    durationDays:14,updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(fixedOnly,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-15",endDate:"2026-12-25",durationDays:41,goal:4100}],
    updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(fixedOnly,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-15",endDate:"2026-12-25",durationDays:41,goal:6000}],
    updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(fixedOnly,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-14",endDate:"2026-12-26",durationDays:42,goal:6000}],
    updatedAt:serverTimestamp()
  }));
  // Reopen a completed period to correct wrong starting/ending dates.
  // Only the last period can move; original and earlier periods stay fixed.
  console.log("W1_RULE_TEST_DATE_REVISION");
  await assertSucceeds(updateDoc(nextW,{
    continuePeriods:[{mode:"daily",startDate:"2026-11-16",endDate:"",durationDays:0,goal:250}],
    updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(nextW,{
    continuePeriods:[{mode:"daily",startDate:"2026-11-15",endDate:"",durationDays:0,goal:250}],
    updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(nextW,{
    continuePeriods:[{mode:"daily",startDate:"2026-11-14",endDate:"",durationDays:0,goal:250}],
    updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(fixedOnly,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-16",endDate:"2026-12-26",durationDays:41,goal:6000}],
    updatedAt:serverTimestamp()
  }));
  await assertSucceeds(updateDoc(fixedOnly,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-16",endDate:"2026-12-30",durationDays:45,goal:6000}],
    updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(fixedOnly,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-16",endDate:"2026-11-15",durationDays:1,goal:6000}],
    updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(secondSlot,{
    continuePeriods:[{mode:"fixed",startDate:"2026-11-16",endDate:"2026-11-25",durationDays:10,goal:1000},
      {mode:"daily",startDate:"2026-11-25",endDate:"",durationDays:0,goal:350}],
    updatedAt:serverTimestamp()
  }));
  const savedDates=(await getDoc(fixedOnly)).data();
  if(savedDates.continuePeriods[0].startDate!=="2026-11-16"||
     savedDates.continuePeriods[0].endDate!=="2026-12-30"||
     savedDates.startDate!=="2026-11-01"||savedDates.endDate!=="2026-11-14")
    throw Error("Corrected last period dates were not saved or original dates changed");
  // An expired fixed plan remains locked until its member explicitly
  // opts into a new daily goal. Original fixed dates, counts and W-number
  // remain immutable across the opt-in and future days.
  console.log("W1_RULE_TEST_STEP_40");await assertSucceeds(updateDoc(privateRef,{
    kind:"fixed",goal:41,startDate:day,endDate:day,durationDays:1,
    updatedAt:serverTimestamp()
  }));
  const beforeContinue=(await getDoc(privateRef)).data();
  await assertFails(updateDoc(privateRef,{
    continueStartDate:"2026-11-24",continueDailyGoal:9,
    continueBaseTotal:beforeContinue.total+1,updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(privateRef,{
    continueStartDate:day,continueDailyGoal:9,
    continueBaseTotal:beforeContinue.total,updatedAt:serverTimestamp()
  }));
  console.log("W1_RULE_TEST_STEP_41");await assertSucceeds(updateDoc(privateRef,{
    continueStartDate:"2026-11-24",continueDailyGoal:9,
    continueBaseTotal:beforeContinue.total,continueGoalHistory:{"2026-11-24":9},
    updatedAt:serverTimestamp()
  }));
  await assertFails(updateDoc(privateRef,{endDate:"2026-12-31",updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(privateRef,{goal:90,updatedAt:serverTimestamp()}));
  await assertFails(updateDoc(privateRef,{continueBaseTotal:0,updatedAt:serverTimestamp()}));
  console.log("W1_RULE_TEST_STEP_42");await assertSucceeds(updateDoc(privateRef,{
   continueDailyGoal:12,continueGoalHistory:{"2026-11-24":12},
   updatedAt:serverTimestamp()
  }));
  console.log("W1_RULE_TEST_STEP_43");await assertSucceeds(runTransaction(member,async tx=>{
    const snap=await tx.get(privateRef),d=snap.data();
    tx.update(privateRef,{total:d.total+2,day:"2026-11-24",today:2,
      dailyLedger:{...d.dailyLedger,["2026-11-24"]:{
       count:2,durationMs:1700,intervals:1,tasbihCount:2,manualCount:0}},
      lastReadingDay:"2026-11-24",lastReadingSource:"tasbih",
      updatedAt:serverTimestamp()});
  }));
  const afterContinue=(await getDoc(privateRef)).data();
  if(afterContinue.continueBaseTotal!==beforeContinue.total||
     afterContinue.total!==beforeContinue.total+2||
     afterContinue.continueDailyGoal!==12||afterContinue.kind!=="fixed"||
     afterContinue.endDate!==day||afterContinue.wNumber!==beforeContinue.wNumber){
    throw Error("Fixed-to-daily continuation changed original 41-day accounting.");
  }
  await assertFails(updateDoc(privateRef,{
    continueDailyGoal:0,updatedAt:serverTimestamp()
  }));
  // Run the actual production Save implementation against the emulator rules.
  const prod=fs.readFileSync("public/wazaif-counter.js","utf8")
   .replace(/^import[\s\S]*?from ["'][^"']+["'];\s*/gm,"")
   .replace(/^export \{[^\n]+\}(?: from ["'][^"']+["'])?;\s*/gm,"")
   .replace(/\bexport (?=async function|function)/g,"");
  // The Firestore SDK validates plain objects in its own JS realm.
  const ctx=new Function("auth","db","doc","runTransaction","serverTimestamp","globalDay",prod+
    "\nreturn {recordPersonalWazifa,recordGroupWazifaOnly};")(
    {currentUser:{uid:memberUid}},member,doc,runTransaction,serverTimestamp,()=>"2026-11-26");
  const receipt1="11111111111111111111111111111111",receipt2="22222222222222222222222222222222";
  const priorPersonal=(await getDoc(privateRef)).data().total;
  await assertSucceeds(ctx.recordPersonalWazifa(privateRef.id,100,"2026-11-24",{durationMs:10000,intervals:100,syncId:receipt1}));
  await assertSucceeds(ctx.recordPersonalWazifa(privateRef.id,100,"2026-11-24",{durationMs:10000,intervals:100,syncId:receipt1}));
  if((await getDoc(privateRef)).data().total!==priorPersonal+100)throw Error("Personal Save must add exactly 100 once");
  await assertSucceeds(updateDoc(group,{active:true,countAsDurood:false,updatedAt:serverTimestamp()}));
  const priorGroup=(await getDoc(groupStats(member))).data().total;
  await assertSucceeds(ctx.recordGroupWazifaOnly(100,day,receipt2));
  await assertSucceeds(ctx.recordGroupWazifaOnly(100,day,receipt2));
  if((await getDoc(groupStats(member))).data().total!==priorGroup+100)throw Error("Group Save must add exactly 100 once");
  console.log("Production personal/group Save 100 and receipt retry passed.");
  console.log("Fixed-to-daily continuation tests passed: opt-in, next-day counting, immutable history, safe daily goal.");
  console.log("W serial and share tests passed: per-UID W-1, migration, same-gender DI lookup, inbox accept/reject, recycled vacant serials.");
  console.log("Qaza security tests passed: per-UID date retention, Owner isolation, valid goals and paid records.");
  console.log("Wazaif security tests passed: owner-only group settings, personal privacy, group accounting and inactive blocking.");
 }finally{await env.cleanup();}
})().catch(e=>{console.error(e);process.exitCode=1;});
