// One trusted server instant anchors both publication time and the financial day.
export function publicationMetadata(instant:Date){
 const updatedAt=instant.toISOString();
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(instant);
 const value=(type:string)=>parts.find(p=>p.type===type)!.value;
 return {updatedAt,asOf:`${value('year')}-${value('month')}-${value('day')}`};
}
