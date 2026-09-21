"use client"

import { useState } from "react"
import { Plus } from "lucide-react"
import { createScorecard } from "@/actions/scorecards"
import { ScorecardForm } from "@/components/scorecard/scorecard-form"
import { toScorecardFormValues } from "@/lib/scorecard/values"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"

export function CreateScorecardDialog() {
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="h-10 px-4">
          <Plus />
          Create Scorecard
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nouvelle scorecard</DialogTitle>
          <DialogDescription>
            Donnez-lui un nom et un slug. Le builder reprend ensuite la configuration.
          </DialogDescription>
        </DialogHeader>
        <ScorecardForm
          defaultValues={toScorecardFormValues()}
          submitLabel="Créer la scorecard"
          onSubmit={createScorecard}
        />
      </DialogContent>
    </Dialog>
  )
}
