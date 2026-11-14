import { useEffect, useState } from 'react';
import type { StageResult, StageTopAnswers } from '@nyambung/shared';
import { api } from './api';
const num = (value: number) => new Intl.NumberFormat('id-ID').format(value);

export function TopAnswers({ runId, result }: { runId: string; result: StageResult }) {
  const [data, setData] = useState<StageTopAnswers | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let disposed = false;
    setLoading(true); setError(''); setData(null);
    api<StageTopAnswers>(`/runs/${encodeURIComponent(runId)}/stages/${result.index}/top-answers`)
      .then(value => { if (!disposed) setData(value); })
      .catch(() => { if (!disposed) setError('Daftar kata belum bisa dimuat.'); })
      .finally(() => { if (!disposed) setLoading(false); });
    return () => { disposed = true; };
  }, [runId, result.index, attempt]);
  return <div className="top-answers">
    <p className="top-answers-intro">{data?.referenceOnly?'Hingga lima jawaban rujukan':'Kata dengan skor tertinggi'} untuk petunjuk babak {result.index + 1}.</p>
    {loading && <p role="status" className="help-small">Memuat 5 kata terbaik…</p>}
    {error && <p role="alert" className="error-message">{error} <button type="button" onClick={() => setAttempt(value => value + 1)}>Coba lagi</button></p>}
    {data && <ol className="top-answers-list" aria-label="5 kata terbaik">
      {data.answers.map((answer, index) => <li key={answer.word} data-own={answer.word === result.word ? 'true' : undefined}>
        <span className="top-answer-number" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span>
        <span className="top-answer-word">{answer.word}{answer.word === result.word && <small>Jawabanmu</small>}</span>
        <strong>{num(answer.score)}<small> / 1.000</small></strong>
      </li>)}
    </ol>}
    {data?.referenceOnly && data.answers.length<5 && <p className="help-small">Ada {data.answers.length} jawaban rujukan untuk babak ini. Jawaban lain tetap bisa mendapat poin.</p>}
    {data && result.word && <p className="top-answers-own">Jawabanmu: <strong>{result.word}</strong> · {num(result.score)} poin</p>}
  </div>;
}
