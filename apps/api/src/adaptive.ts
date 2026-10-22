// Small supervised difficulty model. Ridge regression learns expected score from
// historical outcomes; it never changes a published word's score or validity.
export const FEATURE_VERSION = 'difficulty-ridge-v1';
export const FEATURE_COUNT = 8;
const PRIOR = [.55,-.08,.16,.08,-.05,.05,-.03,.02];
export interface Observation { features:number[]; outcome:number; weight?:number }
export interface DifficultyModel { version:typeof FEATURE_VERSION; samples:number; weights:number[] }
export function validFeatures(values:unknown):values is number[] {
  return Array.isArray(values) && values.length===FEATURE_COUNT && values.every(v=>Number.isFinite(v)&&Math.abs(v)<=1);
}
export function trainDifficulty(observations:Observation[]):DifficultyModel {
  const lambda=8;
  const a=Array.from({length:FEATURE_COUNT},(_,i)=>Array.from({length:FEATURE_COUNT},(_,j)=>i===j?lambda:0));
  const b=PRIOR.map(value=>lambda*value);
  let samples=0;
  for(const row of observations) {
    if(!validFeatures(row.features)||!Number.isFinite(row.outcome)||row.outcome<0||row.outcome>1) continue;
    const weight=Math.max(.1,Math.min(3,row.weight??1));samples++;
    for(let i=0;i<FEATURE_COUNT;i++) {
      b[i]+=weight*row.features[i]*row.outcome;
      for(let j=0;j<FEATURE_COUNT;j++) a[i][j]+=weight*row.features[i]*row.features[j];
    }
  }
  // Gaussian elimination; positive ridge regularization keeps A nonsingular.
  const matrix=a.map((row,i)=>[...row,b[i]]);
  for(let i=0;i<FEATURE_COUNT;i++) {
    const pivot=matrix[i][i];for(let j=i;j<=FEATURE_COUNT;j++) matrix[i][j]/=pivot;
    for(let k=0;k<FEATURE_COUNT;k++) if(k!==i) {
      const factor=matrix[k][i];for(let j=i;j<=FEATURE_COUNT;j++) matrix[k][j]-=factor*matrix[i][j];
    }
  }
  return {version:FEATURE_VERSION,samples,weights:matrix.map(row=>row[FEATURE_COUNT])};
}
export function predictDifficulty(model:DifficultyModel,features:number[]):number {
  return Math.max(.05,Math.min(.95,features.reduce((sum,value,i)=>sum+value*model.weights[i],0)));
}
