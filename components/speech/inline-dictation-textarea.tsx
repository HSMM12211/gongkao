"use client"

import { useEffect, useState, type ComponentProps, type ReactNode } from "react"
import { LoaderCircle, Mic } from "lucide-react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { useDesktopSpeechInput } from "@/hooks/use-desktop-speech-input"
import { useRealtimeSpeechInput } from "@/hooks/use-realtime-speech-input"
import { useSpeechTranscription } from "@/hooks/use-speech-transcription"
import { cn } from "@/lib/utils"
import { loadSpeechSettings } from "@/lib/providers/settings"
import {
  getSpeechErrorMessage,
  isLocalSpeechUnavailableInBrowser,
  LOCAL_SPEECH_DESKTOP_REQUIRED_MESSAGE,
} from "@/lib/providers/speech-errors"
import { shouldUseDesktopSpeechInput } from "@/hooks/use-desktop-speech-input"
import { getDictationButtonLabel, previewDictationText } from "@/lib/speech/inline-dictation"

type InlineDictationTextareaProps = Omit<ComponentProps<typeof Textarea>, "value" | "onChange"> & {
  value: string
  onValueChange: (value: string) => void
  onTranscript: (text: string) => void
  seedText: string
  previewSeparator?: string
  footer?: (controls: {
    dictationButton: ReactNode
    recording: boolean
    processing: boolean
  }) => ReactNode
}

export function InlineDictationTextarea({
  value,
  onValueChange,
  onTranscript,
  seedText,
  previewSeparator = "",
  footer,
  className,
  disabled,
  ...props
}: InlineDictationTextareaProps) {
  const legacySpeech = useSpeechTranscription(seedText)
  const realtimeSpeech = useRealtimeSpeechInput()
  const desktopSpeech = useDesktopSpeechInput()
  const [useRealtime, setUseRealtime] = useState(false)
  const [useDesktop, setUseDesktop] = useState(false)
  const [localSpeechUnavailable, setLocalSpeechUnavailable] = useState(false)

  const recording = useDesktop
    ? desktopSpeech.recording
    : useRealtime
      ? realtimeSpeech.recording
      : legacySpeech.recording
  const processing = useDesktop
    ? desktopSpeech.processing
    : useRealtime
      ? realtimeSpeech.state === "processing"
      : legacySpeech.transcribing
  const partialText = useDesktop ? desktopSpeech.partialText : useRealtime ? realtimeSpeech.partialText : ""
  const error = useDesktop ? desktopSpeech.error : useRealtime ? realtimeSpeech.error : legacySpeech.error
  const buttonLabel = getDictationButtonLabel({ recording, processing })
  const hasFooterButton = Boolean(footer)

  useEffect(() => {
    void loadSpeechSettings()
      .then((settings) => {
        const useDesktopRuntime = shouldUseDesktopSpeechInput(settings.mode, desktopSpeech.available)
        setUseDesktop(useDesktopRuntime)
        setUseRealtime(false)
        setLocalSpeechUnavailable(isLocalSpeechUnavailableInBrowser(settings.mode, desktopSpeech.available))
      })
      .catch(() => {
        setUseDesktop(false)
        setUseRealtime(false)
        setLocalSpeechUnavailable(false)
      })
  }, [desktopSpeech.available])

  const start = async () => {
    if (localSpeechUnavailable) {
      toast.error(LOCAL_SPEECH_DESKTOP_REQUIRED_MESSAGE)
      return
    }
    const startSpeech = useDesktop ? desktopSpeech.start : useRealtime ? realtimeSpeech.start : legacySpeech.startRecording
    await startSpeech()
  }

  const stop = async () => {
    const stopSpeech = useDesktop ? desktopSpeech.stop : useRealtime ? realtimeSpeech.stop : legacySpeech.stopRecording
    const text = await stopSpeech()
    if (!text.trim()) {
      toast.error("未识别到有效语音，请靠近麦克风后重试")
      return
    }
    onTranscript(text)
  }

  const toggleRecording = async () => {
    if (processing) return
    try {
      if (recording) {
        await stop()
        return
      }
      await start()
    } catch (caught) {
      toast.error(getSpeechErrorMessage(caught, recording ? "语音识别失败" : "录音启动失败"))
    }
  }

  const dictationButton = (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size={hasFooterButton ? "sm" : "icon-sm"}
          variant={recording ? "destructive" : "outline"}
          className={cn(!hasFooterButton && "absolute bottom-3 right-3")}
          aria-label={buttonLabel}
          disabled={disabled || processing}
          onClick={() => void toggleRecording()}
        >
          {processing ? <LoaderCircle className="size-4 animate-spin" /> : <Mic className="size-4" />}
          {hasFooterButton && buttonLabel}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">
        {buttonLabel}
      </TooltipContent>
    </Tooltip>
  )

  return (
    <div>
      <div className="relative">
        <Textarea
          {...props}
          value={partialText ? previewDictationText(value, partialText, previewSeparator) : value}
          onChange={(event) => onValueChange(event.target.value)}
          readOnly={recording || processing}
          disabled={disabled}
          className={cn(!hasFooterButton && "pr-14", className)}
        />
        {!hasFooterButton && dictationButton}
      </div>
      {footer?.({ dictationButton, recording, processing })}
      {error && (
        <span className="sr-only" role="status">
          {error}
        </span>
      )}
    </div>
  )
}
