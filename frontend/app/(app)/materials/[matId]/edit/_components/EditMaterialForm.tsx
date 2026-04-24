"use client"

import { useState } from "react"
import { updateMaterialAction } from "@/app/actions/materials"
import type { Material } from "@/lib/api"

type Props = { material: Material }

export function EditMaterialForm({ material }: Props) {
  const [name, setName] = useState(material.name)
  const [sku, setSku] = useState(material.sku)
  const [category, setCategory] = useState(material.category)
  const [thicknessInput, setThicknessInput] = useState((material.thickness_options ?? []).join(", "))
  const [pricePerM2, setPricePerM2] = useState(
    material.price_per_m2 != null ? String(material.price_per_m2) : ""
  )
  const [edgebandingPrice, setEdgebandingPrice] = useState(
    material.edgebanding_price_per_mm != null ? String(material.edgebanding_price_per_mm) : ""
  )
  const [grainDirection, setGrainDirection] = useState<"horizontal" | "vertical" | "none">(
    (["horizontal", "vertical", "none"] as const).includes(material.grain_direction as "horizontal" | "vertical" | "none")
      ? (material.grain_direction as "horizontal" | "vertical" | "none")
      : "none"
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    const thicknessOptions = thicknessInput
      .split(",")
      .map((s) => parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n))

    if (thicknessOptions.length === 0) {
      setError("Please enter at least one valid thickness value (e.g. 16, 18, 22)")
      setIsSubmitting(false)
      return
    }

    const parsedPrice = parseFloat(pricePerM2)
    if (!Number.isFinite(parsedPrice)) {
      setError("Please enter a valid price per m²")
      setIsSubmitting(false)
      return
    }

    const result = await updateMaterialAction(material.id, {
      name,
      sku,
      category,
      thickness_options: thicknessOptions,
      price_per_m2: parsedPrice,
      edgebanding_price_per_mm: edgebandingPrice ? parseFloat(edgebandingPrice) : null,
      grain_direction: grainDirection,
    })

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: updateMaterialAction redirects to /materials
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="bg-red-950 border border-red-900 rounded-md px-3 py-2 text-xs text-red-400">
          {error}
        </div>
      )}

      <div>
        <label htmlFor="name" className="block text-xs text-slate-400 mb-1">Name</label>
        <input
          id="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="sku" className="block text-xs text-slate-400 mb-1">SKU</label>
        <input
          id="sku"
          required
          value={sku}
          onChange={(e) => setSku(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="category" className="block text-xs text-slate-400 mb-1">Category</label>
        <input
          id="category"
          required
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="thicknessInput" className="block text-xs text-slate-400 mb-1">
          Thickness options (mm, comma-separated)
        </label>
        <input
          id="thicknessInput"
          required
          value={thicknessInput}
          onChange={(e) => setThicknessInput(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="pricePerM2" className="block text-xs text-slate-400 mb-1">Price per m²</label>
        <input
          id="pricePerM2"
          required
          type="number"
          step="0.01"
          min="0"
          value={pricePerM2}
          onChange={(e) => setPricePerM2(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="edgebandingPrice" className="block text-xs text-slate-400 mb-1">
          Edgebanding price per mm (optional)
        </label>
        <input
          id="edgebandingPrice"
          type="number"
          step="0.001"
          min="0"
          value={edgebandingPrice}
          onChange={(e) => setEdgebandingPrice(e.target.value)}
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-100 outline-none focus:border-indigo-500"
        />
      </div>

      <div>
        <label htmlFor="grainDirection" className="block text-xs text-slate-400 mb-1">Grain direction</label>
        <select
          id="grainDirection"
          value={grainDirection}
          onChange={(e) =>
            setGrainDirection(e.target.value as "horizontal" | "vertical" | "none")
          }
          className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-300 outline-none focus:border-indigo-500"
        >
          <option value="none">None</option>
          <option value="horizontal">Horizontal</option>
          <option value="vertical">Vertical</option>
        </select>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Saving…" : "Save Changes"}
      </button>
    </form>
  )
}
