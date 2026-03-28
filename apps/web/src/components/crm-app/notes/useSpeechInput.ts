"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechStatus = "idle" | "recording" | "unavailable" | "denied" | "error";
type BrowserSpeechRecognitionConstructor = new () => BrowserSpeechRecognition;
type BrowserSpeechRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((event: BrowserSpeechRecognitionEvent) => void) | null;
  onerror: ((event: BrowserSpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
  abort: () => void;
};
type BrowserSpeechRecognitionEvent = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};
type BrowserSpeechRecognitionErrorEvent = {
  error: string;
};

/** Browser-based speech-to-text hook using the Web Speech API. */
export function useSpeechInput(lang: string) {
  const [status, setStatus] = useState<SpeechStatus>("idle");
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<BrowserSpeechRecognition | null>(null);
  const onResultRef = useRef<(text: string) => void>(() => {});
  const shouldRestartRef = useRef(false);

  function getSpeechRecognitionConstructor(): BrowserSpeechRecognitionConstructor | null {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition ?? window.webkitSpeechRecognition ?? null;
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSupported(!!getSpeechRecognitionConstructor());
    }, 0);

    return () => {
      window.clearTimeout(timer);
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
        recognitionRef.current = null;
      }
    };
  }, []);

  const start = useCallback(
    (onResult: (text: string) => void) => {
      const SR = getSpeechRecognitionConstructor();
      if (!SR) {
        setStatus("unavailable");
        return;
      }

      // Stop any existing session
      if (recognitionRef.current) {
        try { recognitionRef.current.abort(); } catch {}
        recognitionRef.current = null;
      }

      const recognition = new SR();
      recognition.lang = lang === "en" ? "en-US" : "de-DE";
      recognition.interimResults = false;
      recognition.continuous = true;
      recognition.maxAlternatives = 1;

      onResultRef.current = onResult;
      shouldRestartRef.current = true;

      recognition.onresult = (event: BrowserSpeechRecognitionEvent) => {
        let transcript = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript;
          }
        }
        if (transcript) {
          onResultRef.current(transcript);
        }
      };

      recognition.onerror = (event: BrowserSpeechRecognitionErrorEvent) => {
        if (event.error === "not-allowed") {
          setStatus("denied");
        } else if (event.error === "aborted") {
          // Intentional stop — don't mark as error
          setStatus("idle");
        } else {
          setStatus("error");
        }
        shouldRestartRef.current = false;
        recognitionRef.current = null;
      };

      recognition.onend = () => {
        // Auto-restart if still in recording mode (browser sometimes stops after silence)
        if (recognitionRef.current === recognition && shouldRestartRef.current) {
          try {
            recognition.start();
            return;
          } catch {}
        }
        recognitionRef.current = null;
        setStatus("idle");
      };

      try {
        recognition.start();
        recognitionRef.current = recognition;
        setStatus("recording");
      } catch {
        shouldRestartRef.current = false;
        setStatus("error");
      }
    },
    [lang],
  );

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.stop(); } catch {}
      recognitionRef.current = null;
    }
    setStatus("idle");
  }, []);

  return { status, supported, start, stop };
}

/** Extend Window to include vendor-prefixed SpeechRecognition. */
declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechRecognitionConstructor;
    webkitSpeechRecognition?: BrowserSpeechRecognitionConstructor;
  }
}
