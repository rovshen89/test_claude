"use client"

import { useEffect, useRef, useState } from "react"
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  MeshBuilder,
  PBRMaterial,
  StandardMaterial,
  Color3,
  Color4,
  type Mesh,
} from "@babylonjs/core"

type DimensionSpec = { min: number; max: number; step: number; default: number }
type Schema = { dimensions?: Record<string, DimensionSpec> }

type Props = {
  dimensions: Record<string, number>
  schema: Record<string, unknown>
}

export default function BabylonScene({ dimensions, schema }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const shadowGenRef = useRef<ShadowGenerator | null>(null)
  const woodMatRef = useRef<PBRMaterial | null>(null)
  const edgeMatRef = useRef<PBRMaterial | null>(null)
  const meshesRef = useRef<Mesh[]>([])
  const [webGLUnsupported, setWebGLUnsupported] = useState(false)

  // Mount once: create engine, scene, camera, lights, materials
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    let engine: Engine
    try {
      engine = new Engine(canvas, true)
    } catch {
      setWebGLUnsupported(true)
      return
    }

    const scene = new Scene(engine)
    scene.clearColor = new Color4(0.025, 0.05, 0.11, 1)

    const camera = new ArcRotateCamera("cam", -Math.PI / 4, Math.PI / 3.2, 7, new Vector3(0, 1, 0), scene)
    camera.attachControl(canvas, true)
    camera.lowerRadiusLimit = 2
    camera.upperRadiusLimit = 20
    camera.wheelPrecision = 60

    const hemi = new HemisphericLight("hemi", new Vector3(0, 1, 0), scene)
    hemi.intensity = 0.45
    hemi.groundColor = new Color3(0.04, 0.07, 0.14)

    const dir = new DirectionalLight("dir", new Vector3(-1, -2, -1), scene)
    dir.intensity = 1.1
    dir.position = new Vector3(4, 8, 4)

    const shadowGen = new ShadowGenerator(1024, dir)
    shadowGen.useBlurExponentialShadowMap = true

    const ground = MeshBuilder.CreateGround("ground", { width: 14, height: 14 }, scene)
    const gm = new StandardMaterial("groundMat", scene)
    gm.diffuseColor = new Color3(0.05, 0.09, 0.16)
    gm.specularColor = new Color3(0, 0, 0)
    ground.material = gm
    ground.receiveShadows = true

    const woodMat = new PBRMaterial("wood", scene)
    woodMat.albedoColor = new Color3(0.75, 0.6, 0.44)
    woodMat.metallic = 0
    woodMat.roughness = 0.65

    const edgeMat = new PBRMaterial("edge", scene)
    edgeMat.albedoColor = new Color3(0.55, 0.42, 0.28)
    edgeMat.metallic = 0
    edgeMat.roughness = 0.85

    engineRef.current = engine
    sceneRef.current = scene
    cameraRef.current = camera
    shadowGenRef.current = shadowGen
    woodMatRef.current = woodMat
    edgeMatRef.current = edgeMat

    engine.runRenderLoop(() => scene.render())
    const handleResize = () => engine.resize()
    window.addEventListener("resize", handleResize)

    return () => {
      window.removeEventListener("resize", handleResize)
      engine.dispose()
    }
  }, [])

  // Rebuild mesh whenever dimensions change
  useEffect(() => {
    const scene = sceneRef.current
    const shadowGen = shadowGenRef.current
    const camera = cameraRef.current
    const woodMat = woodMatRef.current
    const edgeMat = edgeMatRef.current
    if (!scene || scene.isDisposed || !shadowGen || !camera || !woodMat || !edgeMat) return

    const sceneNN = scene
    const shadowGenNN = shadowGen
    const woodMatNN = woodMat

    meshesRef.current.forEach((m) => m.dispose())
    meshesRef.current = []

    const schemaCast = schema as Schema
    const dimSpecs = schemaCast.dimensions ?? {}

    const w = dimensions.width ?? dimSpecs.width?.default ?? 900
    const h = dimensions.height ?? dimSpecs.height?.default ?? 720
    const d = dimensions.depth ?? dimSpecs.depth?.default ?? 300

    const SCALE = 0.003
    const sw = w * SCALE
    const sh = h * SCALE
    const sd = d * SCALE
    const pt = 0.054

    function addPanel(
      name: string,
      sx: number,
      sy: number,
      sz: number,
      px: number,
      py: number,
      pz: number,
      mat?: PBRMaterial
    ) {
      const box = MeshBuilder.CreateBox(name, { width: sx, height: sy, depth: sz }, sceneNN)
      box.position.set(px, py, pz)
      box.material = mat ?? woodMatNN
      box.receiveShadows = true
      shadowGenNN.addShadowCaster(box)
      meshesRef.current.push(box)
    }

    const yb = sh / 2
    addPanel("left",   pt,        sh - pt * 2, sd,       -sw / 2 + pt / 2, yb,          0)
    addPanel("right",  pt,        sh - pt * 2, sd,        sw / 2 - pt / 2, yb,          0)
    addPanel("top",    sw,        pt,          sd,         0,               sh + pt / 2, 0)
    addPanel("bottom", sw,        pt,          sd,         0,               pt / 2,      0)
    addPanel("back",   sw - pt*2, sh,          pt * 0.4,  0,               yb,          -sd / 2 + pt * 0.2, edgeMat)
    if (sh > 0.45) {
      addPanel("shelf", sw - pt*2, pt, sd - pt, 0, sh * 0.55, pt * 0.4)
    }

    camera.setTarget(new Vector3(0, sh / 2, 0))
  }, [dimensions, schema])

  if (webGLUnsupported) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-slate-950">
        <p className="text-slate-400 text-sm">3D preview not supported in this browser.</p>
      </div>
    )
  }

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full outline-none block" />
}
