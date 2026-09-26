"use client"

import { useState } from "react"
import { Copy } from "lucide-react"
import { toast } from "sonner"
import {
  createQuestionCategory,
  deleteQuestionCategory,
  duplicateQuestionCategory,
  reorderQuestionCategories,
  updateQuestionCategory,
} from "@/actions/builder"
import { ConfirmDelete } from "@/components/scorecard-builder/confirm-delete"
import { AreaField, TextField } from "@/components/scorecard-builder/editor-fields"
import { SortableList } from "@/components/scorecard-builder/sortable-list"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useAutosave } from "@/hooks/use-autosave"
import { questionCategorySchema } from "@/lib/validators/builder"
import type { BuilderQuestionCategory } from "@/types/builder"

export function CategoriesStep({
  scorecardId,
  categories,
  onChange,
}: {
  scorecardId: string
  categories: BuilderQuestionCategory[]
  onChange: (categories: BuilderQuestionCategory[]) => void
}) {
  const [pending, setPending] = useState(false)

  async function addCategory() {
    setPending(true)
    const result = await createQuestionCategory(scorecardId)
    setPending(false)
    if (result.error || !result.data) {
      toast.error(result.error ?? "La catégorie n'a pas pu être créée.")
      return
    }
    onChange([
      ...categories,
      { id: result.data.id, name: "Nouvelle catégorie", description: "", icon: "", weight: 1, position: categories.length },
    ])
  }

  async function copyCategory(category: BuilderQuestionCategory) {
    const result = await duplicateQuestionCategory(scorecardId, category.id)
    if (result.error || !result.data) {
      toast.error(result.error ?? "La duplication a échoué.")
      return
    }
    onChange([...categories, { ...category, id: result.data.id, name: `${category.name} (copie)`, position: category.position + 1 }])
  }

  async function removeCategory(categoryId: string) {
    const result = await deleteQuestionCategory(scorecardId, categoryId)
    if (result.error) {
      toast.error(result.error)
      return
    }
    onChange(categories.filter((category) => category.id !== categoryId))
  }

  async function reorder(next: BuilderQuestionCategory[]) {
    const previous = categories
    onChange(next.map((category, position) => ({ ...category, position })))
    const result = await reorderQuestionCategories(scorecardId, next.map((category) => category.id))
    if (result.error) {
      toast.error(result.error)
      onChange(previous)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl">Catégories</h2>
          <p className="mt-2 max-w-xl text-sm text-muted-foreground">
            Regroupez les questions, par exemple Expérience ou Formation. Les poids se règlent dans Score.
          </p>
        </div>
        <Button type="button" className="h-10" disabled={pending} onClick={() => void addCategory()}>
          Ajouter une catégorie
        </Button>
      </div>
      {categories.length === 0 ? (
        <p className="rounded-2xl border border-dashed p-8 text-sm text-muted-foreground">Aucune catégorie. Ajoutez la première, par exemple Expérience ou Formation.</p>
      ) : (
        <SortableList
          items={categories}
          onReorder={(next) => void reorder(next)}
          renderItem={(category) => (
            <CategoryCard
              scorecardId={scorecardId}
              category={category}
              onChange={(next) => onChange(categories.map((item) => (item.id === next.id ? next : item)))}
              onCopy={() => void copyCategory(category)}
              onDelete={() => void removeCategory(category.id)}
            />
          )}
        />
      )}
    </div>
  )
}

function CategoryCard({
  scorecardId,
  category,
  onChange,
  onCopy,
  onDelete,
}: {
  scorecardId: string
  category: BuilderQuestionCategory
  onChange: (category: BuilderQuestionCategory) => void
  onCopy: () => void
  onDelete: () => void
}) {
  const draft = { name: category.name, description: category.description, icon: category.icon, weight: category.weight }
  useAutosave(draft, async (current) => {
    const parsed = questionCategorySchema.safeParse(current)
    if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Catégorie invalide.", quiet: true }
    return updateQuestionCategory(scorecardId, category.id, parsed.data)
  })

  return (
    <article className="space-y-4 rounded-2xl border bg-card p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <TextField id={`category-name-${category.id}`} label="Nom" value={category.name} onChange={(name) => onChange({ ...category, name })} />
        <TextField id={`category-icon-${category.id}`} label="Icône" value={category.icon} onChange={(icon) => onChange({ ...category, icon })} />
        <div className="md:col-span-2">
          <AreaField
            id={`category-description-${category.id}`}
            label="Description"
            rows={2}
            value={category.description}
            onChange={(description) => onChange({ ...category, description })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`category-weight-${category.id}`}>Poids</Label>
          <Input
            id={`category-weight-${category.id}`}
            className="h-10"
            type="number"
            min={0.1}
            value={category.weight}
            onChange={(event) => onChange({ ...category, weight: Number(event.target.value) })}
          />
        </div>
      </div>
      <div className="flex gap-1">
        <Button type="button" variant="ghost" size="icon" aria-label="Dupliquer" onClick={onCopy}>
          <Copy />
        </Button>
        <ConfirmDelete title="Supprimer cette catégorie ?" description="Les questions resteront, sans cette catégorie." onConfirm={onDelete} />
      </div>
    </article>
  )
}
