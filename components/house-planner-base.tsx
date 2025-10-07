"use client"

import { useState, useMemo } from "react"
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Grid, Html } from "@react-three/drei"
import * as THREE from "three"

// --------------------------- Helper geometry / math ---------------------------
function lengthBetween(a, b) {
  const dx = a[0] - b[0]
  const dz = a[1] - b[1]
  return Math.sqrt(dx * dx + dz * dz)
}

function wallArea(length, height) {
  return length * height // sqm
}

function roofAreaFromBounds(bounds, roofPitch = 30, overhang = 0) {
  if (!bounds) return 0
  const width = Math.max(0.001, Math.abs(bounds.maxX - bounds.minX))
  const depth = Math.max(0.001, Math.abs(bounds.maxZ - bounds.minZ))
  const widthWithOverhang = width + 2 * overhang
  const depthWithOverhang = depth + 2 * overhang

  const roofRun = widthWithOverhang / 2
  const pitchRad = (roofPitch * Math.PI) / 180
  const slopeFactor = 1 / Math.cos(pitchRad)
  const singleSideArea = roofRun * depthWithOverhang * slopeFactor
  return singleSideArea * 2
}

// --------------------------- Materials/estimation ---------------------------
const rates = {
  hollowblock_per_piece: 15,
  hollowblock_size_sqm: 0.08,
  cement_bag_per_sqm: 0.45,
  cement_price_per_bag: 270,
  rebar_price_per_kg: 75,
  labor_per_sqm: 380,
  roof_price_per_sqm: 150,
}

function estimateMaterials(walls, roofArea, config = rates) {
  const results = {
    totalWallArea: 0,
    hollowblock_count: 0,
    cement_bags: 0,
    rebar_cost: 0,
    material_cost: 0,
    labor_cost: 0,
    total_cost: 0,
  }

  for (const w of walls) {
    const area = wallArea(w.length, w.height)
    results.totalWallArea += area
  }

  results.hollowblock_count = Math.ceil(results.totalWallArea / config.hollowblock_size_sqm)
  results.material_cost += results.hollowblock_count * config.hollowblock_per_piece

  results.cement_bags = Math.ceil(results.totalWallArea * config.cement_bag_per_sqm)
  results.material_cost += results.cement_bags * config.cement_price_per_bag

  const totalPerimeter = walls.reduce((s, w) => s + w.length, 0)
  const assumedRebarKg = totalPerimeter * 2
  results.rebar_cost = assumedRebarKg * config.rebar_price_per_kg
  results.material_cost += results.rebar_cost

  results.labor_cost = results.totalWallArea * config.labor_per_sqm

  const roof_material_est = roofArea * config.roof_price_per_sqm
  results.material_cost += roof_material_est

  results.total_cost = Math.round(results.material_cost + results.labor_cost)
  return results
}

// --------------------------- React Three subcomponents ---------------------------
function WallMesh({
  x1,
  z1,
  x2,
  z2,
  height = 3,
  thickness = 0.15,
  color = "#f09494ff",
  windows = [],
  frontHeight = null,
}) {
  const length = Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2)
  const midX = (x1 + x2) / 2
  const midZ = (z1 + z2) / 2
  const angle = Math.atan2(z2 - z1, x2 - x1)

  // Use frontHeight if provided (for mono slope front wall connection)
  const actualHeight = frontHeight || height

  return (
    <group>
      {/* Main wall */}
      <mesh position={[midX, actualHeight / 2, midZ]} rotation={[0, -angle, 0]}>
        <boxGeometry args={[Math.max(0.001, length), Math.max(0.001, actualHeight), Math.max(0.001, thickness)]} />
        <meshStandardMaterial color={color} metalness={0.1} roughness={0.9} />
      </mesh>

      {windows.map((window, idx) => {
        // Calculate window position relative to wall
        const windowX = midX + Math.cos(-angle) * (window.position - length / 2)
        const windowZ = midZ + Math.sin(-angle) * (window.position - length / 2)
        const windowY = actualHeight * 0.6 // Position window at 60% of wall height

        return (
          <WindowMesh
            key={idx}
            width={window.width}
            height={window.height}
            wallHeight={actualHeight}
            style={window.style}
            position={[windowX, windowY, windowZ]}
            rotation={[0, -angle, 0]}
          />
        )
      })}
    </group>
  )
}

