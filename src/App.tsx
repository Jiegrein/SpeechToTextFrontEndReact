import './App.css';
import axios from 'axios';
import 'bootstrap/dist/css/bootstrap.min.css';
import React, { useState, useRef, useEffect } from 'react';

interface TranscriptionEntry {
  time: string;
  text: string;
  speakerName: string;
}

interface SpeechRecognitionState {
  isRecording: boolean;
  isProcessing: boolean;
  currentText: string;
  error: string | null;
  entries: TranscriptionEntry[];
  startRecordEverPressed: boolean;
  logs: string[];
}

const SpeechRecognizer: React.FC = () => {
  const [state, setState] = useState<SpeechRecognitionState>({
    isRecording: false,
    isProcessing: false,
    currentText: '',
    error: null,
    entries: [],
    startRecordEverPressed: false,
    logs: []
  });
  const wsRef = useRef<WebSocket | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);

  const client = axios.create({
    baseURL: import.meta.env.VITE_BACKEND_URL,
  });

  const receiveTranscribedMessage = (message: string) => {
    const [status, time, text, speakerName] = message.split('|');
    if (text.trim()) {
      if (status == "Transcribing"){
        setState(prev => ({
          ...prev,
          currentText: text
        }));
      }
      else {
        const entry = {
          time,
          text,
          speakerName
        };
        setState(prev => ({
          ...prev,
          entries: [...prev.entries, entry],
          currentText: text
        }));
      }
    }      
  };

  const startRecording = async () => {
    try {
      setState(prev => ({
        ...prev,
        logs: [...prev.logs, "WebSocket trying to connect"],
        currentText: "Connecting" 
      }));
      if (!state.isRecording) {
        // Create WebSocket connection
        wsRef.current = new WebSocket(`ws://${import.meta.env.VITE_WS_URL}/ws`);

        // Get media stream 
        var mimeType = 'audio/webm;codecs=opus';
        if (!MediaRecorder.isTypeSupported(mimeType)) {          
          setState(prev => ({
            ...prev,
            logs: [...prev.logs, "WebSocket trying to connect"],
            currentText: `${mimeType} not supported using 'audio/mp4'`
          }));
          mimeType = 'audio/mp4';          
        }
        let stream: MediaStream
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            audio: {
              sampleRate: 16000,
              channelCount: 1,
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            },
          });
        } catch (err) {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        }
        mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: mimeType, audioBitsPerSecond: 96000});

        // Set up WebSocket handlers
        wsRef.current.onopen = () => {
          console.log("WebSocket connection opened.");
          setState(prev => ({
            ...prev,
            logs: [...prev.logs, "WebSocket connection opened."],
            currentText: "Connected!"
          }));
        };

        wsRef.current.onmessage = (e) => {
          console.log("Received message:", e.data);
          receiveTranscribedMessage(e.data);
        };

        // Set up MediaRecorder handlers
        mediaRecorderRef.current.ondataavailable = (e) => {
          if (e.data.size > 0 && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(e.data);
            console.log(e.data);            
            setState(prev => ({
              ...prev,
              logs: [...prev.logs, `Blob { size: ${e.data.size}, type: "${e.data.type}" }`],
            }));
          }
        };

        // Start recording
        mediaRecorderRef.current.start(2000);

        setState(prev => ({
          ...prev,
          isRecording: true
        }));
      }
    } catch (error) {
      console.error("Error accessing microphone:", error);
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: 'Failed to start recording',
        logs: [...prev.logs, `'Failed to start recording' ${error}` ],
      }));
    }
  };

  const stopRecording = async () => {
    try {
      if (state.isRecording) {
        // Stop MediaRecorder
        if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
        }

        // Close WebSocket
        if (wsRef.current) {
          wsRef.current.close();
          wsRef.current.onclose = () => {
            console.log("WebSocket connection closed.");
            setState(prev => ({
              ...prev,
              logs: [...prev.logs, "WebSocket connection closed."],
              currentText: "WebSocket connection closed"
            }));
          };
        }

        setState(prev => ({
          ...prev,
          isRecording: false,
          currentText: '',
          startRecordEverPressed: true
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        error: 'Failed to stop recording'
      }));
    }
  };

  const downloadLatestRecording = async () => {
    if (!state.isRecording) {
      try {
        const response = await client.get('/download/', { responseType: 'blob' });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', 'recording.txt');
        document.body.appendChild(link);
        link.click();
        link.remove();
      } catch (error) {
        console.error('Failed to download recording:', error);
      }
    }
  };

  // Cleanup on component unmount
  useEffect(() => {
    return () => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === "recording") {
        mediaRecorderRef.current.stop();
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      }
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, []);

  return (
    <div className="page-container">
      <div className="card">
        <div className="card-body">
          <div className="card-body text-center">
            <div className="speech-recognition-container">
              <h3><b>Speech Recorder</b></h3>
              <button
                className="btn btn-success"
                onClick={startRecording}
                disabled={state.isProcessing}
              >
                Start Recording
              </button>

              <button
                className="btn btn-danger"
                onClick={stopRecording}
                disabled={state.isProcessing}
              >
                Stop Recording
              </button>

              {state.isRecording ? (
                <div className="recording-status mt-2">
                  <div className="pulse-indicator"></div>
                  <span>Recording...</span>
                  {state.currentText && (
                    <div className="current-text">
                      {state.currentText}
                    </div>
                  )}
                </div>
              ) : (
                <div className="recording-status mt-2">
                  <div className="pulse-indicator"></div>
                  <span>Recording stopped</span>
                  {state.startRecordEverPressed && (
                    <div className="recording-status mt-2">
                      <button
                        className="btn btn-primary"
                        onClick={downloadLatestRecording}
                      >
                        Download Latest Recording
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
          <div className="transcription-list">
            <h5><b>Transcription Result</b></h5>
            {state.entries.map((entry, index) => (
              <div key={index} className="card bg-light mb-3">
                <div className="card-body">
                  <span className="timestamp" style={{ color: 'grey' }}>
                    Start time : {entry.time}
                  </span>
                  <br />
                  <span className="text">{entry.text}</span>
                  <br />
                  <b>
                    <span className="text" style={{ color: 'deepskyblue' }}>
                      Speaker : {entry.speakerName}
                    </span>
                  </b>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SpeechRecognizer;