"use strict";
// Trusted backend for owner/member accounts. Not exposed to ordinary web clients.
const crypto = require("node:crypto");
const {onCall, HttpsError} = require("firebase-functions/v2/https");
const {initializeApp} = require("firebase-admin/app");
const {getAuth} = require("firebase-admin/auth");
const {getFirestore, FieldValue} = require("firebase-admin/firestore");
initializeApp();
const db = getFirestore();
const region = "asia-southeast2";
const members = db.collection("members");
const usernames = db.collection("usernames");
const invitations = db.collection("invitations");
const counter = db.doc("system/membership");
const validUsername = /^[a-z0-9._-]{3,24}$/;
const toName = value => String(value || "").trim();
const toUsername = value => String(value || "").trim().toLowerCase();
const genderOf = data => data?.gender === "female" ? "female" : "male";
const validGender = value => value === "male" || value === "female";
async function ensureLiveSession(request, uid) {
  const profile = await activeMember(uid);
  if (profile.get("role") === "owner") return profile;
  const session = await db.doc("activeLogins/" + uid).get();
  if (!session.exists ||
      session.get("authTime") !== Number(request.auth?.token?.auth_time)) {
    throw new HttpsError("permission-denied","This account is active on another device.");
  }
  return profile;
}
function derivedEmail(username) {
  // Internal Firebase Auth login address; NOT a deliverable email inbox.
  // The public Login screen only ever asks for username and password.
  const projectId = process.env.GCLOUD_PROJECT || process.env.GCP_PROJECT;
  if (!projectId) throw new HttpsError("internal", "Missing Firebase project ID.");
  return username + "@" + projectId + ".firebaseapp.com";
}
function ensureMember(request) {
  if (!request.auth) throw new HttpsError("unauthenticated", "Please log in.");
  return request.auth.uid;
}
function ensureOwner(request) {
  ensureMember(request);
  if (request.auth.token.owner !== true) {
    throw new HttpsError("permission-denied", "Owner permission required.");
  }
}
async function activeMember(uid) {
  const snap = await members.doc(uid).get();
  if (!snap.exists || snap.get("disabled") === true) {
    throw new HttpsError("permission-denied", "Member account is not active.");
  }
  return snap;
}
exports.registerMember = onCall({region, maxInstances:10}, async request => {
  if (request.auth) throw new HttpsError("failed-precondition","Please sign out before registering.");
  const data = request.data || {};
  const username = toUsername(data.username);
  const name = toName(data.name);
  const password = String(data.password || "");
  const inviteCode = toUsername(data.inviteCode);
  const gender = data.gender;
  if (!validUsername.test(username) || /^di-\d+$/i.test(username)) {
    throw new HttpsError("invalid-argument","Choose a valid username (3-24 letters, numbers, . _ -).");
  }
  if (name.length < 2 || name.length > 60 || password.length < 8 || password.length > 128 ||
      !/^[a-z0-9]{6}$/.test(inviteCode) || !validGender(gender) || data.pledgeAccepted !== true) {
    throw new HttpsError("invalid-argument","Invalid account details or invitation.");
  }
  // Check invitation before creating an Auth user. It is checked AGAIN in the transaction.
  const existingInvite = await invitations.doc(inviteCode).get();
  if (!existingInvite.exists || existingInvite.get("used") === true || existingInvite.get("revoked") === true) {
    throw new HttpsError("permission-denied","Invalid or used invitation code.");
  }
  let user;
  try {
    user = await getAuth().createUser({
      email: derivedEmail(username),
      password,
      displayName: name,
      disabled:false
    });
  } catch (err) {
    if (err.code === "auth/email-already-exists") {
      throw new HttpsError("already-exists","Username is already registered.");
    }
    throw new HttpsError("internal","Unable to create user account.");
  }
  try {
    const profile = await db.runTransaction(async tx => {
      const inviteRef = invitations.doc(inviteCode);
      const usernameRef = usernames.doc(username);
      const memberRef = members.doc(user.uid);
      const invite = await tx.get(inviteRef);
      const usernameDoc = await tx.get(usernameRef);
      const seq = await tx.get(counter);
      if (!invite.exists || invite.get("used") === true || invite.get("revoked") === true) {
        throw new HttpsError("permission-denied","Invitation already used.");
      }
      if (usernameDoc.exists) throw new HttpsError("already-exists","Username already registered.");
      if (!seq.exists || !Number.isSafeInteger(seq.get("lastNumber")) || seq.get("lastNumber") < 1) {
        throw new HttpsError("failed-precondition","Owner account must be initialized first.");
      }
      const inviterUid = invite.get("byUid");
      if (typeof inviterUid !== "string" || !inviterUid) {
        throw new HttpsError("permission-denied","Invalid invitation owner.");
      }
      const inviter = await tx.get(members.doc(inviterUid));
      if (!inviter.exists || inviter.get("disabled") === true) {
        throw new HttpsError("permission-denied","Inviter account is inactive.");
      }
      const inviteGender=invite.get("gender") || (inviter.get("role")==="owner" ? "any" : genderOf(inviter.data()));
      if ((inviteGender!==gender && !(inviter.get("role")==="owner" && inviteGender==="any")) ||
          (inviter.get("role")!=="owner" && genderOf(inviter.data())!==gender)) {
        throw new HttpsError("permission-denied","Invitation is for a different gender.");
      }
      const next = seq.get("lastNumber") + 1;
      if (!Number.isSafeInteger(next)) throw new HttpsError("resource-exhausted","Member numbering limit reached.");
      const serial = "DI-" + next;
      tx.update(counter,{lastNumber:next,updatedAt:FieldValue.serverTimestamp()});
      tx.create(usernameRef,{uid:user.uid,createdAt:FieldValue.serverTimestamp()});
      tx.update(inviteRef,{used:true,usedByUid:user.uid,usedAt:FieldValue.serverTimestamp()});
      tx.create(memberRef,{
        uid:user.uid,username,name,role:"member",gender,memberNumber:next,serial,
        inviterUid,disabled:false,pledgeAcceptedAt:FieldValue.serverTimestamp(),
        createdAt:FieldValue.serverTimestamp()
      });
      return {serial,memberNumber:next,username};
    });
    return profile;
  } catch(err) {
    // Creating Auth user is outside Firestore transactions; compensate on transaction failure.
    await getAuth().deleteUser(user.uid).catch(error => console.error("Compensation failed",user.uid,error.code));
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal","Registration was not completed. Please try again.");
  }
});