// --------------------------- Window Mesh ---------------------------
function WindowMesh({
  width = 1,
  height = 1,
  wallHeight = 3,
  style = "rect",
  position = [0, 0, 0],
  rotation = [0, 0, 0],
}) {
  const minY = wallHeight * 0.3 // Minimum height from ground
  const maxY = wallHeight * 0.8 // Maximum height from ground
  const safeY = Math.max(Math.min(position[1], maxY), minY)

  let shapeGeom
  if (style === "rect") {
    shapeGeom = <boxGeometry args={[width, height, 0.1]} />
  } else if (style === "circle") {
    shapeGeom = <cylinderGeometry args={[width / 2, width / 2, 0.1, 32]} rotation={[Math.PI / 2, 0, 0]} />
  } else if (style === "sliding") {
    shapeGeom = (
      <group>
        <boxGeometry args={[width, height, 0.1]} />
        {/* Window frame */}
        <mesh position={[0, 0, 0.05]}>
          <boxGeometry args={[width + 0.1, height + 0.1, 0.02]} />
          <meshStandardMaterial color="#8B4513" />
        </mesh>
      </group>
    )
  }

  return (
    <mesh position={[position[0], safeY, position[2]]} rotation={rotation}>
      {shapeGeom}
      <meshStandardMaterial color="#87CEEB" transparent opacity={0.7} />
    </mesh>
  )
}

