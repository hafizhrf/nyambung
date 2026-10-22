import { useState, useEffect } from 'react';

const clips = {
  tap: { file: 'click1', volume: .16 },
  submit: { file: 'switch6', volume: .18 },
  result: { file: 'switch10', volume: .22 },
  reward: { file: 'switch33', volume: .23 },
  error: { file: 'switch4', volume: .14 },
  next: { file: 'switch2', volume: .18 },
} as const;
type Cue = keyof typeof clips;

class GameAudio {
  enabled: boolean;
  private context?: AudioContext;
  private buffers = new Map<string, Promise<AudioBuffer>>();
  private sources = new Set<AudioBufferSourceNode>();
  private generation = 0;

  constructor(enabled: boolean) { this.enabled = enabled; }

  // Called from a user gesture, before awaiting a request, for mobile autoplay rules.
  unlock = () => {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => {});
      for (const { file } of Object.values(clips)) void this.buffer(file).catch(() => {});
    } catch { /* Audio is optional; never interrupt the game. */ }
  };

  private buffer(file: string): Promise<AudioBuffer> {
    let buffer = this.buffers.get(file);
    if (!buffer) {
      buffer = fetch(`/audio/kenney/${file}.wav`)
        .then(response => { if (!response.ok) throw new Error('Audio unavailable'); return response.arrayBuffer(); })
        .then(bytes => this.context!.decodeAudioData(bytes))
        .catch(error => { this.buffers.delete(file); throw error; });
      this.buffers.set(file, buffer);
    }
    return buffer;
  }

  play = (cue: Cue) => {
    if (!this.enabled || document.hidden) return;
    this.unlock();
    const context = this.context;
    if (!context) return;
    const generation = this.generation;
    const requestedAt = performance.now();
    const clip = clips[cue];
    void this.buffer(clip.file).then(buffer => {
      if (!this.enabled || generation !== this.generation || document.hidden || context.state !== 'running' || performance.now() - requestedAt > 1000) return;
      const notes = cue === 'reward' ? [1, 1.2, 1.45] : [1];
      notes.forEach((rate, index) => {
        const source = context.createBufferSource();
        const gain = context.createGain();
        source.buffer = buffer;
        source.playbackRate.value = rate;
        gain.gain.value = clip.volume / (cue === 'reward' ? 1.5 : 1);
        source.connect(gain).connect(context.destination);
        source.onended = () => { this.sources.delete(source); source.disconnect(); gain.disconnect(); };
        this.sources.add(source);
        source.start(context.currentTime + index * .075);
      });
    }).catch(() => {});
  };

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  private stop() {
    this.generation++;
    for (const source of this.sources) { try { source.stop(); } catch { /* Already ended. */ } }
    this.sources.clear();
  }

  dispose() { this.stop(); if (this.context) void this.context.close().catch(() => {}); this.context = undefined; this.buffers.clear(); }
}

export function useGameAudio() {
  const [enabled, setEnabled] = useState(() => { try { return localStorage.getItem('nyambung-sound') !== 'off'; } catch { return true; } });
  const [audio] = useState(() => new GameAudio(enabled));
  useEffect(() => () => audio.dispose(), [audio]);
  function toggle() {
    const next = !enabled;
    audio.setEnabled(next);
    setEnabled(next);
    try { localStorage.setItem('nyambung-sound', next ? 'on' : 'off'); } catch { /* Optional preference. */ }
    if (next) audio.play('tap');
  }
  return { enabled, toggle, unlock: audio.unlock, play: audio.play };
}
