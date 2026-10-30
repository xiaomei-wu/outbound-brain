import { CheckCircleIcon, XCircleIcon, Loader2Icon } from "lucide-react"

export type ServiceStatus = "ok" | "error" | "loading"

interface StatusCheckProps {
  name: string
  status: ServiceStatus
  message: string
  nextStep?: string
  nextStepHref?: string
}

export function StatusCheck({
  name,
  status,
  message,
  nextStep,
  nextStepHref,
}: StatusCheckProps) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex items-center gap-3 min-w-0">
        <div className="shrink-0">
          {status === "loading" && (
            <Loader2Icon className="size-4 animate-spin text-muted-foreground" />
          )}
          {status === "ok" && (
            <CheckCircleIcon className="size-4 text-emerald-500" />
          )}
          {status === "error" && (
            <XCircleIcon className="size-4 text-red-500" />
          )}
        </div>
        <div className="grid gap-0.5 min-w-0">
          <span className="text-sm font-medium leading-none">{name}</span>
          <span className="text-xs text-muted-foreground">{message}</span>
        </div>
      </div>
      {status === "error" && nextStep && (
        <div className="shrink-0">
          {nextStepHref ? (
            <a
              href={nextStepHref}
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              {nextStep}
            </a>
          ) : (
            <span className="text-xs text-muted-foreground">{nextStep}</span>
          )}
        </div>
      )}
    </div>
  )
}
