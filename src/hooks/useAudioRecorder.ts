import { useState, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface UseAudioRecorderReturn {
  isRecording: boolean;
  audioBlob: Blob | null;
  transcribedText: string;
  startRecording: () => Promise<void>;
  stopRecording: () => void;
  resetRecording: () => void;
  uploadAudio: (clientId: number | string) => Promise<string | null>;
}

export function useAudioRecorder(): UseAudioRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [transcribedText, setTranscribedText] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const recognitionRef = useRef<any>(null);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];

      recorder.ondataavailable = (e) => chunksRef.current.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Start Web Speech API for Arabic transcription
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.lang = "ar-EG";
        recognition.continuous = true;
        recognition.interimResults = false;

        recognition.onresult = (event: any) => {
          let text = "";
          for (let i = 0; i < event.results.length; i++) {
            text += event.results[i][0].transcript + " ";
          }
          setTranscribedText((prev) => (prev + " " + text).trim());
        };

        recognition.onerror = () => {
          // Speech recognition not critical, silently fail
        };

        recognition.start();
        recognitionRef.current = recognition;
      }
    } catch {
      throw new Error("لا يمكن الوصول للميكروفون");
    }
  }, []);

  const stopRecording = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {}
      recognitionRef.current = null;
    }
    setIsRecording(false);
  }, []);

  const resetRecording = useCallback(() => {
    setAudioBlob(null);
    setTranscribedText("");
    chunksRef.current = [];
  }, []);

  const uploadAudio = useCallback(
    async (clientId: number | string): Promise<string | null> => {
      if (!audioBlob) return null;
      const fileName = `${clientId}_${Date.now()}.webm`;
      const { error } = await supabase.storage
        .from("call-recordings")
        .upload(fileName, audioBlob, { contentType: "audio/webm" });
      if (error) throw error;
      const { data: urlData } = supabase.storage
        .from("call-recordings")
        .getPublicUrl(fileName);
      return urlData.publicUrl;
    },
    [audioBlob]
  );

  return {
    isRecording,
    audioBlob,
    transcribedText,
    startRecording,
    stopRecording,
    resetRecording,
    uploadAudio,
  };
}
