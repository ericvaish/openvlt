"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { Persona, type PersonaState } from "@/components/ai/persona"
import {
  Volume2,
  VolumeX,
  Phone,
  PhoneOff,
  Mic,
  MicOff,
} from "lucide-react"
import { cn } from "@/lib/utils"

type Message = {
  role: "user" | "assistant"
  content: string
}

type SessionState = "off" | "loading" | "ready"
type MicMode = "auto" | "muted"

// VAD config
const SILENCE_THRESHOLD = 0.02
const SPEECH_THRESHOLD = 0.04
const SILENCE_DURATION_MS = 1800
const MIN_SPEECH_DURATION_MS = 600
const SPEECH_CONFIRM_FRAMES = 8
const POST_TTS_COOLDOWN_MS = 800

// Voice interrupt during AI speech — configurable via slider
// On a laptop, speaker bleed through the mic after echo cancellation is typically RMS 0.01-0.03
// A human speaking directly into the mic at normal volume is typically RMS 0.05-0.15+
const DEFAULT_INTERRUPT_THRESHOLD = 0.08
const INTERRUPT_CONFIRM_FRAMES = 10 // ~160ms of sustained speech to confirm interrupt

// Whisper hallucination filters
const BLANK_PATTERNS = [
  /^\[.*\]$/i,
  /^\.+$/,
  /^\s*$/,
  /^you$/i,
  /^thank you\.?$/i,
  /^thanks for watching\.?$/i,
  /^bye\.?$/i,
  /^okay\.?$/i,
  /^oh\.?$/i,
  /^uh\.?$/i,
  /^um\.?$/i,
  /^hmm\.?$/i,
]

function isBlankTranscript(text: string): boolean {
  const t = text.trim()
  if (t.length < 3) return true
  return BLANK_PATTERNS.some((p) => p.test(t))
}

// Whisper model options — all run in-browser via ONNX/WASM
const WHISPER_MODELS = [
  {
    id: "onnx-community/whisper-tiny",
    name: "Tiny",
    params: "39M",
    size: "~75 MB",
    speed: "Fastest",
    quality: "Basic",
  },
  {
    id: "onnx-community/whisper-base",
    name: "Base",
    params: "74M",
    size: "~150 MB",
    speed: "Fast",
    quality: "Good",
  },
  {
    id: "onnx-community/whisper-small",
    name: "Small",
    params: "244M",
    size: "~500 MB",
    speed: "Moderate",
    quality: "Great",
  },
  {
    id: "onnx-community/whisper-medium",
    name: "Medium",
    params: "769M",
    size: "~1.5 GB",
    speed: "Slow",
    quality: "Excellent",
  },
  {
    id: "onnx-community/whisper-large-v3-turbo",
    name: "Large v3 Turbo",
    params: "809M",
    size: "~1.6 GB",
    speed: "Slow",
    quality: "Best",
  },
] as const

type WhisperModelId = (typeof WHISPER_MODELS)[number]["id"]

// Voice-optimized system message prepended to conversations
const VOICE_SYSTEM_PREFIX = {
  role: "system" as const,
  content: `You are in a voice conversation. Keep your responses natural, conversational, and concise (1-3 sentences). Avoid bullet points, markdown, code blocks, or lists since your response will be read aloud. Speak like a friendly human, not a textbook. If asked a complex question, give a brief answer first and offer to elaborate.`,
}

