"use client"

import { useState, useRef } from "react"
import { createMaterialAction, uploadMaterialAction } from "@/app/actions/materials"

export function NewMaterialForm() {
  const [name, setName] = useState("")
  const [sku, setSku] = useState("")
  const [category, setCategory] = useState("")
  const [thicknessInput, setThicknessInput] = useState("")
  const [pricePerM2, setPricePerM2] = useState("")
  const [edgebandingPrice, setEdgebandingPrice] = useState("")
  const [grainDirection, setGrainDirection] = useState<"horizontal" | "vertical" | "none">("none")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

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

    const file = fileRef.current?.files?.[0]

    let result: { error?: string }
    if (file) {
      const fd = new FormData()
      fd.append("name", name)
      fd.append("sku", sku)
      fd.append("category", category)
      fd.append("thickness_options", JSON.stringify(thicknessOptions))
      fd.append("price_per_m2", pricePerM2)
      if (edgebandingPrice) fd.append("edgebanding_price_per_mm", edgebandingPrice)
      fd.append("grain_direction", grainDirection)
      fd.append("file", file)
      result = await uploadMaterialAction(fd)
    } else {
      result = await createMaterialAction({
        name,
        sku,
        category,
        thickness_options: thicknessOptions,
        price_per_m2: parseFloat(pricePerM2),
        edgebanding_price_per_mm: edgebandingPrice ? parseFloat(edgebandingPrice) : null,
        grain_direction: grainDirection,
      })
    }

    if (result?.error) {
      setError(result.error)
      setIsSubmitting(false)
    }
    // On success: actions redirect to /materials — no further state update needed
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
          placeholder="16, 18, 22"
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

      <div>
        <label htmlFor="pbrFile" className="block text-xs text-slate-400 mb-1">
          PBR texture ZIP (optional)
        </label>
        <input
          ref={fileRef}
          id="pbrFile"
          type="file"
          accept=".zip"
          className="w-full text-xs text-slate-400 file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:bg-slate-700 file:text-slate-200 file:text-xs hover:file:bg-slate-600"
        />
        <p className="mt-1 text-xs text-slate-600">
          ZIP must contain albedo.png, normal.png, roughness.png, ao.png
        </p>
      </div>

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-fit px-4 py-2 rounded-md bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-sm text-white font-medium transition-colors"
      >
        {isSubmitting ? "Creating…" : "Create Material"}
      </button>
    </form>
  )
}
