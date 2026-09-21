"use client"

import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
}: {
  label: string
  hint?: string
  error?: string
  htmlFor?: string
  children: React.ReactNode
}) {
  const errorId = htmlFor ? `${htmlFor}-error` : undefined
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      {error ? (
        <p id={errorId} className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export function TextField({
  id,
  label,
  value,
  onChange,
  hint,
  error,
  type = "text",
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  hint?: string
  error?: string
  type?: string
}) {
  return (
    <Field label={label} hint={hint} error={error} htmlFor={id}>
      <Input
        id={id}
        className="h-10"
        type={type}
        value={value}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
    </Field>
  )
}

export function AreaField({
  id,
  label,
  value,
  onChange,
  rows = 4,
  hint,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  rows?: number
  hint?: string
}) {
  return (
    <Field label={label} hint={hint} htmlFor={id}>
      <Textarea id={id} rows={rows} value={value} onChange={(event) => onChange(event.target.value)} />
    </Field>
  )
}

export function ToggleField({
  label,
  checked,
  onChange,
}: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <label className="flex items-center gap-3 text-sm">
      <input
        type="checkbox"
        className="size-4 accent-primary"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  )
}