exports.createInvitation = onCall({region,maxInstances:10},async request => {
  const uid = ensureMember(request);
  const issuer=await ensureLiveSession(request,uid);
  const gender=issuer.get("role")==="owner"?"any":genderOf(issuer.data());
  let code;
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  for (let attempts = 0; attempts < 8; attempts++) {
    code = Array.from({length:6},()=>chars[crypto.randomInt(chars.length)]).join("");
    try {
      await invitations.doc(code).create({
        byUid:uid,gender,createdAt:FieldValue.serverTimestamp(),used:false,revoked:false
      });
      return {code};
    } catch(err) {
      if (err.code !== 6 && err.code !== "already-exists") throw new HttpsError("internal","Unable to issue invitation.");
    }
  }
  throw new HttpsError("resource-exhausted","Please try again.");
});

exports.setMemberActive = onCall({region,maxInstances:10},async request => {
  ensureOwner(request);
  await ensureLiveSession(request,request.auth.uid);
  const uid = request.data?.uid;
  const active = request.data?.active;
  if (typeof uid !== "string" || !uid || typeof active !== "boolean" || uid === request.auth.uid) {
    throw new HttpsError("invalid-argument","Invalid member or status.");
  }
  const ref = members.doc(uid);
  await db.runTransaction(async tx => {
    const member = await tx.get(ref);
    if (!member.exists || member.get("role") === "owner") throw new HttpsError("permission-denied","Cannot modify owner.");
    tx.update(ref,{disabled:!active,updatedAt:FieldValue.serverTimestamp()});
  });
  await getAuth().updateUser(uid,{disabled:!active});
  return {uid,active};
});

exports.updateMyProfile = onCall({region,maxInstances:10},async request => {
  const uid = ensureMember(request);
  await ensureLiveSession(request,uid);
  const name = toName(request.data?.name);
  if (name.length < 2 || name.length > 60) throw new HttpsError("invalid-argument","Invalid display name.");
  await members.doc(uid).update({name,updatedAt:FieldValue.serverTimestamp()});
  await getAuth().updateUser(uid,{displayName:name});
  return {name};
});