export default function VoiceV2Page() {
  const [messages, setMessages] = useState<Message[]>([])
  const [personaState, setPersonaState] = useState<PersonaState>("asleep")
  const [sessionState, setSessionState] = useState<SessionState>("off")
  const [isSpeakerMuted, setIsSpeakerMuted] = useState(false)
  const [micMode, setMicMode] = useState<MicMode>("auto")
  const [statusText, setStatusText] = useState("Start a conversation")
  const [currentTranscript, setCurrentTranscript] = useState("")
  const [aiResponse, setAiResponse] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [volumeLevel, setVolumeLevel] = useState(0)
  const [debugRMS, setDebugRMS] = useState(0)
  const [showDebug, setShowDebug] = useState(false)
  const [interruptThreshold, setInterruptThreshold] = useState(DEFAULT_INTERRUPT_THRESHOLD)
  const [whisperModel, setWhisperModel] = useState<WhisperModelId>("onnx-community/whisper-tiny")
  const [whisperStatus, setWhisperStatus] = useState<"idle" | "loading" | "ready" | "error">("idle")
  const [whisperLoadProgress, setWhisperLoadProgress] = useState("")

  // Refs
  const transcriberRef = useRef<any>(null)
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const messagesRef = useRef<Message[]>([])

  // VAD refs
  const streamRef = useRef<MediaStream | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])
  const vadFrameRef = useRef<number>(0)
  const isSpeakingRef = useRef(false)
  const silenceStartRef = useRef<number>(0)
  const speechStartRef = useRef<number>(0)
  const speechConfirmCountRef = useRef(0)
  const isListeningRef = useRef(false)
  const isProcessingRef = useRef(false)
  const isTTSSpeakingRef = useRef(false)
  const ttsCooldownUntilRef = useRef(0)
  const abortControllerRef = useRef<AbortController | null>(null)
  const isSpeakerMutedRef = useRef(false)
  const micModeRef = useRef<MicMode>("auto")

  // Track interrupted AI response for resume-on-blank
  const interruptedResponseRef = useRef<string | null>(null)
  const wasInterruptRef = useRef(false)

  // Track TTS progress so we can resume mid-text
  const ttsCharIndexRef = useRef(0) // last known character position from boundary event
  const ttsFullTextRef = useRef("") // the full text being spoken

  // Ref for interrupt threshold (so VAD loop always reads latest)
  const interruptThresholdRef = useRef(DEFAULT_INTERRUPT_THRESHOLD)

  // Keep refs in sync
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])
  useEffect(() => {
    isSpeakerMutedRef.current = isSpeakerMuted
  }, [isSpeakerMuted])
  useEffect(() => {
    micModeRef.current = micMode
  }, [micMode])
  useEffect(() => {
    interruptThresholdRef.current = interruptThreshold
  }, [interruptThreshold])

  // Scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, aiResponse])

  // Init speech synthesis
  useEffect(() => {
    synthRef.current = window.speechSynthesis
    synthRef.current.getVoices()
    return () => {
      synthRef.current?.cancel()
    }
  }, [])

  // Load Whisper model — re-runs when model selection changes
  const loadWhisperModel = useCallback(async (modelId: WhisperModelId) => {
    setWhisperStatus("loading")
    setWhisperLoadProgress("Initializing...")
    transcriberRef.current = null

    try {
      const { pipeline } = await import("@huggingface/transformers")
      const model = WHISPER_MODELS.find((m) => m.id === modelId)
      setWhisperLoadProgress(
        `Downloading ${model?.name || modelId} (${model?.size || "?"})...`
      )

      const transcriber = await pipeline(
        "automatic-speech-recognition",
        modelId,
        {
          dtype: "q4",
          device: "wasm",
        }
      )

      transcriberRef.current = transcriber
      setWhisperStatus("ready")
      setWhisperLoadProgress("")
    } catch (err) {
      console.error("Failed to load Whisper:", err)
      setWhisperStatus("error")
      setWhisperLoadProgress("Failed to load model")
    }
  }, [])

  // Load on mount and when model changes
  useEffect(() => {
    loadWhisperModel(whisperModel)
  }, [whisperModel, loadWhisperModel])

  // ─── TTS with boundary tracking ───
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise((resolve) => {
      if (!synthRef.current || isSpeakerMutedRef.current) {
        resolve()
        return
      }
      synthRef.current.cancel()

      // Store full text and reset position tracker
      ttsFullTextRef.current = text
      ttsCharIndexRef.current = 0

      const utterance = new SpeechSynthesisUtterance(text)
      const voices = synthRef.current.getVoices()
      const preferred = voices.find(
        (v) =>
          v.name.includes("Samantha") ||
          v.name.includes("Karen") ||
          v.name.includes("Daniel") ||
          v.name.includes("Google") ||
          v.lang.startsWith("en")
      )
      if (preferred) utterance.voice = preferred
      utterance.rate = 1.05
      utterance.pitch = 1.0

      // Track word boundaries so we know where TTS stopped
      utterance.onboundary = (event) => {
        if (event.name === "word" || event.name === "sentence") {
          ttsCharIndexRef.current = event.charIndex
        }
      }

      utterance.onstart = () => {
        isTTSSpeakingRef.current = true
      }
      utterance.onend = () => {
        isTTSSpeakingRef.current = false
        ttsCharIndexRef.current = text.length // finished everything
        ttsCooldownUntilRef.current = Date.now() + POST_TTS_COOLDOWN_MS
        resolve()
      }
      utterance.onerror = () => {
        isTTSSpeakingRef.current = false
        ttsCooldownUntilRef.current = Date.now() + POST_TTS_COOLDOWN_MS
        resolve()
      }
      synthRef.current.speak(utterance)
    })
  }, [])

  const interruptAI = useCallback((saveForResume = false) => {
    // If we should save for resume, grab the last assistant message
    // (the full streamed response that was being spoken)
    if (saveForResume) {
      const lastAssistant = messagesRef.current
        .filter((m) => m.role === "assistant")
        .pop()
      interruptedResponseRef.current = lastAssistant?.content || null
      wasInterruptRef.current = true
    }

    synthRef.current?.cancel()
    isTTSSpeakingRef.current = false
    abortControllerRef.current?.abort()
    abortControllerRef.current = null
    setAiResponse("")
    setIsProcessing(false)
    isProcessingRef.current = false
    ttsCooldownUntilRef.current = Date.now() + POST_TTS_COOLDOWN_MS
  }, [])

  // ─── Transcribe ───
  const transcribe = useCallback(async (audioBlob: Blob): Promise<string> => {
    if (!transcriberRef.current) return ""
    const arrayBuffer = await audioBlob.arrayBuffer()
    const audioContext = new AudioContext({ sampleRate: 16000 })
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
    const float32Data = audioBuffer.getChannelData(0)
    await audioContext.close()
    const result = await transcriberRef.current(float32Data, {
      language: "english",
      task: "transcribe",
    })
    return result.text?.trim() || ""
  }, [])

  // ─── Send to AI with voice-optimized system prompt ───
  const sendToAI = useCallback(
    async (userMessage: string) => {
      setIsProcessing(true)
      isProcessingRef.current = true
      setPersonaState("thinking")
      setStatusText("Thinking...")
      setAiResponse("")

      const newMessages: Message[] = [
        ...messagesRef.current,
        { role: "user", content: userMessage },
      ]
      setMessages(newMessages)

      const controller = new AbortController()
      abortControllerRef.current = controller

      try {
        // Prepend voice system prompt to guide conversational responses
        const apiMessages = [
          VOICE_SYSTEM_PREFIX,
          ...newMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        ]

        const res = await fetch("/api/ai/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: apiMessages,
            provider: "codex",
            model: "gpt-5.4-mini",
          }),
          signal: controller.signal,
        })

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown" }))
          throw new Error(err.error || `HTTP ${res.status}`)
        }

        const reader = res.body?.getReader()
        if (!reader) throw new Error("No stream")

        const decoder = new TextDecoder()
        let fullResponse = ""
        let buffer = ""

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split("\n")
          buffer = lines.pop() || ""
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue
            const data = line.slice(6)
            if (data === "[DONE]") continue
            try {
              const parsed = JSON.parse(data)
              if (parsed.type === "text" && parsed.content) {
                fullResponse += parsed.content
                setAiResponse(fullResponse)
              } else if (parsed.type === "error" && parsed.content) {
                throw new Error(parsed.content)
              }
            } catch (e) {
              if (
                e instanceof Error &&
                e.message !== "Unexpected end of JSON input"
              )
                throw e
            }
          }
        }

        if (fullResponse) {
          setMessages((prev) => [
            ...prev,
            { role: "assistant", content: fullResponse },
          ])
          setAiResponse("")
          setPersonaState("speaking")
          setStatusText("Speaking...")
          await speak(fullResponse)
        }
      } catch (err: any) {
        if (err?.name === "AbortError") return
        console.error("AI error:", err)
        setStatusText(
          `Error: ${err instanceof Error ? err.message : "Unknown"}`
        )
      } finally {
        abortControllerRef.current = null
        setIsProcessing(false)
        isProcessingRef.current = false
        if (isListeningRef.current) {
          if (micModeRef.current === "auto") {
            setPersonaState("listening")
            setStatusText("Listening...")
          } else {
            setPersonaState("idle")
            setStatusText("Mic muted. Tap mic to unmute.")
          }
        }
      }
    },
    [speak]
  )

  // ─── Resume TTS from where it was interrupted ───
  const resumeInterruptedResponse = useCallback(async () => {
    const fullText = interruptedResponseRef.current
    const charPos = ttsCharIndexRef.current
    interruptedResponseRef.current = null
    wasInterruptRef.current = false

    if (!fullText) {
      if (isListeningRef.current) {
        setPersonaState("listening")
        setStatusText("Listening...")
      }
      return
    }

    // Find a clean resume point: back up to the start of the current sentence
    // or use the word boundary position directly
    let resumeFrom = charPos
    if (resumeFrom > 0 && resumeFrom < fullText.length) {
      // Try to find the start of the current sentence (look back for . ! ?)
      const before = fullText.slice(0, resumeFrom)
      const lastSentenceEnd = Math.max(
        before.lastIndexOf(". "),
        before.lastIndexOf("! "),
        before.lastIndexOf("? ")
      )
      if (lastSentenceEnd > 0 && resumeFrom - lastSentenceEnd < 200) {
        resumeFrom = lastSentenceEnd + 2 // skip the ". " part
      }
    }

    const remainingText = fullText.slice(resumeFrom).trim()
    if (!remainingText) {
      // Already finished speaking everything
      if (isListeningRef.current) {
        setPersonaState("listening")
        setStatusText("Listening...")
      }
      return
    }

    setPersonaState("speaking")
    setStatusText("Resuming...")
    await speak(remainingText)

    if (isListeningRef.current) {
      if (micModeRef.current === "auto") {
        setPersonaState("listening")
        setStatusText("Listening...")
      } else {
        setPersonaState("idle")
        setStatusText("Mic muted. Tap mic to unmute.")
      }
    }
  }, [speak])

  // ─── Process completed speech segment ───
  const processAudioSegment = useCallback(async () => {
    if (audioChunksRef.current.length === 0) {
      // No audio chunks — if this was an interrupt, resume the AI response
      if (wasInterruptRef.current) {
        await resumeInterruptedResponse()
      }
      return
    }

    const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" })
    audioChunksRef.current = []

    setPersonaState("thinking")
    setStatusText("Transcribing...")

    const text = await transcribe(audioBlob)

    if (isBlankTranscript(text)) {
      // Blank transcript after an interrupt = false positive, resume AI
      if (wasInterruptRef.current) {
        await resumeInterruptedResponse()
        return
      }

      if (isListeningRef.current) {
        setPersonaState("listening")
        setStatusText("Listening...")
      }
      return
    }

    // Real speech detected — clear any saved interrupt response
    interruptedResponseRef.current = null
    wasInterruptRef.current = false

    setCurrentTranscript(text)
    await sendToAI(text)
  }, [transcribe, sendToAI, resumeInterruptedResponse])

  // ─── VAD loop ───
  const runVAD = useCallback(() => {
    const analyser = analyserRef.current
    if (!analyser) return

    const dataArray = new Float32Array(analyser.fftSize)

    const tick = () => {
      if (!isListeningRef.current) return

      analyser.getFloatTimeDomainData(dataArray)

      let sum = 0
      for (let i = 0; i < dataArray.length; i++) {
        sum += dataArray[i] * dataArray[i]
      }
      const rms = Math.sqrt(sum / dataArray.length)
      setVolumeLevel(Math.min(rms * 10, 1))
      setDebugRMS(rms)

      const now = Date.now()

      // ─── Voice interrupt detection ───
      // Always active when AI is busy and mic is live.
      // Uses a high threshold (0.08 RMS) so only deliberate speech triggers it,
      // not speaker bleed or ambient noise.
      if (
        (isProcessingRef.current || isTTSSpeakingRef.current) &&
        micModeRef.current === "auto"
      ) {
        if (rms > interruptThresholdRef.current) {
          speechConfirmCountRef.current++
          if (speechConfirmCountRef.current >= INTERRUPT_CONFIRM_FRAMES) {
            // User is speaking over AI — interrupt (save response for possible resume)
            speechConfirmCountRef.current = 0

            // Save the current response before interrupting
            const lastAssistant = messagesRef.current
              .filter((m) => m.role === "assistant")
              .pop()
            interruptedResponseRef.current = lastAssistant?.content || null
            wasInterruptRef.current = true

            isTTSSpeakingRef.current = false
            synthRef.current?.cancel()
            abortControllerRef.current?.abort()
            abortControllerRef.current = null
            setAiResponse("")
            setIsProcessing(false)
            isProcessingRef.current = false
            ttsCooldownUntilRef.current = 0 // no cooldown, user is actively speaking

            // Start recording the interrupt utterance
            isSpeakingRef.current = true
            speechStartRef.current = now
            silenceStartRef.current = 0
            audioChunksRef.current = []
            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state !== "recording"
            ) {
              mediaRecorderRef.current.start()
            }
            setPersonaState("listening")
            setStatusText("Listening...")
          }
        } else {
          speechConfirmCountRef.current = 0
        }
        vadFrameRef.current = requestAnimationFrame(tick)
        return
      }

      // ─── Normal VAD — skip while mic is muted or during cooldown ───
      if (micModeRef.current === "muted") {
        vadFrameRef.current = requestAnimationFrame(tick)
        return
      }
      if (now < ttsCooldownUntilRef.current) {
        vadFrameRef.current = requestAnimationFrame(tick)
        return
      }

      if (!isSpeakingRef.current) {
        if (rms > SPEECH_THRESHOLD) {
          speechConfirmCountRef.current++
          if (speechConfirmCountRef.current >= SPEECH_CONFIRM_FRAMES) {
            isSpeakingRef.current = true
            speechStartRef.current = now
            silenceStartRef.current = 0
            speechConfirmCountRef.current = 0
            audioChunksRef.current = []

            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state !== "recording"
            ) {
              mediaRecorderRef.current.start()
            }

            setPersonaState("listening")
            setStatusText("Listening...")
          }
        } else {
          speechConfirmCountRef.current = 0
        }
      } else {
        if (rms < SILENCE_THRESHOLD) {
          if (silenceStartRef.current === 0) {
            silenceStartRef.current = now
          } else if (now - silenceStartRef.current > SILENCE_DURATION_MS) {
            const speechDuration = now - speechStartRef.current
            isSpeakingRef.current = false
            silenceStartRef.current = 0
            speechConfirmCountRef.current = 0

            if (
              mediaRecorderRef.current &&
              mediaRecorderRef.current.state === "recording"
            ) {
              mediaRecorderRef.current.stop()
            }

            if (speechDuration < MIN_SPEECH_DURATION_MS) {
              audioChunksRef.current = []
              setPersonaState("listening")
              setStatusText("Listening...")
            }
          }
        } else {
          silenceStartRef.current = 0
        }
      }

      vadFrameRef.current = requestAnimationFrame(tick)
    }

    vadFrameRef.current = requestAnimationFrame(tick)
  }, [])

  // ─── Start session ───
  const startSession = useCallback(async () => {
    setSessionState("loading")
    setStatusText("Waiting for Whisper model...")

    // Wait for the current model to finish loading
    let attempts = 0
    while (!transcriberRef.current && attempts < 120) {
      await new Promise((r) => setTimeout(r, 500))
      attempts++
    }

    if (!transcriberRef.current) {
      setStatusText("Whisper model not ready. Try selecting a smaller model.")
      setSessionState("off")
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      streamRef.current = stream

      const audioContext = new AudioContext()
      audioContextRef.current = audioContext
      const source = audioContext.createMediaStreamSource(stream)
      const analyser = audioContext.createAnalyser()
      analyser.fftSize = 2048
      analyser.smoothingTimeConstant = 0.5
      source.connect(analyser)
      analyserRef.current = analyser

      const mediaRecorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : "audio/webm",
      })

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      mediaRecorder.onstop = () => {
        const speechDuration = Date.now() - speechStartRef.current
        if (speechDuration >= MIN_SPEECH_DURATION_MS) {
          processAudioSegment()
        }
      }

      mediaRecorderRef.current = mediaRecorder

      isListeningRef.current = true
      setMicMode("auto")
      micModeRef.current = "auto"
      setSessionState("ready")
      setPersonaState("listening")
      setStatusText("Listening...")
      runVAD()
    } catch (err) {
      console.error("Mic error:", err)
      setStatusText("Microphone access denied.")
      setSessionState("off")
    }
  }, [processAudioSegment, runVAD])

  // ─── End session ───
  const endSession = useCallback(() => {
    isListeningRef.current = false
    cancelAnimationFrame(vadFrameRef.current)
    interruptAI()

    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop()
    }
    mediaRecorderRef.current = null

    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    audioContextRef.current?.close()
    audioContextRef.current = null
    analyserRef.current = null

    isSpeakingRef.current = false
    silenceStartRef.current = 0
    speechConfirmCountRef.current = 0
    audioChunksRef.current = []

    setSessionState("off")
    setPersonaState("asleep")
    setStatusText("Conversation ended")
    setVolumeLevel(0)
    setMicMode("auto")
    micModeRef.current = "auto"
  }, [interruptAI])

  const toggleSession = useCallback(() => {
    if (sessionState === "ready") endSession()
    else if (sessionState === "off") startSession()
  }, [sessionState, startSession, endSession])

  // Toggle speaker mute (TTS on/off)
  const toggleSpeakerMute = useCallback(() => {
    if (!isSpeakerMuted) synthRef.current?.cancel()
    setIsSpeakerMuted(!isSpeakerMuted)
  }, [isSpeakerMuted])

  // Toggle mic mute — also serves as "unmute to interrupt"
  const toggleMicMute = useCallback(() => {
    const newMode = micMode === "auto" ? "muted" : "auto"
    setMicMode(newMode)
    micModeRef.current = newMode

    if (newMode === "auto") {
      // Unmuting — if AI is busy, this is a deliberate interrupt (no resume)
      if (isProcessingRef.current || isTTSSpeakingRef.current) {
        interruptedResponseRef.current = null
        wasInterruptRef.current = false
        interruptAI()
      }
      setPersonaState("listening")
      setStatusText("Listening...")
    } else {
      // Muting
      if (!isProcessingRef.current) {
        setPersonaState("idle")
        setStatusText("Mic muted")
      }
    }
  }, [micMode, interruptAI])

  // Tap orb to interrupt AI (always available, deliberate so no resume)
  const handleOrbTap = useCallback(() => {
    if (isProcessingRef.current || isTTSSpeakingRef.current) {
      // Deliberate tap = don't save for resume
      interruptedResponseRef.current = null
      wasInterruptRef.current = false
      interruptAI()
      setMicMode("auto")
      micModeRef.current = "auto"
      setPersonaState("listening")
      setStatusText("Listening...")
    }
  }, [interruptAI])

  // Cleanup
  useEffect(() => {
    return () => {
      isListeningRef.current = false
      cancelAnimationFrame(vadFrameRef.current)
      synthRef.current?.cancel()
      streamRef.current?.getTracks().forEach((t) => t.stop())
      audioContextRef.current?.close()
    }
  }, [])

  const isActive = sessionState === "ready"
  const isLoading = sessionState === "loading"
  const isAIBusy = personaState === "speaking" || personaState === "thinking"
  const isMicMuted = micMode === "muted"

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center justify-between border-b px-6 py-3">
        <div className="flex items-center gap-3">
          <a
            href="/notes"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            &larr; Back
          </a>
          <h1 className="text-sm font-medium">Voice Chat v2</h1>
          {isActive && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-500">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
              Live
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {/* Debug toggle */}
          {isActive && (
            <button
              onClick={() => setShowDebug(!showDebug)}
              className={cn(
                "rounded-md px-2 py-1 font-mono text-xs transition-colors",
                showDebug
                  ? "bg-primary/10 text-primary"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
              title="Toggle debug info"
            >
              DBG
            </button>
          )}
          {/* Speaker mute */}
          <button
            onClick={toggleSpeakerMute}
            className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            title={isSpeakerMuted ? "Unmute speaker" : "Mute speaker"}
          >
            {isSpeakerMuted ? (
              <VolumeX className="size-4" />
            ) : (
              <Volume2 className="size-4" />
            )}
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex flex-1 flex-col items-center overflow-hidden">
        {/* Messages area */}
        <div className="flex w-full max-w-2xl flex-1 flex-col overflow-y-auto px-6 py-4">
          {messages.length === 0 && !aiResponse && (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center text-muted-foreground">
              <p className="text-sm">
                {isLoading
                  ? whisperLoadProgress || "Setting up..."
                  : isActive
                    ? "Listening for your voice..."
                    : "Tap the button below to start a hands-free conversation"}
              </p>
              {!isLoading && !isActive && (
                <p className="max-w-sm text-xs text-muted-foreground/60">
                  Mic stays live. Speak loudly or tap the orb to interrupt.
                  Use the mic button to mute if needed.
                </p>
              )}
            </div>
          )}

          {messages.map((msg, i) => (
            <div
              key={i}
              className={cn(
                "mb-4 max-w-[80%] rounded-2xl px-4 py-3 text-sm",
                msg.role === "user"
                  ? "ml-auto bg-primary text-primary-foreground"
                  : "mr-auto bg-muted text-foreground"
              )}
            >
              {msg.content}
            </div>
          ))}

          {aiResponse && (
            <div className="mb-4 mr-auto max-w-[80%] rounded-2xl bg-muted px-4 py-3 text-sm text-foreground">
              {aiResponse}
              <span className="ml-1 inline-block h-4 w-0.5 animate-pulse bg-foreground/50" />
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Persona + Controls */}
        <div className="flex w-full flex-col items-center gap-4 border-t bg-background px-6 pb-8 pt-6">
          {/* Persona orb — tappable to interrupt */}
          <div className="relative">
            {isActive && !isMicMuted && (
              <div
                className="absolute inset-0 rounded-full bg-primary/20 transition-transform duration-75"
                style={{
                  transform: `scale(${1 + volumeLevel * 0.5})`,
                  opacity: volumeLevel > 0.05 ? 1 : 0,
                }}
              />
            )}
            <button
              onClick={handleOrbTap}
              className="focus:outline-none"
              title={isAIBusy ? "Tap to interrupt" : undefined}
            >
              <Persona
                state={personaState}
                variant="glint"
                className={cn(
                  "relative size-24 transition-all duration-300",
                  isActive && personaState === "listening" && "size-28",
                  isAIBusy && "cursor-pointer"
                )}
              />
            </button>
          </div>

          {/* Status */}
          <p className="text-sm text-muted-foreground">{statusText}</p>

          {/* Current transcript */}
          {currentTranscript && (
            <p className="max-w-md text-center text-xs text-muted-foreground/70">
              You said: &quot;{currentTranscript}&quot;
            </p>
          )}

          {/* Whisper model selector */}
          <div className="w-full max-w-xs">
            <div className="rounded-lg border bg-muted/50 p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Whisper model (STT)</span>
                <span className={cn(
                  "text-xs",
                  whisperStatus === "ready" ? "text-emerald-500" :
                  whisperStatus === "loading" ? "text-amber-500" :
                  whisperStatus === "error" ? "text-red-500" :
                  "text-muted-foreground"
                )}>
                  {whisperStatus === "ready" ? "Ready" :
                   whisperStatus === "loading" ? "Loading..." :
                   whisperStatus === "error" ? "Error" : "Idle"}
                </span>
              </div>
              <select
                value={whisperModel}
                onChange={(e) => setWhisperModel(e.target.value as WhisperModelId)}
                disabled={whisperStatus === "loading" || isActive}
                className="w-full rounded-md border bg-background px-3 py-2 text-sm text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              >
                {WHISPER_MODELS.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.params}) — {m.size} — {m.quality}
                  </option>
                ))}
              </select>
              {whisperLoadProgress && (
                <p className="mt-1.5 text-xs text-amber-500">{whisperLoadProgress}</p>
              )}
              {!isActive && (
                <p className="mt-1.5 text-xs text-muted-foreground/50">
                  Larger models are more accurate but slower and use more memory.
                  {whisperModel !== "onnx-community/whisper-tiny" &&
                    " First load downloads the model to browser cache."}
                </p>
              )}
            </div>
          </div>

          {/* Controls row */}
          <div className="flex items-center gap-3">
            {/* Mic mute button */}
            {isActive && (
              <button
                onClick={toggleMicMute}
                className={cn(
                  "flex size-12 items-center justify-center rounded-full transition-all duration-200",
                  isMicMuted
                    ? "bg-amber-500/20 text-amber-500 hover:bg-amber-500/30"
                    : "bg-muted text-foreground hover:bg-muted/80"
                )}
                title={isMicMuted ? "Unmute mic (also interrupts AI)" : "Mute mic"}
              >
                {isMicMuted ? (
                  <MicOff className="size-4" />
                ) : (
                  <Mic className="size-4" />
                )}
              </button>
            )}

            {/* Session button */}
            <button
              onClick={toggleSession}
              disabled={isLoading || whisperStatus === "loading"}
              className={cn(
                "flex items-center gap-2 rounded-full px-8 py-4 text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-red-500 text-white shadow-lg shadow-red-500/30 hover:bg-red-600"
                  : isLoading
                    ? "bg-muted text-muted-foreground cursor-not-allowed"
                    : "bg-primary text-primary-foreground shadow-lg shadow-primary/30 hover:scale-105 hover:bg-primary/90"
              )}
            >
              {isActive ? (
                <>
                  <PhoneOff className="size-4" />
                  End
                </>
              ) : isLoading ? (
                <>
                  <div className="size-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  Connecting...
                </>
              ) : (
                <>
                  <Phone className="size-4" />
                  Start Conversation
                </>
              )}
            </button>
          </div>

          {/* Hints */}
          {isActive && isAIBusy && (
            <p className="text-xs text-muted-foreground/50">
              {isMicMuted
                ? "Tap mic or orb to interrupt"
                : "Speak loudly or tap the orb to interrupt"}
            </p>
          )}

          {/* Sensitivity slider + Debug panel */}
          {isActive && (
            <div className="w-full max-w-xs space-y-3">
              {/* Interrupt sensitivity slider */}
              <div className="rounded-lg border bg-muted/50 p-3">
                <div className="mb-2 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Interrupt sensitivity</span>
                  <span className="font-mono text-muted-foreground">
                    {interruptThreshold.toFixed(3)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground/60">Sensitive</span>
                  <input
                    type="range"
                    min="0.02"
                    max="0.20"
                    step="0.005"
                    value={interruptThreshold}
                    onChange={(e) => setInterruptThreshold(parseFloat(e.target.value))}
                    className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-background accent-primary [&::-webkit-slider-thumb]:size-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
                  />
                  <span className="text-xs text-muted-foreground/60">Strict</span>
                </div>
                <p className="mt-1.5 text-xs text-muted-foreground/50">
                  Lower = easier to interrupt. Higher = harder (fewer false triggers).
                </p>
              </div>

              {/* Debug panel (togglable) */}
              {showDebug && (
                <div className="rounded-lg border bg-muted/50 p-3 font-mono text-xs">
                  <div className="mb-2 flex items-center justify-between">
                    <span>RMS: {debugRMS.toFixed(4)}</span>
                    <span className={cn(
                      isAIBusy ? "text-amber-500" : "text-emerald-500"
                    )}>
                      {isAIBusy ? "AI busy" : "Idle"}
                    </span>
                  </div>
                  {/* RMS bar with threshold marker */}
                  <div className="relative mb-1 h-2 w-full overflow-hidden rounded-full bg-background">
                    <div
                      className="h-full rounded-full bg-foreground/40 transition-all duration-75"
                      style={{ width: `${Math.min(debugRMS * 500, 100)}%` }}
                    />
                  </div>
                  <div className="relative h-4 w-full">
                    <div
                      className="absolute top-0 h-3 border-l border-amber-500"
                      style={{ left: `${SPEECH_THRESHOLD * 500}%` }}
                    />
                    <div
                      className="absolute top-0 h-3 border-l-2 border-red-500"
                      style={{ left: `${interruptThreshold * 500}%` }}
                    />
                    <span className="absolute text-amber-500" style={{ left: `${SPEECH_THRESHOLD * 500}%`, top: 6, fontSize: 8 }}>SPK</span>
                    <span className="absolute text-red-500" style={{ left: `${interruptThreshold * 500}%`, top: 6, fontSize: 8 }}>INT</span>
                  </div>
                  <div className="mt-1 text-muted-foreground">
                    TTS pos: {ttsCharIndexRef.current}/{ttsFullTextRef.current.length}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Tech info */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground/50">
            <span>STT: Whisper {WHISPER_MODELS.find((m) => m.id === whisperModel)?.name}</span>
            <span>LLM: Codex</span>
            <span>TTS: Web Speech</span>
          </div>
        </div>
      </div>
    </div>
  )
}
