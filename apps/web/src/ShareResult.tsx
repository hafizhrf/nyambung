import { useEffect, useState } from 'react';
import { DownloadIcon, Share2Icon } from './PixelIcons';
import type { RunView } from '@nyambung/shared';
import { createResultImage } from './shareImage';
import { platform } from './platform';

export function ShareResult({ run }: { run: RunView }) {
  const [image, setImage] = useState<{file:File;url:string} | null>(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [sharing, setSharing] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let cancelled=false, url:string|undefined;
    setImage(null);setError('');setStatus('');
    createResultImage(run).then(file => {
      if(cancelled) return;
      url=URL.createObjectURL(file);setImage({file,url});
    }).catch(() => {if(!cancelled)setError('Gambar belum bisa dibuat. Coba lagi.');});
    return () => {cancelled=true;if(url)URL.revokeObjectURL(url);};
  },[run.id,retry]);
  async function share() {
    if(!image || sharing) return;
    setSharing(true);setError('');
    try {const result=await platform.share(image.file);setStatus(result==='shared'?'Gambar dibagikan.':'Gambar diunduh.');}
    catch(error) {if((error as Error).name!=='AbortError')setError('Belum bisa dibagikan. Gunakan Unduh gambar.');}
    finally {setSharing(false);}
  }
  return <div className="share-image">
    {image ? <><img className="share-image-preview" src={image.url} width={1080} height={1350} alt="Kartu skor Nyambung"/>
      <div className="share-image-actions"><button className="primary-button" disabled={sharing} onClick={() => void share()}><Share2Icon width={18} height={18} aria-hidden="true"/>{sharing?'Membuka…':'Bagikan gambar'}</button><a className="secondary-button" href={image.url} download={image.file.name} onClick={() => setStatus('Gambar diunduh.')}><DownloadIcon width={18} height={18} aria-hidden="true"/>Unduh gambar</a></div>
      <p className="share-image-note" role="status">{status || 'PNG'}</p></> : !error && <p role="status">Menyiapkan gambar…</p>}
    {error && <p className="error-message" role="alert">{error} {!image && <button onClick={() => setRetry(value=>value+1)}>Coba lagi</button>}</p>}
  </div>;
}
