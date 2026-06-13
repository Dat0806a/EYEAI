// TTS helper for EyeTalk Assistant to speak Vietnamese out loud

export function speakVietnamese(text: string) {
  if (!('speechSynthesis' in window)) {
    console.warn('Speech synthesis not supported in this browser.');
    return;
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  
  // Try to find a Vietnamese voice
  const voices = window.speechSynthesis.getVoices();
  const viVoice = voices.find(v => v.lang.startsWith('vi') || v.lang.includes('Vietnam'));
  
  if (viVoice) {
    utterance.voice = viVoice;
  }
  
  utterance.lang = 'vi-VN';
  utterance.pitch = 1.0;
  utterance.rate = 0.9; // Spoken slightly slower for clear comprehension by caregivers
  
  window.speechSynthesis.speak(utterance);
}