// Production Durood counter. Only authenticated, active accounts may add readings.
// Totals remain server-controlled and cannot be edited from the browser directly.
exports.recordRecitations = onCall({region,maxInstances:20}, async request => {
  const uid = ensureMember(request);
  await ensureLiveSession(request,uid);
  const amount = request.data?.amount;
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 10000) {
    throw new HttpsError("invalid-argument","Choose a whole number between 1 and 10000.");
  }
  const dateUTC = new Date().toISOString().slice(0,10);
  const memberRef = members.doc(uid);
  const countRef = db.doc("memberCounts/" + uid);
  const dailyRef = memberRef.collection("recitations").doc(dateUTC);
  const globalRef = db.doc("publicStats/global");
  await db.runTransaction(async tx => {
    const member = await tx.get(memberRef);
    if (!member.exists || member.get("disabled") === true) {
      throw new HttpsError("permission-denied","Account is not active.");
    }
    // Server-side updates keep aggregate totals consistent across concurrent readers.
    tx.set(countRef,{
      memberUid:uid,gender:genderOf(member.data()),
      total:FieldValue.increment(amount),
      updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
    tx.set(dailyRef,{
      dayUTC:dateUTC,
      total:FieldValue.increment(amount),
      updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
    tx.set(globalRef,{
      totalRecitations:FieldValue.increment(amount),
      updatedAt:FieldValue.serverTimestamp()
    },{merge:true});
  });
  return {recorded:amount,dayUTC:dateUTC};
});


// Member prayer tracking: one dated document per person in a private server-write collection.
const prayerNames = ["fajr","dhuhr","asr","maghrib","isha"];
const prayerModes = ["jamat","solo","made","missed","clear"];
function validateDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpsError("invalid-argument","Date must be YYYY-MM-DD.");
  }
  const date = new Date(value+"T00:00:00Z");
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value ||
      date.getTime() > Date.now()+24*60*60*1000 ||
      date.getTime() < Date.now()-366*24*60*60*1000) {
    throw new HttpsError("invalid-argument","Invalid or unsupported prayer date.");
  }
  return value;
}
exports.savePrayerDay = onCall({region,maxInstances:10},async request => {
  const uid=ensureMember(request);
  await ensureLiveSession(request,uid);
  const date=validateDate(request.data?.date);
  const statuses=request.data?.statuses;
  if(!statuses || typeof statuses!=="object" || Array.isArray(statuses) ||
      Object.keys(statuses).some(key=>!prayerNames.includes(key)) ||
      Object.values(statuses).some(value=>!prayerModes.includes(value))) {
    throw new HttpsError("invalid-argument","Invalid prayer status.");
  }
  await db.doc("memberPrivate/"+uid+"/prayers/"+date).set({
    date,statuses,updatedAt:FieldValue.serverTimestamp()
  });
  return {date,statuses};
});
exports.getPrayerMonth = onCall({region,maxInstances:10},async request => {
  const uid=ensureMember(request);
  await ensureLiveSession(request,uid);
  const month=request.data?.month;
  if(typeof month!=="string" || !/^\d{4}-(0[1-9]|1[012])$/.test(month)) {
    throw new HttpsError("invalid-argument","Month must be YYYY-MM.");
  }
  const start=new Date(month+"-01T00:00:00Z");
  if(start.getTime()>Date.now()+31*24*3600*1000 ||
      start.getTime()<Date.now()-366*24*3600*1000) {
    throw new HttpsError("invalid-argument","Month is out of range.");
  }
  const n=new Date(start.getUTCFullYear(),start.getUTCMonth()+1,0).getUTCDate();
  const refs=Array.from({length:n},(_,i)=>db.doc("memberPrivate/"+uid+"/prayers/"+month+"-"+String(i+1).padStart(2,"0")));
  const snaps=await db.getAll(...refs);
  return {month,days:snaps.filter(s=>s.exists).map(s=>({
    date:s.get("date"),statuses:s.get("statuses")
  }))};
});
exports.getLeaderboard = onCall({region,maxInstances:10},async request => {
  const uid=ensureMember(request);
  await ensureLiveSession(request,uid);
  const viewer=await members.doc(uid).get();
  const gender=genderOf(viewer.data());
  const snapshots=await db.collection("memberCounts").where("gender","==",gender).limit(200).get();
  const ranked=snapshots.docs.sort((a,b)=>Number(b.get("total")||0)-Number(a.get("total")||0)).slice(0,10);
  const rows=await Promise.all(ranked.map(async count => {
    const profile=await members.doc(count.id).get();
    if(!profile.exists || profile.get("disabled")===true || genderOf(profile.data())!==gender)return null;
    const total=count.get("total");
    return {
      name:profile.get("name") || "Member",
      serial:profile.get("serial"),
      total:Number.isSafeInteger(total)?total:0
    };
  }));
  return {leaders:rows.filter(Boolean)};
});
exports.getMyReferrals = onCall({region,maxInstances:10},async request => {
  const uid=ensureMember(request);
  await ensureLiveSession(request,uid);
  const children=await members.where("inviterUid","==",uid).limit(200).get();
  return {referrals:children.docs.map(doc=>({
    serial:doc.get("serial"),name:doc.get("name"),disabled:doc.get("disabled")===true
  })).sort((a,b)=>Number(a.serial?.split("-")[1]||0)-Number(b.serial?.split("-")[1]||0))};
});
exports.getCommunitySummary = onCall({region,maxInstances:10},async request => {
  const uid=ensureMember(request);
  await ensureLiveSession(request,uid);
  const [counterSnap,totalsSnap]=await Promise.all([
    counter.get(),db.doc("publicStats/global").get()
  ]);
  return {
    totalAccounts:Number(counterSnap.get("lastNumber")||0),
    totalRecitations:Number(totalsSnap.get("totalRecitations")||0)
  };
});