function RoofMesh({ bounds, type = "gabled", pitch = 30, wallHeight = 3, overhang = 0 }) {
  if (!bounds) return null

  const minX = bounds.minX - overhang
  const maxX = bounds.maxX + overhang
  const minZ = bounds.minZ - overhang
  const maxZ = bounds.maxZ + overhang

  const width = maxX - minX
  const depth = maxZ - minZ
  const centerX = (minX + maxX) / 2
  const centerZ = (minZ + maxZ) / 2

  const roofBaseY = wallHeight
  const pitchRad = (pitch * Math.PI) / 180

  // ---------------- Gabled roof with proper triangular geometry ----------------
  if (type === "gabled") {
    const ridgeAlongZ = width >= depth // ridge runs along the longer side

    if (ridgeAlongZ) {
      // Ridge runs along Z-axis (front to back)
      const halfWidth = width / 2
      const rise = Math.tan(pitchRad) * halfWidth
      const ridgeHeight = roofBaseY + rise

      // Create triangular roof geometry
      const roofGeometry = new THREE.BufferGeometry()
      const vertices = new Float32Array([
        // Left slope triangle (repeated for depth)
        minX,
        roofBaseY,
        minZ, // bottom left front
        centerX,
        ridgeHeight,
        minZ, // ridge front
        minX,
        roofBaseY,
        maxZ, // bottom left back

        centerX,
        ridgeHeight,
        minZ, // ridge front
        centerX,
        ridgeHeight,
        maxZ, // ridge back
        minX,
        roofBaseY,
        maxZ, // bottom left back

        // Right slope triangle
        centerX,
        ridgeHeight,
        minZ, // ridge front
        maxX,
        roofBaseY,
        minZ, // bottom right front
        centerX,
        ridgeHeight,
        maxZ, // ridge back

        maxX,
        roofBaseY,
        minZ, // bottom right front
        maxX,
        roofBaseY,
        maxZ, // bottom right back
        centerX,
        ridgeHeight,
        maxZ, // ridge back

        // End triangles
        minX,
        roofBaseY,
        minZ, // front triangle
        maxX,
        roofBaseY,
        minZ,
        centerX,
        ridgeHeight,
        minZ,

        minX,
        roofBaseY,
        maxZ, // back triangle
        centerX,
        ridgeHeight,
        maxZ,
        maxX,
        roofBaseY,
        maxZ,
      ])

      roofGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3))
      roofGeometry.computeVertexNormals()

      return (
        <mesh geometry={roofGeometry} position={[0, 0, 0]}>
          <meshStandardMaterial color="#8B4513" side={THREE.DoubleSide} />
        </mesh>
      )
    } else {
      // Ridge runs along X-axis (left to right)
      const halfDepth = depth / 2
      const rise = Math.tan(pitchRad) * halfDepth
      const ridgeHeight = roofBaseY + rise

      const roofGeometry = new THREE.BufferGeometry()
      const vertices = new Float32Array([
        // Front slope
        minX,
        roofBaseY,
        minZ, // bottom front left
        minX,
        roofBaseY,
        centerZ, // ridge left
        maxX,
        roofBaseY,
        minZ, // bottom front right

        minX,
        roofBaseY,
        centerZ, // ridge left
        maxX,
        roofBaseY,
        centerZ, // ridge right
        maxX,
        roofBaseY,
        minZ, // bottom front right

        // Back slope
        minX,
        roofBaseY,
        centerZ, // ridge left
        minX,
        roofBaseY,
        maxZ, // bottom back left
        maxX,
        roofBaseY,
        centerZ, // ridge right

        minX,
        roofBaseY,
        maxZ, // bottom back left
        maxX,
        roofBaseY,
        maxZ, // bottom back right
        maxX,
        roofBaseY,
        centerZ, // ridge right

        // End triangles
        minX,
        roofBaseY,
        minZ, // left triangle
        minX,
        roofBaseY,
        maxZ,
        minX,
        ridgeHeight,
        centerZ,

        maxX,
        roofBaseY,
        minZ, // right triangle
        maxX,
        ridgeHeight,
        centerZ,
        maxX,
        roofBaseY,
        maxZ,
      ])

      roofGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3))
      roofGeometry.computeVertexNormals()

      return (
        <mesh geometry={roofGeometry} position={[0, 0, 0]}>
          <meshStandardMaterial color="#8B4513" side={THREE.DoubleSide} />
        </mesh>
      )
    }
  }

  // ---------------- Mono slope with proper slanted geometry ----------------
  if (type === "mono") {
    const fixedPitch = 25 // Fixed 25-degree angle
    const fixedPitchRad = (fixedPitch * Math.PI) / 180
    const rise = Math.tan(fixedPitchRad) * depth

    const monoGeometry = new THREE.BufferGeometry()
    const vertices = new Float32Array([
      // Main slanted surface
      minX,
      roofBaseY,
      minZ, // front left (low)
      maxX,
      roofBaseY,
      minZ, // front right (low)
      minX,
      roofBaseY + rise,
      maxZ, // back left (high)

      maxX,
      roofBaseY,
      minZ, // front right (low)
      maxX,
      roofBaseY + rise,
      maxZ, // back right (high)
      minX,
      roofBaseY + rise,
      maxZ, // back left (high)

      // Left end triangle connecting front wall to raised end
      minX,
      roofBaseY,
      minZ, // front left (low)
      minX,
      roofBaseY + rise,
      maxZ, // back left (high)
      minX,
      roofBaseY,
      maxZ, // back left at wall height

      // Right end triangle connecting front wall to raised end
      maxX,
      roofBaseY,
      minZ, // front right (low)
      maxX,
      roofBaseY,
      maxZ, // back right at wall height
      maxX,
      roofBaseY + rise,
      maxZ, // back right (high)
    ])

    monoGeometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3))
    monoGeometry.computeVertexNormals()

    return (
      <mesh geometry={monoGeometry} position={[0, 0, 0]}>
        <meshStandardMaterial color="#CD853F" side={THREE.DoubleSide} />
      </mesh>
    )
  }

  // ---------------- Flat roof ----------------
  return (
    <mesh position={[centerX, roofBaseY + 0.1, centerZ]}>
      <boxGeometry args={[width, 0.2, depth]} />
      <meshStandardMaterial color="#ff6f00ff" />
    </mesh>
  )
}

function Legend({ bounds, wallHeight }) {
  if (!bounds) return null
  const { minX, maxX, minZ, maxZ } = bounds
  const y = wallHeight + 0.5
  return (
    <>
      <Html position={[(minX + maxX) / 2, y, minZ - 1]} center>
        <div className="bg-white p-1 text-xs rounded shadow">Front</div>
      </Html>
      <Html position={[(minX + maxX) / 2, y, maxZ + 1]} center>
        <div className="bg-white p-1 text-xs rounded shadow">Back</div>
      </Html>
      <Html position={[minX - 1, y, (minZ + maxZ) / 2]} center>
        <div className="bg-white p-1 text-xs rounded shadow">Left</div>
      </Html>
      <Html position={[maxX + 1, y, (minZ + maxZ) / 2]} center>
        <div className="bg-white p-1 text-xs rounded shadow">Right</div>
      </Html>
    </>
  )
}

