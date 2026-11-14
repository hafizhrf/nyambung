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
// Fast membership test against a few anchor words over a whole dictionary.
// Every derived form is a substring of its word, except nasal-restored roots
// (menyapu → sapu), whose tail after the first letter still is; so a word that
// contains none of those keys cannot share a form and skips the full check.
export function familyMatcher(anchors:string[]):(word:string)=>boolean {
 const keys=new Set<string>();
 for(const anchor of anchors) for(const form of forms(anchor)) {keys.add(form);if(/^[sktp]/.test(form)&&form.length>4) keys.add(form.slice(1));}
 return word=>{
  if(anchors.includes(word)) return true;
  if(![...keys].some(key=>word.includes(key))&&!anchors.some(anchor=>anchor.includes(word))) return false;
  return anchors.some(anchor=>sameWordFamily(word,anchor));
 };
}

// Strict derivation for scoring: word = prefix + exact root (with meN-/peN-
// assimilation) + suffix. Unlike forms(), it never strips borrowed endings
// (kapas ≠ kapasitas) and allows -kan/-i only with a prefix (peta ≠ petai).
const PLAIN_SUFFIXES=['','an','nya','ku','mu','lah','kah','annya'];
const VERB_SUFFIXES=['kan','i','kannya','inya','kanlah'];
function stems(root:string,prefix:'me'|'pe'):string[] {
 const out=[prefix+root];
 for(const nasal of ['m','n','ng','ny','nge']) out.push(prefix+nasal+root);
 // Voiceless initials melt: pukul → memukul, tulis → menulis, sapu → menyapu, kupas → mengupas.
 const melted={k:'ng',p:'m',t:'n',s:'ny'}[root[0]];
 if(melted) out.push(prefix+melted+root.slice(1));
 return out;
}
function derivedStems(root:string):{stem:string;prefixed:boolean}[] {
 const r=root.startsWith('r');
 const prefixed=[
  ...['ber','ter','per'].map(p=>(r?p.slice(0,2):p)+root),
  'di'+root,'ke'+root,'se'+root,'memper'+root,'diper'+root,
  ...stems(root,'me'),...stems(root,'pe'),
 ];
 return [{stem:root,prefixed:false},...prefixed.map(stem=>({stem,prefixed:true}))];
}
export function isDerivedForm(word:string,root:string):boolean {
 if(word===root||root.length<3||!word.includes(root.slice(1))) return false;
 return derivedStems(root).some(({stem,prefixed})=>word.startsWith(stem)&&
  [...PLAIN_SUFFIXES,...(prefixed?VERB_SUFFIXES:[])].some(suffix=>word===stem+suffix));
}
export function hasWordFamilyCollision(words:string[]):boolean {
 return words.some((word,i)=>words.slice(i+1).some(other=>sameWordFamily(word,other)));
}
