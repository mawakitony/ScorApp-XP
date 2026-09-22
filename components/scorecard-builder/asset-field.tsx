"use client"

import { toast } from "sonner"
import { TextField } from "@/components/scorecard-builder/editor-fields"
import { createClient } from "@/lib/supabase/client"
import { extensionForType, validateImageFile } from "@/lib/security/limits"

export function AssetField({
  id,
  label,
  value,
  organizationId,
  scorecardId,
  kind,
  onChange,
}: {
  id: string
  label: string
  value: string
  organizationId: string
  scorecardId: string
  kind: string
  onChange: (value: string) => void
}) {
  async function upload(file: File) {
    if (validateImageFile(file)) {
      toast.error("Utilisez un PNG, JPEG ou WebP de 2 Mo maximum.")
      return
    }
    const extension = extensionForType(file.type) ?? "png"
    const path = `${organizationId}/${scorecardId}/${kind}-${Date.now()}.${extension}`
    const supabase = createClient()
    const { error } = await supabase.storage.from("scorecard-assets").upload(path, file, {
      upsert: true,
      contentType: file.type,
    })
    if (error) {
      toast.error("L'image n'a pas pu être envoyée.")
      return
    }
    const { data } = supabase.storage.from("scorecard-assets").getPublicUrl(path)
    onChange(data.publicUrl)
    toast.success("Image ajoutée.")
  }

  return (
    <div className="space-y-2">
      <TextField id={id} label={label} value={value} onChange={onChange} hint="URL publique ou fichier PNG, JPEG, WebP." />
      <input
        type="file"
        accept="image/png,image/jpeg,image/webp"
        aria-label={`Téléverser ${label}`}
        className="block text-sm"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
        }}
      />
    </div>
  )
}