// --------------------------- Main Component ---------------------------
export default function HousePlanner() {
  const defaultSideMeters = 10
  const [footprintSide, setFootprintSide] = useState(defaultSideMeters)

  function makeRectangleWalls(side, wallHeight = 3, wallThickness = 0.15) {
    const h = side / 2
    const s = side
    return [
      {
        x1: -h,
        z1: -h,
        x2: h,
        z2: -h,
        length: s,
        height: wallHeight,
        thickness: wallThickness,
        windows: [], // No predefined windows
      },
      {
        x1: h,
        z1: -h,
        x2: h,
        z2: h,
        length: s,
        height: wallHeight,
        thickness: wallThickness,
        windows: [], // No predefined windows
      },
      {
        x1: h,
        z1: h,
        x2: -h,
        z2: h,
        length: s,
        height: wallHeight,
        thickness: wallThickness,
        windows: [], // No predefined windows
      },
      {
        x1: -h,
        z1: h,
        x2: -h,
        z2: -h,
        length: s,
        height: wallHeight,
        thickness: wallThickness,
        windows: [], // No predefined windows
      },
    ]
  }

  const initialWalls = useMemo(() => makeRectangleWalls(defaultSideMeters), [])

  const [walls, setWalls] = useState(initialWalls)
  const [height, setHeight] = useState(3)
  const [thickness, setThickness] = useState(0.15)
  const [estimate, setEstimate] = useState(null)
  const [roofPitch, setRoofPitch] = useState(30)
  const [roofType, setRoofType] = useState("gabled")
  const [snapSize, setSnapSize] = useState(0.5)
  const [axisAligned, setAxisAligned] = useState(true)
  const [snapRadiusState, setSnapRadiusState] = useState(0.6)
  const [overhangFactor, setOverhangFactor] = useState(1.5)

  const [selectedWall, setSelectedWall] = useState(0)
  const [windowWidth, setWindowWidth] = useState(1.2)
  const [windowHeight, setWindowHeight] = useState(1.0)
  const [windowStyle, setWindowStyle] = useState("rect")
  const [windowPosition, setWindowPosition] = useState(5)

  function addWindow() {
    if (selectedWall >= 0 && selectedWall < walls.length) {
      const updatedWalls = [...walls]
      const wall = updatedWalls[selectedWall]
      const newWindow = {
        position: Math.min(windowPosition, wall.length - 0.5),
        width: windowWidth,
        height: windowHeight,
        style: windowStyle,
      }
      updatedWalls[selectedWall] = {
        ...wall,
        windows: [...(wall.windows || []), newWindow],
      }
      setWalls(updatedWalls)
    }
  }

  function removeLastWindow() {
    if (selectedWall >= 0 && selectedWall < walls.length) {
      const updatedWalls = [...walls]
      const wall = updatedWalls[selectedWall]
      if (wall.windows && wall.windows.length > 0) {
        updatedWalls[selectedWall] = {
          ...wall,
          windows: wall.windows.slice(0, -1),
        }
        setWalls(updatedWalls)
      }
    }
  }

  const bounds = useMemo(() => {
    if (!walls || walls.length === 0) return null
    const xs = []
    const zs = []
    walls.forEach((w) => {
      xs.push(w.x1, w.x2)
      zs.push(w.z1, w.z2)
    })
    return { minX: Math.min(...xs), maxX: Math.max(...xs), minZ: Math.min(...zs), maxZ: Math.max(...zs) }
  }, [walls])

  const wallHeights = useMemo(() => {
    if (roofType === "mono" && bounds) {
      const fixedPitch = 25
      const fixedPitchRad = (fixedPitch * Math.PI) / 180
      const depth = bounds.maxZ - bounds.minZ
      const rise = Math.tan(fixedPitchRad) * depth

      return walls.map((wall) => {
        // Front wall (minZ) stays at base height, back wall (maxZ) gets full rise
        const wallMidZ = (wall.z1 + wall.z2) / 2
        const normalizedZ = (wallMidZ - bounds.minZ) / depth
        return height + rise * normalizedZ
      })
    }
    return walls.map(() => height)
  }, [walls, roofType, bounds, height])

  function applyFootprintSize() {
    const newWalls = makeRectangleWalls(footprintSide, height, thickness)
    setWalls(newWalls)
    setEstimate(null)
  }

  function computeEstimate() {
    const maxThickness = walls.reduce((m, w) => Math.max(m, w.thickness || 0), 0.15)
    const overhang = Math.max(0, maxThickness * overhangFactor)
    const roofA = roofAreaFromBounds(bounds, roofPitch, overhang)
    const est = estimateMaterials(walls, roofA, rates)
    setEstimate({
      ...est,
      roofArea: Math.round(roofA * 100) / 100,
      wallsCount: walls.length,
      overhang: Math.round(overhang * 1000) / 1000,
    })
  }

  function resetScene() {
    setWalls(makeRectangleWalls(defaultSideMeters))
    setFootprintSide(defaultSideMeters)
    setEstimate(null)
    setHeight(3)
    setThickness(0.15)
    setRoofPitch(30)
    setRoofType("gabled")
  }

  function deleteLast() {
    setWalls((w) => w.slice(0, -1))
  }

  function exportJSON() {
    const payload = { walls, roofType, roofPitch }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(payload, null, 2))
    const dlAnchorElem = document.createElement("a")
    dlAnchorElem.setAttribute("href", dataStr)
    dlAnchorElem.setAttribute("download", "house-design.json")
    dlAnchorElem.click()
  }

  const currentMaxThickness = walls.reduce((m, w) => Math.max(m, w.thickness || 0), 0.15)
  const currentOverhang = Math.max(0, currentMaxThickness * overhangFactor)

  return (
    <div className="w-full h-screen flex">
      <div className="w-3/4 h-full relative">
        <Canvas camera={{ position: [20, 20, 20], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <directionalLight position={[10, 20, 5]} intensity={0.8} />

          <OrbitControls makeDefault />

          <Grid args={[200, 200]} sectionColor="#444" />

          {walls.map((w, i) => (
            <WallMesh
              key={i}
              x1={w.x1}
              z1={w.z1}
              x2={w.x2}
              z2={w.z2}
              height={wallHeights[i]}
              thickness={w.thickness}
              windows={w.windows || []}
            />
          ))}

          <RoofMesh bounds={bounds} type={roofType} pitch={roofPitch} wallHeight={height} overhang={currentOverhang} />

          <Legend bounds={bounds} wallHeight={height} />
        </Canvas>
      </div>

      <div className="w-1/4 p-4 bg-white/80 overflow-auto">
        <h2 className="text-xl font-semibold mb-2">House Planner (Enhanced)</h2>

        <label className="block text-sm">Footprint side (m)</label>
        <input
          type="range"
          min="3"
          max="14"
          step="0.5"
          value={footprintSide}
          onChange={(e) => setFootprintSide(Number.parseFloat(e.target.value))}
          className="w-full mb-2"
        />
        <div className="text-sm mb-2">
          Side: {footprintSide} m — Footprint: {Math.round(footprintSide * footprintSide)} sqm
        </div>
        <button onClick={applyFootprintSize} className="px-3 py-2 bg-indigo-600 text-white rounded mb-4">
          Apply Footprint Size
        </button>

        <label className="block text-sm">Wall height (m)</label>
        <input
          type="number"
          step="0.1"
          value={height}
          onChange={(e) => setHeight(Number.parseFloat(e.target.value) || 0)}
          className="w-full p-2 mb-2 border rounded"
        />

        <label className="block text-sm">Wall thickness (m)</label>
        <input
          type="number"
          step="0.01"
          value={thickness}
          onChange={(e) => setThickness(Number.parseFloat(e.target.value) || 0)}
          className="w-full p-2 mb-2 border rounded"
        />

        <label className="block text-sm">Roof pitch (deg)</label>
        <input
          type="number"
          step="1"
          value={roofPitch}
          onChange={(e) => setRoofPitch(Number.parseFloat(e.target.value) || 0)}
          className="w-full p-2 mb-2 border rounded"
        />

        <label className="block text-sm">Roof style</label>
        <select
          value={roofType}
          onChange={(e) => setRoofType(e.target.value)}
          className="w-full p-2 mb-2 border rounded"
        >
          <option value="gabled">Gabled (Triangular)</option>
          <option value="mono">Single slope (mono) - Fixed 25°</option>
          <option value="flat">Flat</option>
        </select>

        <div className="mt-4 p-3 bg-blue-50 border rounded">
          <h3 className="font-semibold mb-2">Window Management</h3>

          <label className="block text-sm">Select Wall</label>
          <select
            value={selectedWall}
            onChange={(e) => setSelectedWall(Number(e.target.value))}
            className="w-full p-2 mb-2 border rounded"
          >
            {walls.map((_, i) => (
              <option key={i} value={i}>
                Wall {i + 1} ({Math.round(walls[i].length * 100) / 100}m)
              </option>
            ))}
          </select>

          <label className="block text-sm">Window Position (m from start)</label>
          <input
            type="number"
            step="0.1"
            min="0.5"
            max={walls[selectedWall]?.length - 0.5 || 10}
            value={windowPosition}
            onChange={(e) => setWindowPosition(Number.parseFloat(e.target.value) || 5)}
            className="w-full p-2 mb-2 border rounded"
          />

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block text-sm">Width (m)</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="3"
                value={windowWidth}
                onChange={(e) => setWindowWidth(Number.parseFloat(e.target.value) || 1.2)}
                className="w-full p-2 mb-2 border rounded"
              />
            </div>
            <div>
              <label className="block text-sm">Height (m)</label>
              <input
                type="number"
                step="0.1"
                min="0.5"
                max="2.5"
                value={windowHeight}
                onChange={(e) => setWindowHeight(Number.parseFloat(e.target.value) || 1.0)}
                className="w-full p-2 mb-2 border rounded"
              />
            </div>
          </div>

          <label className="block text-sm">Window Style</label>
          <select
            value={windowStyle}
            onChange={(e) => setWindowStyle(e.target.value)}
            className="w-full p-2 mb-2 border rounded"
          >
            <option value="rect">Rectangular</option>
            <option value="circle">Circular</option>
            <option value="sliding">Sliding</option>
          </select>

          <div className="flex gap-2">
            <button onClick={addWindow} className="px-3 py-2 bg-green-600 text-white rounded">
              Add Window
            </button>
            <button onClick={removeLastWindow} className="px-3 py-2 bg-red-600 text-white rounded">
              Remove Last
            </button>
          </div>
        </div>

        <div className="flex gap-2 mt-2">
          <button onClick={computeEstimate} className="px-3 py-2 bg-blue-600 text-white rounded">
            Estimate Cost
          </button>
          <button onClick={resetScene} className="px-3 py-2 bg-gray-600 text-white rounded">
            Reset to 10x10m
          </button>
        </div>

        <div className="flex gap-2 mt-2">
          <button onClick={deleteLast} className="px-3 py-2 bg-red-600 text-white rounded">
            Delete Last Wall
          </button>
          <button onClick={exportJSON} className="px-3 py-2 bg-green-600 text-white rounded">
            Export JSON
          </button>
        </div>

        <div className="mt-4 text-sm">
          <p>
            <strong>Enhanced Features:</strong>
          </p>
          <ul className="list-disc list-inside text-xs">
            <li>Mono slope roof fixed at 25° with proper wall connections</li>
            <li>User-controlled window placement system</li>
            <li>Variable wall heights for mono slope roofs</li>
            <li>Improved roof geometry and functionality</li>
          </ul>
        </div>

        {walls.length > 0 && (
          <div className="mt-4">
            <h3 className="font-medium">Walls & Windows</h3>
            <ul className="text-sm max-h-40 overflow-auto">
              {walls.map((w, i) => (
                <li key={i} className="py-1">
                  Wall {i + 1}: {Math.round(w.length * 100) / 100} m — {w.windows?.length || 0} windows
                </li>
              ))}
            </ul>
          </div>
        )}

        {estimate && (
          <div className="mt-4 p-3 bg-gray-50 border rounded">
            <h3 className="font-semibold">Estimate</h3>
            <p>Walls: {estimate.wallsCount}</p>
            <p>Total wall area: {Math.round(estimate.totalWallArea * 100) / 100} sqm</p>
            <p>Roof area (approx): {estimate.roofArea} sqm</p>
            <p>Roof overhang used: {estimate.overhang} m</p>
            <p>Hollowblocks (est): {estimate.hollowblock_count}</p>
            <p>Cement bags (est): {estimate.cement_bags}</p>
            <p>Material cost (est): ₱{estimate.material_cost.toLocaleString()}</p>
            <p>Labor cost (est): ₱{estimate.labor_cost.toLocaleString()}</p>
            <p className="font-semibold">Total (est): ₱{estimate.total_cost.toLocaleString()}</p>
          </div>
        )}

        <div className="mt-4 text-xs text-gray-600">
          <p>
            Enhanced with proper 3D roof geometry and functional windows. Gabled roofs now create realistic triangular
            shapes, and windows are automatically placed on walls with different styles (rectangular, circular,
            sliding).
          </p>
        </div>
      </div>
    </div>
  )
}
