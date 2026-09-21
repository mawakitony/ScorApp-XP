"use client"

import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { createScorecardFromTemplate } from "@/actions/scorecards"
import { Button } from "@/components/ui/button"

export function UseTemplateButton({ templateId, disabled }: { templateId: string; disabled: boolean }) {
  const router = useRouter()

  return (
    <Button
      className="h-10"
      disabled={disabled}
      onClick={() => {
        void createScorecardFromTemplate(templateId).then((result) => {
          if (result.error) {
            toast.error(result.error)
            return
          }
          if (result.id) router.push(`/dashboard/scorecards/${result.id}/builder`)
        })
      }}
    >
      Créer à partir de ce modèle
    </Button>
  )
}
