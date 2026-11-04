export function createRestChime() {
  let context: AudioContext | null = null;
  async function prepare() {
    try {
      if (typeof window.AudioContext !== 'function') return false;
      context ??= new window.AudioContext();
      if (context.state === 'suspended') await context.resume();
      return context.state === 'running';
    } catch {
      return false;
    }
  }
  function playTones() {
    if (!context || context.state !== 'running') return false;
    const now = context.currentTime;
    [659.25, 880].forEach((frequency, index) => {
      const oscillator = context!.createOscillator();
      const gain = context!.createGain();
      const at = now + index * 0.22;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0, at);
      gain.gain.linearRampToValueAtTime(0.16, at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.001, at + 0.45);
      oscillator.connect(gain);
      gain.connect(context!.destination);
      oscillator.start(at);
      oscillator.stop(at + 0.48);
      oscillator.onended = () => {
        oscillator.disconnect();
        gain.disconnect();
      };
    });
    return true;
  }
  function dispose() {
    if (context) void context.close().catch(() => {});
    context = null;
  }
  function play() {
    try {
      return playTones();
    } catch {
      return false;
    }
  }
  return { prepare, play, dispose };
}
