// Safely normalize the previously browser-only Qaza plan for private cloud sync.
// Keep independent of Firebase so the migration can be regression-tested with Node.
export const QAZA_PRAYERS=["fajr","dhuhr","asr","maghrib","isha"];
export const QAZA_MIN_DAY="1900-01-01";
export const QAZA_MAX_TARGET=1000000;
export const QAZA_MAX_ENTRIES=3000;
export function validQazaDay(value){
  if(typeof value!=="string"||!/^(19|20)\d{2}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(value))return false;
  const date=new Date(value+"T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0,10)===value;
}
export function normalizeQazaPlan(raw){
  const input=raw&&typeof raw==="object"&&!Array.isArray(raw)?raw:{};
  const start=validQazaDay(input.start)?input.start:"";
  const target=Number(input.target);
  const normalized={start,target:Number.isSafeInteger(target)&&target>=0&&target<=QAZA_MAX_TARGET?target:0,done:{}};
  for(const prayer of QAZA_PRAYERS){
    const records=input.done?.[prayer];
    if(!records||typeof records!=="object"||Array.isArray(records))continue;
    const days=Object.keys(records).filter(day=>validQazaDay(day) && day>=QAZA_MIN_DAY &&
      (records[day]===true || records[day]===1)).sort();
    if(days.length>QAZA_MAX_ENTRIES)throw Error("قضا نمازوں کا ریکارڈ مقررہ حد سے زیادہ ہے؛ کوئی اندراج حذف نہیں کیا گیا۔");
    if(days.length)normalized.done[prayer]=Object.fromEntries(days.map(day=>[day,true]));
  }
  return normalized;
}
export function hasQazaPlanData(value){
  const plan=normalizeQazaPlan(value);
  return Boolean(plan.start||plan.target||Object.values(plan.done).some(x=>Object.keys(x).length));
}
