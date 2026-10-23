// A conservative generation filter, not a stemmer for players' answers.
// Forms stay separate dictionary entries with their original published scores.
const cache=new Map<string,Set<string>>();
function forms(word:string):Set<string> {
 const existing=cache.get(word);if(existing) return existing;
 const result=new Set([word]);let frontier=[word];
 for(let depth=0;depth<2;depth++) {
  const next:string[]=[];
  const add=(value:string)=>{if(value.length>=4&&!result.has(value)){result.add(value);next.push(value);}};
  for(const value of frontier) {
   for(const suffix of ['nya','lah','kah','pun','ku','mu','kan','an','i','in','itas','isasi','isme','is','al','tual']) if(value.endsWith(suffix)) add(value.slice(0,-suffix.length));
   for(const prefix of ['memper','diper','ber','ter','per','di','ke','se','me','pe','bel','pel']) if(value.startsWith(prefix)) add(value.slice(prefix.length));
   for(const [prefix,restored] of [['meny','s'],['peny','s'],['meng','k'],['peng','k'],['men','t'],['pen','t'],['mem','p'],['pem','p']]) if(value.startsWith(prefix)) {
    const tail=value.slice(prefix.length);add(tail);if(/^[aiueo]/.test(tail)) add(restored+tail);
   }
  }
  frontier=next;
 }
 if(cache.size>=20000) cache.clear();cache.set(word,result);return result;
}
export function sameWordFamily(a:string,b:string):boolean {
 if(a===b) return true;
 // Borrowed extensions such as intelek/intelektual also reveal the same word.
 const shorter=a.length<b.length?a:b,longer=a.length<b.length?b:a;
 if(shorter.length>=5 && longer.startsWith(shorter) && shorter.length/longer.length>=.5) return true;
 const left=forms(a),right=forms(b);
 return [...left].some(form=>right.has(form));
}
export function hasWordFamilyCollision(words:string[]):boolean {
 return words.some((word,i)=>words.slice(i+1).some(other=>sameWordFamily(word,other)));
}
