"use client"

import { useCallback, useState, useEffect, useMemo } from "react" // Added useEffect
import { Canvas } from "@react-three/fiber"
import { OrbitControls, Grid, Html, Environment } from "@react-three/drei"
import * as THREE from "three" // Import THREE for geometry creation
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { AlertTriangle, Home, Calculator, Eye, Sun, Moon, Plus, Trash2, Move, Stars as Stairs } from 'lucide-react'
import FloorPlanDesigner from "./floor-plan-designer"
import PlotValidator from "./plot-validator"
import ProjectManager from "./project-manager"

// Types and Interfaces
interface Point2D {
  x: number
  z: number
}

interface Window {
  id: string
  position: number // 0-1 along wall
  width: number
  height: number
  style: "rectangular" | "arched" | "bay" | "sliding" | "casement" | "awning" // Added more window styles
  sillHeight: number
  color: string // Added color property
}

interface Door {
  id: string
  position: number
  width: number
  height: number
  style: "single" | "double" | "sliding" | "french" | "bifold" | "pocket" // Added more door styles
  color: string // Added color property
}

interface Staircase {
  id: string
  position: Point2D
  rotation: number
  width: number
  fromFloor: number
  toFloor: number
  style: "straight" | "L-shaped" | "U-shaped" | "spiral"
  color: string
}

interface Wall {
  id: string
  start: Point2D
  end: Point2D
  height: number
  thickness: number
  windows: Window[]
  doors: Door[]
  material: string
  color: string // Added color property for walls
  wallType: "solid" | "railing"
}

interface FloorPlan {
  walls: Wall[]
  totalArea: number
  plotBounds: { width: number; depth: number }
  floors: Floor[] // Added floors array
  staircases: Staircase[] // Added staircases array
  roofStyle: "flat" | "gable" | "shed" // Added roof style options
  roofColor: string // Added roof color
  roofSlopeDirection: "north" | "south" | "east" | "west"
}

interface Floor {
  id: string
  level: number
  height: number
  walls: Wall[]
  beams: Beam[] // Added beams for structural support
  color: string // Added floor color
  texture: "concrete" | "wood" | "tile" | "marble" | "carpet" // Added floor texture type
}

interface Beam {
  id: string
  start: Point2D
  end: Point2D
  height: number
  width: number
  depth: number
  material: string
  color: string
  floorLevel: number
}

interface MaterialEstimate {
  concrete: { volume: number; cost: number }
  steel: { weight: number; cost: number }
  blocks: { count: number; cost: number }
  roofing: { area: number; cost: number }
  windows: { count: number; cost: number }
  doors: { count: number; cost: number }
  beams: { count: number; cost: number } // Added beam costs
  staircases: { count: number; cost: number } // Added staircases cost
  labor: { cost: number }
  total: number
}

interface MaterialPrices {
  concrete_per_m3: number
  steel_per_kg: number
  blocks_per_piece: number
  blocks_per_m2: number
  roofing_per_m2: number
  window_per_m2: number
  door_per_piece: number
  beam_per_m: number
  staircase_per_flight: number
  labor_per_m2: number
  foundation_per_m: number
}

const DEFAULT_MATERIAL_RATES: MaterialPrices = {
  concrete_per_m3: 4500,
  steel_per_kg: 75,
  blocks_per_piece: 15,
  blocks_per_m2: 12.5,
  roofing_per_m2: 350,
  window_per_m2: 2500,
  door_per_piece: 8000,
  beam_per_m: 1200, // Added beam cost per meter
  staircase_per_flight: 35000, // Added staircase cost
  labor_per_m2: 1200,
  foundation_per_m: 800,
}

// Utility functions
function calculateDistance(p1: Point2D, p2: Point2D): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2))
}

function calculateWallArea(wall: Wall): number {
  const length = calculateDistance(wall.start, wall.end)
  return length * wall.height
}

function calculatePolygonArea(points: Point2D[]): number {
  if (points.length < 3) return 0
  let area = 0
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length
    area += points[i].x * points[j].z
    area -= points[j].x * points[i].z
  }
  return Math.abs(area) / 2
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

function detectOverhangAreas(
  floor1Walls: Wall[],
  floor2Walls: Wall[],
): { hasOverhang: boolean; overhangWalls: string[] } {
  if (floor1Walls.length === 0 || floor2Walls.length === 0) {
    return { hasOverhang: false, overhangWalls: [] }
  }

  // Get floor 1 perimeter bounds
  const floor1Points: Point2D[] = []
  floor1Walls.forEach((wall) => {
    floor1Points.push(wall.start, wall.end)
  })

  const floor1MinX = Math.min(...floor1Points.map((p) => p.x))
  const floor1MaxX = Math.max(...floor1Points.map((p) => p.x))
  const floor1MinZ = Math.min(...floor1Points.map((p) => p.z))
  const floor1MaxZ = Math.max(...floor1Points.map((p) => p.z))

  // Check if any floor 2 walls extend beyond floor 1
  const overhangWalls: string[] = []
  let hasOverhang = false

  floor2Walls.forEach((wall) => {
    const wallMidX = (wall.start.x + wall.end.x) / 2
    const wallMidZ = (wall.start.z + wall.end.z) / 2

    // Check if wall is outside floor 1 bounds
    if (
      wallMidX < floor1MinX - 0.5 ||
      wallMidX > floor1MaxX + 0.5 ||
      wallMidZ < floor1MinZ - 0.5 ||
      wallMidZ > floor1MaxZ + 0.5
    ) {
      hasOverhang = true
      overhangWalls.push(wall.id)
    }
  })

  return { hasOverhang, overhangWalls }
}

function generateSupportBeams(floor1Walls: Wall[], floor2Walls: Wall[], floorHeight: number): Beam[] {
  const beams: Beam[] = []
  const { hasOverhang, overhangWalls } = detectOverhangAreas(floor1Walls, floor2Walls)

  if (!hasOverhang) return beams

  // For each overhang wall, create support beams at the corners
  floor2Walls.forEach((wall) => {
    if (overhangWalls.includes(wall.id)) {
      // Add beam at start of wall
      beams.push({
        id: `beam-${wall.id}-start`,
        start: wall.start,
        end: wall.start,
        height: floorHeight,
        width: 0.2,
        depth: 0.2,
        material: "steel",
        color: "#4b5563",
        floorLevel: 1,
      })

      // Add beam at end of wall
      beams.push({
        id: `beam-${wall.id}-end`,
        start: wall.end,
        end: wall.end,
        height: floorHeight,
        width: 0.2,
        depth: 0.2,
        material: "steel",
        color: "#4b5563",
        floorLevel: 1,
      })
    }
  })

  return beams
}

// 3D Components with enhanced visualization

function BeamMesh({ beam, floorBaseHeight }: { beam: Beam; floorBaseHeight: number }) {
  return (
    <mesh position={[beam.start.x, floorBaseHeight + beam.height / 2, beam.start.z]} castShadow receiveShadow>
      <boxGeometry args={[beam.width, beam.height, beam.depth]} />
      <meshStandardMaterial
        color={beam.color}
        metalness={beam.material === "steel" ? 0.8 : 0.1}
        roughness={beam.material === "steel" ? 0.2 : 0.8}
      />
    </mesh>
  )
}

function WallMesh({
  wall,
  isSelected,
  onClick,
  isFromLowerFloor = false,
}: {
  wall: Wall
  isSelected: boolean
  onClick: () => void
  isFromLowerFloor?: boolean
}) {
  const length = calculateDistance(wall.start, wall.end)
  const midX = (wall.start.x + wall.end.x) / 2
  const midZ = (wall.start.z + wall.end.z) / 2
  const angle = Math.atan2(wall.end.z - wall.start.z, wall.end.x - wall.start.x)

  const wallColor = isFromLowerFloor
    ? "#9ca3af" // Gray color for lower floor walls
    : isSelected
      ? "#3b82f6"
      : wall.color

  if (wall.wallType === "railing") {
    const railingHeight = wall.height / 4
    const postCount = Math.floor(length / 0.5) + 1 // Adjust spacing as needed

    return (
      <group>
        {/* Railing posts */}
        {Array.from({ length: postCount }).map((_, i) => {
          const t = i / (postCount - 1)
          const postX = wall.start.x + (wall.end.x - wall.start.x) * t
          const postZ = wall.start.z + (wall.end.z - wall.start.z) * t

          return (
            <mesh key={`post-${i}`} position={[postX, railingHeight / 2, postZ]} castShadow>
              <boxGeometry args={[0.08, railingHeight, 0.08]} />
              <meshStandardMaterial color={wall.color} metalness={0.6} roughness={0.3} />
            </mesh>
          )
        })}

        {/* Top rail */}
        <mesh position={[midX, railingHeight - 0.05, midZ]} rotation={[0, -angle, 0]} castShadow>
          <boxGeometry args={[length, 0.1, 0.1]} />
          <meshStandardMaterial color={wall.color} metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Middle rail */}
        <mesh position={[midX, railingHeight / 2, midZ]} rotation={[0, -angle, 0]} castShadow>
          <boxGeometry args={[length, 0.08, 0.08]} />
          <meshStandardMaterial color={wall.color} metalness={0.6} roughness={0.3} />
        </mesh>

        {/* Bottom rail */}
        <mesh
          position={[midX, 0.1, midZ]} // Position slightly above the floor
          rotation={[0, -angle, 0]}
          castShadow
        >
          <boxGeometry args={[length, 0.08, 0.08]} />
          <meshStandardMaterial color={wall.color} metalness={0.6} roughness={0.3} />
        </mesh>
      </group>
    )
  }

  // Original solid wall rendering
  return (
    <group>
      {/* Main wall with conditional color */}
      <mesh
        position={[midX, wall.height / 2, midZ]}
        rotation={[0, -angle, 0]}
        onClick={onClick}
        castShadow
        receiveShadow
      >
        <boxGeometry args={[length, wall.height, wall.thickness]} />
        <meshStandardMaterial
          color={wallColor}
          metalness={wall.material === "concrete" ? 0.1 : 0.0}
          roughness={wall.material === "wood" ? 0.8 : 0.9}
          opacity={isFromLowerFloor ? 0.7 : 1.0}
          transparent={isFromLowerFloor}
        />
      </mesh>

      {/* Only show windows/doors for current floor walls, not lower floor reference walls */}
      {!isFromLowerFloor && (
        <>
          {/* Enhanced windows with proper cutouts and frames */}
          {wall.windows.map((window) => {
            const windowX = wall.start.x + (wall.end.x - wall.start.x) * window.position
            const windowZ = wall.start.z + (wall.end.z - wall.start.z) * window.position
            const windowY = window.sillHeight + window.height / 2

            // Calculate perpendicular direction OUTWARD from the wall
            const wallDx = wall.end.x - wall.start.x
            const wallDz = wall.end.z - wall.start.z
            const wallLength = Math.sqrt(wallDx * wallDx + wallDz * wallDz)
            const perpX = wallDz / wallLength
            const perpZ = -wallDx / wallLength
            const protrusionDepth = 0.15 // Protrude 15cm outward
            const internalProtrusion = 0.08 // Protrude 8cm inward

            return (
              <group key={window.id}>
                {/* Window opening (actual cutout effect) */}
                <mesh position={[windowX, windowY, windowZ]} rotation={[0, -angle, 0]}>
                  <boxGeometry args={[window.width + 0.02, window.height + 0.02, wall.thickness + 0.02]} />
                  <meshStandardMaterial color="#000000" transparent opacity={0} />
                </mesh>

                {/* Window glass - outward side */}
                <mesh
                  position={[windowX + perpX * protrusionDepth, windowY, windowZ + perpZ * protrusionDepth]}
                  rotation={[0, -angle, 0]}
                  castShadow
                >
                  <boxGeometry args={[window.width - 0.05, window.height - 0.05, 0.02]} />
                  <meshStandardMaterial color="#87CEEB" transparent opacity={0.6} />
                </mesh>

                {/* Window glass - inward side */}
                <mesh
                  position={[windowX - perpX * internalProtrusion, windowY, windowZ - perpZ * internalProtrusion]}
                  rotation={[0, -angle, 0]}
                  castShadow
                >
                  <boxGeometry args={[window.width - 0.05, window.height - 0.05, 0.02]} />
                  <meshStandardMaterial color="#87CEEB" transparent opacity={0.6} />
                </mesh>

                {/* Window frame - outward */}
                <mesh
                  position={[windowX + perpX * protrusionDepth, windowY, windowZ + perpZ * protrusionDepth]}
                  rotation={[0, -angle, 0]}
                >
                  <boxGeometry args={[window.width, window.height, 0.08]} />
                  <meshStandardMaterial color={window.color} />
                </mesh>

                {/* Window frame - inward */}
                <mesh
                  position={[windowX - perpX * internalProtrusion, windowY, windowZ - perpZ * internalProtrusion]}
                  rotation={[0, -angle, 0]}
                >
                  <boxGeometry args={[window.width, window.height, 0.08]} />
                  <meshStandardMaterial color={window.color} />
                </mesh>

                {/* Window sill - outward */}
                <mesh
                  position={[
                    windowX + perpX * protrusionDepth,
                    window.sillHeight - 0.05,
                    windowZ + perpZ * protrusionDepth,
                  ]}
                  rotation={[0, -angle, 0]}
                >
                  <boxGeometry args={[window.width + 0.1, 0.1, 0.15]} />
                  <meshStandardMaterial color={window.color} />
                </mesh>

                {/* Window sill - inward */}
                <mesh
                  position={[
                    windowX - perpX * internalProtrusion,
                    window.sillHeight - 0.05,
                    windowZ - perpZ * internalProtrusion,
                  ]}
                  rotation={[0, -angle, 0]}
                >
                  <boxGeometry args={[window.width + 0.1, 0.1, 0.15]} />
                  <meshStandardMaterial color={window.color} />
                </mesh>
              </group>
            )
          })}

          {/* Enhanced doors with proper cutouts and frames */}
          {wall.doors.map((door) => {
            const doorX = wall.start.x + (wall.end.x - wall.start.x) * door.position
            const doorZ = wall.start.z + (wall.end.z - wall.start.z) * door.position
            const doorY = door.height / 2

            const wallDx = wall.end.x - wall.start.x
            const wallDz = wall.end.z - wall.start.z
            const wallLength = Math.sqrt(wallDx * wallDx + wallDz * wallDz)
            const perpX = -wallDz / wallLength
            const perpZ = wallDx / wallLength

            // Frame and panel offsets
            const frameOffset = wall.thickness / 2 + 0.05 // 5cm past wall surface
            const panelOffset = wall.thickness / 2 + 0.03 // 3cm past wall surface
            const handleHeight = 1.0 // 1m from base
            const handleInset = 0.02 // 2cm from panel surface
            const handleOffset = (door.width / 2) - 0.15 // 15cm from edge

            return (
              <group key={door.id}>
                {/* Door opening (actual cutout) */}
                <mesh position={[doorX, doorY, doorZ]} rotation={[0, -angle, 0]}>
                  <boxGeometry args={[door.width + 0.02, door.height + 0.02, wall.thickness + 0.02]} />
                  <meshStandardMaterial color="#000000" transparent opacity={0} />
                </mesh>

                {/* Door panel - protrudes both sides */}
                {/* Outside panel */}
                <mesh
                  position={[doorX + perpX * panelOffset, doorY, doorZ + perpZ * panelOffset]}
                  rotation={[0, -angle, 0]}
                  castShadow
                >
                  <boxGeometry args={[door.width - 0.05, door.height - 0.05, 0.05]} />
                  <meshStandardMaterial color={door.color} />
                </mesh>
                {/* Inside panel */}
                <mesh
                  position={[doorX - perpX * panelOffset, doorY, doorZ - perpZ * panelOffset]}
                  rotation={[0, -angle, 0]}
                  castShadow
                >
                  <boxGeometry args={[door.width - 0.05, door.height - 0.05, 0.05]} />
                  <meshStandardMaterial color={door.color} />
                </mesh>

                {/* Top frame */}
                <mesh
                  position={[doorX, doorY + door.height / 2, doorZ]}
                  rotation={[0, -angle, 0]}
                >
                  <boxGeometry args={[door.width + 0.1, 0.1, wall.thickness + 0.1]} />
                  <meshStandardMaterial color="#222" />
                </mesh>


                {/* Door handles - attached to door panel, both sides */}
                {/* Outside handle */}
                <mesh
                  position={[
                    doorX + perpX * (panelOffset + handleInset) + handleOffset * Math.cos(angle),
                    handleHeight,
                    doorZ + perpZ * (panelOffset + handleInset) + handleOffset * Math.sin(angle)
                  ]}
                  rotation={[0, -angle, 0]}
                >
                  <cylinderGeometry args={[0.02, 0.02, 0.1]} />
                  <meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.2} />
                </mesh>
                {/* Inside handle */}
                <mesh
                  position={[
                    doorX - perpX * (panelOffset + handleInset) + handleOffset * Math.cos(angle),
                    handleHeight,
                    doorZ - perpZ * (panelOffset + handleInset) + handleOffset * Math.sin(angle)
                  ]}
                  rotation={[0, -angle, 0]}
                >
                  <cylinderGeometry args={[0.02, 0.02, 0.1]} />
                  <meshStandardMaterial color="#FFD700" metalness={0.8} roughness={0.2} />
                </mesh>
              </group>
            )
          })}
        </>
      )}
    </group>
  )
}

function FloorMesh({ floorPlan }: { floorPlan: FloorPlan }) {
  return (
    <group>
      {floorPlan.floors.map((floor) => {
        const floorBaseHeight = floorPlan.floors
          .filter((f) => f.level < floor.level)
          .reduce((sum, f) => sum + f.height, 0)

        // Create floor geometry that follows wall perimeter
        if (floor.walls.length < 3) return null

        // Get all unique points from walls to form the perimeter
        const points: Point2D[] = []
        floor.walls.forEach((wall) => {
          points.push(wall.start)
        })

        // Create shape from wall perimeter
        const shape = new THREE.Shape()
        if (points.length > 0) {
          shape.moveTo(points[0].x, points[0].z)
          for (let i = 1; i < points.length; i++) {
            shape.lineTo(points[i].x, points[i].z)
          }
          shape.closePath()
        }

        // Define floor textures
        const textureMap: Record<string, THREE.Texture> = {}
        const textureLoader = new THREE.TextureLoader()

        const floorTextures = {
          concrete: textureLoader.load("/textures/concrete.jpg"),
          wood: textureLoader.load("/textures/wood.jpg"),
          tile: textureLoader.load("/textures/tile.jpg"),
          marble: textureLoader.load("/textures/marble.jpg"),
          carpet: textureLoader.load("/textures/carpet.jpg"),
        }
        Object.keys(floorTextures).forEach((key) => {
          textureMap[key] = floorTextures[key as keyof typeof floorTextures]
          textureMap[key].repeat.set(5, 5) // Adjust repeat for tiling
          textureMap[key].wrapS = textureMap[key].wrapT = THREE.RepeatWrapping
        })

        const selectedTexture = textureMap[floor.texture] || textureMap["concrete"]

        return (
          <group key={floor.id}>
            {/* Floor slab at base - always visible regardless of wall visibility */}
            <mesh position={[0, floorBaseHeight + 0.01, 0]} rotation={[Math.PI / 2, 0, 0]} receiveShadow>
              <shapeGeometry args={[shape]} />
              <meshStandardMaterial
                color={floor.color}
                side={THREE.DoubleSide}
                transparent={false}
                opacity={1}
                roughness={floor.texture === "marble" ? 0.1 : floor.texture === "wood" ? 0.6 : 0.8}
                metalness={floor.texture === "marble" ? 0.2 : 0}
              />
            </mesh>

            {/* Floor ceiling (except for top floor) */}
            {floor.level < Math.max(...floorPlan.floors.map((f) => f.level)) && (
              <mesh
                position={[0, floorBaseHeight + floor.height - 0.01, 0]}
                rotation={[Math.PI / 2, 0, 0]}
                receiveShadow
              >
                <shapeGeometry args={[shape]} />
                <meshStandardMaterial color="#f3f4f6" side={THREE.DoubleSide} transparent={false} opacity={1} />
              </mesh>
            )}
          </group>
        )
      })}
    </group>
  )
}

function RoofMesh({ floorPlan }: { floorPlan: FloorPlan }) {
  const { roofGeometry, totalBuildingHeight } = useMemo(() => {
    const highestFloor = floorPlan.floors.reduce(
      (max, floor) => (floor.level > max.level ? floor : max),
      floorPlan.floors[0],
    )

    const topFloorWalls = highestFloor?.walls || []

    if (topFloorWalls.length === 0) {
      return {
        roofGeometry: null,
        totalBuildingHeight: 0,
      }
    }

    // Collect all wall points to form the building perimeter
    const wallPoints: Point2D[] = []
    const wallSegments: { start: Point2D; end: Point2D }[] = []

    topFloorWalls.forEach((wall) => {
      wallSegments.push({ start: wall.start, end: wall.end })
      wallPoints.push(wall.start, wall.end)
    })

    if (wallPoints.length === 0) {
      return { roofGeometry: null, totalBuildingHeight: 0 }
    }

    // Create ordered perimeter points
    const orderedPoints: Point2D[] = []
    const usedSegments = new Set<number>()

    if (wallSegments.length > 0) {
      orderedPoints.push(wallSegments[0].start, wallSegments[0].end)
      usedSegments.add(0)

      let currentPoint = wallSegments[0].end

      while (usedSegments.size < wallSegments.length) {
        let foundConnection = false

        for (let i = 0; i < wallSegments.length; i++) {
          if (usedSegments.has(i)) continue

          const segment = wallSegments[i]
          const tolerance = 0.1

          if (
            Math.abs(segment.start.x - currentPoint.x) < tolerance &&
            Math.abs(segment.start.z - currentPoint.z) < tolerance
          ) {
            orderedPoints.push(segment.end)
            currentPoint = segment.end
            usedSegments.add(i)
            foundConnection = true
            break
          } else if (
            Math.abs(segment.end.x - currentPoint.x) < tolerance &&
            Math.abs(segment.end.z - currentPoint.z) < tolerance
          ) {
            orderedPoints.push(segment.start)
            currentPoint = segment.start
            usedSegments.add(i)
            foundConnection = true
            break
          }
        }

        if (!foundConnection) break
      }
    }

    if (orderedPoints.length < 3) {
      const xs = wallPoints.map((p) => p.x)
      const zs = wallPoints.map((p) => p.z)

      const minX = Math.min(...xs)
      const maxX = Math.max(...xs)
      const minZ = Math.min(...zs)
      const maxZ = Math.max(...zs)

      const overhang = 0.3
      orderedPoints.length = 0
      orderedPoints.push(
        { x: minX - overhang, z: minZ - overhang },
        { x: maxX + overhang, z: minZ - overhang },
        { x: maxX + overhang, z: maxZ + overhang },
        { x: minX - overhang, z: maxZ + overhang },
      )
    }

    const totalHeight = floorPlan.floors.reduce((sum, floor) => sum + floor.height, 0)

    return {
      roofGeometry: {
        points: orderedPoints,
        wallPoints: wallPoints,
      },
      totalBuildingHeight: totalHeight,
    }
  }, [floorPlan.floors])

  if (!roofGeometry) return null

  const roofBaseHeight = totalBuildingHeight + 0.05
  const overhang = 0.3

  if (floorPlan.roofStyle === "flat") {
    return (
      <group>
        <mesh position={[0, roofBaseHeight, 0]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <shapeGeometry args={[new THREE.Shape(roofGeometry.points.map((p) => new THREE.Vector2(p.x, p.z)))]} />
          <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
        </mesh>
      </group>
    )
  }

  if (floorPlan.roofStyle === "gable") {
    // Ridge runs parallel to longer walls with A-shaped gable ends
    const xs = roofGeometry.points.map((p) => p.x)
    const zs = roofGeometry.points.map((p) => p.z)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)
    
    const buildingLengthX = maxX - minX
    const buildingLengthZ = maxZ - minZ
    
    // Determine ridge direction based on building proportions
    const ridgeAlongX = buildingLengthX > buildingLengthZ
    const ridgeHeight = 2.5
    const overhangSize = 0.3

    if (ridgeAlongX) {
      // Ridge runs parallel to X-axis (east-west)
      // North and South gables are triangular
      const ridgeCenterZ = (minZ + maxZ) / 2
      const ridgeCenterX = (minX + maxX) / 2

      // Create gable roof with proper geometry
      const roofShape = new THREE.Shape()
      roofShape.moveTo(-buildingLengthX / 2 - overhangSize, 0)
      roofShape.lineTo(buildingLengthX / 2 + overhangSize, 0)
      roofShape.lineTo(buildingLengthX / 2 + overhangSize, buildingLengthZ / 2 + overhangSize)
      roofShape.lineTo(-buildingLengthX / 2 - overhangSize, buildingLengthZ / 2 + overhangSize)
      roofShape.closePath()

      return (
        <group position={[ridgeCenterX, roofBaseHeight, ridgeCenterZ]}>
          {/* North roof slope */}
          <mesh rotation={[Math.PI / 6, 0, 0]} castShadow>
            <planeGeometry args={[buildingLengthX + overhangSize * 2, buildingLengthZ / 2 + overhangSize]} />
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>

          {/* South roof slope */}
          <mesh position={[0, ridgeHeight, buildingLengthZ / 2]} rotation={[-Math.PI / 6, 0, 0]} castShadow>
            <planeGeometry args={[buildingLengthX + overhangSize * 2, buildingLengthZ / 2 + overhangSize]} />
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>

          {/* West gable (triangular face) */}
          <mesh position={[-buildingLengthX / 2, ridgeHeight / 2, 0]} castShadow>
            <geometry attach="geometry">
              {(() => {
                const geom = new THREE.BufferGeometry()
                const vertices = [
                  -overhangSize, -buildingLengthZ / 2 - overhangSize, 0,
                  -overhangSize, buildingLengthZ / 2 + overhangSize, 0,
                  0, 0, ridgeHeight,
                ]
                geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3))
                geom.computeVertexNormals()
                return geom
              })()}
            </geometry>
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>

          {/* East gable (triangular face) */}
          <mesh position={[buildingLengthX / 2, ridgeHeight / 2, 0]} castShadow>
            <geometry attach="geometry">
              {(() => {
                const geom = new THREE.BufferGeometry()
                const vertices = [
                  overhangSize, -buildingLengthZ / 2 - overhangSize, 0,
                  0, 0, ridgeHeight,
                  overhangSize, buildingLengthZ / 2 + overhangSize, 0,
                ]
                geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3))
                geom.computeVertexNormals()
                return geom
              })()}
            </geometry>
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )
    } else {
      // Ridge runs parallel to Z-axis (north-south)
      // East and West gables are triangular
      return (
        <group position={[(minX + maxX) / 2, roofBaseHeight, (minZ + maxZ) / 2]}>
          {/* East roof slope */}
          <mesh rotation={[0, 0, Math.PI / 6]} castShadow>
            <planeGeometry args={[buildingLengthZ + overhangSize * 2, buildingLengthX / 2 + overhangSize]} />
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>

          {/* West roof slope */}
          <mesh position={[buildingLengthX / 2, ridgeHeight, 0]} rotation={[0, 0, -Math.PI / 6]} castShadow>
            <planeGeometry args={[buildingLengthZ + overhangSize * 2, buildingLengthX / 2 + overhangSize]} />
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>

          {/* North gable (triangular face) */}
          <mesh position={[0, ridgeHeight / 2, -buildingLengthZ / 2]} castShadow>
            <geometry attach="geometry">
              {(() => {
                const geom = new THREE.BufferGeometry()
                const vertices = [
                  -buildingLengthX / 2 - overhangSize, 0, -overhangSize,
                  buildingLengthX / 2 + overhangSize, 0, -overhangSize,
                  0, ridgeHeight, 0,
                ]
                geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3))
                geom.computeVertexNormals()
                return geom
              })()}
            </geometry>
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>

          {/* South gable (triangular face) */}
          <mesh position={[0, ridgeHeight / 2, buildingLengthZ / 2]} castShadow>
            <geometry attach="geometry">
              {(() => {
                const geom = new THREE.BufferGeometry()
                const vertices = [
                  -buildingLengthX / 2 - overhangSize, 0, overhangSize,
                  0, ridgeHeight, 0,
                  buildingLengthX / 2 + overhangSize, 0, overhangSize,
                ]
                geom.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices), 3))
                geom.computeVertexNormals()
                return geom
              })()}
            </geometry>
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )
    }
  }

  if (floorPlan.roofStyle === "shed") {
    const xs = roofGeometry.points.map((p) => p.x)
    const zs = roofGeometry.points.map((p) => p.z)
    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)
    
    const buildingLengthX = maxX - minX
    const buildingLengthZ = maxZ - minZ
    const centerX = (minX + maxX) / 2
    const centerZ = (minZ + maxZ) / 2
    const slopeHeight = 1.8
    const overhangSize = 0.3

    let slopeGeometry = null
    let gableGeometries = []

    switch (floorPlan.roofSlopeDirection) {
      case "north":
        // Slope rises toward north
        slopeGeometry = (
          <mesh position={[centerX, roofBaseHeight + slopeHeight / 2, centerZ]} rotation={[Math.PI / 8, 0, 0]} castShadow>
            <planeGeometry args={[buildingLengthX + overhangSize * 2, buildingLengthZ + overhangSize * 2]} />
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>
        )
        break
      case "south":
        // Slope rises toward south
        slopeGeometry = (
          <mesh position={[centerX, roofBaseHeight + slopeHeight / 2, centerZ]} rotation={[-Math.PI / 8, 0, 0]} castShadow>
            <planeGeometry args={[buildingLengthX + overhangSize * 2, buildingLengthZ + overhangSize * 2]} />
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>
        )
        break
      case "east":
        // Slope rises toward east
        slopeGeometry = (
          <mesh position={[centerX, roofBaseHeight + slopeHeight / 2, centerZ]} rotation={[0, 0, -Math.PI / 8]} castShadow>
            <planeGeometry args={[buildingLengthX + overhangSize * 2, buildingLengthZ + overhangSize * 2]} />
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>
        )
        break
      case "west":
        // Slope rises toward west
        slopeGeometry = (
          <mesh position={[centerX, roofBaseHeight + slopeHeight / 2, centerZ]} rotation={[0, 0, Math.PI / 8]} castShadow>
            <planeGeometry args={[buildingLengthX + overhangSize * 2, buildingLengthZ + overhangSize * 2]} />
            <meshStandardMaterial color={floorPlan.roofColor} side={THREE.DoubleSide} />
          </mesh>
        )
        break
    }

    return (
      <group>
        {slopeGeometry}
      </group>
    )
  }

  return null
}

function PlotBoundary({ width, depth }: { width: number; depth: number }) {
  const points = [
    [-width / 2, 0, -depth / 2],
    [width / 2, 0, -depth / 2],
    [width / 2, 0, depth / 2],
    [-width / 2, 0, depth / 2],
    [-width / 2, 0, -depth / 2],
  ]

  return (
    <group>
      {points.slice(0, -1).map((point, i) => {
        const nextPoint = points[i + 1]
        const midX = (point[0] + nextPoint[0]) / 2
        const midZ = (point[2] + nextPoint[2]) / 2
        const length = Math.sqrt(Math.pow(nextPoint[0] - point[0], 2) + Math.pow(nextPoint[2] - point[2], 2))
        const angle = Math.atan2(nextPoint[2] - point[2], nextPoint[0] - point[0])

        return (
          <mesh key={i} position={[midX, 0.1, midZ]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[length, 0.2, 0.05]} />
            <meshStandardMaterial color="#ef4444" />
          </mesh>
        )
      })}

      <Html position={[0, 1, -depth / 2 - 1]} center>
        <div className="bg-red-500 text-white px-2 py-1 rounded text-sm font-medium">
          Plot Boundary: {width}m × {depth}m ({width * depth} sqm)
        </div>
      </Html>
    </group>
  )
}

function StaircaseMesh({
  staircase,
  floorHeight,
  isSelected,
  onClick,
}: {
  staircase: Staircase
  floorHeight: number
  isSelected: boolean
  onClick: () => void
}) {
  const steps = 14 // Standard number of steps
  const stepHeight = floorHeight / steps
  const stepDepth = 0.25

  return (
    <group
      position={[staircase.position.x, 0, staircase.position.z]}
      rotation={[0, staircase.rotation, 0]}
      onClick={onClick}
    >
      {staircase.style === "straight" && (
        <>
          {/* Staircase steps */}
          {Array.from({ length: steps }).map((_, i) => (
            <mesh key={i} position={[0, i * stepHeight + stepHeight / 2, i * stepDepth]} castShadow receiveShadow>
              <boxGeometry args={[staircase.width, stepHeight, stepDepth]} />
              <meshStandardMaterial color={isSelected ? "#3b82f6" : staircase.color} />
            </mesh>
          ))}
          {/* Handrails */}
          <mesh position={[staircase.width / 2 + 0.05, floorHeight / 2, (steps * stepDepth) / 2]} castShadow>
            <boxGeometry args={[0.05, floorHeight, steps * stepDepth]} />
            <meshStandardMaterial color="#654321" />
          </mesh>
          <mesh position={[-staircase.width / 2 - 0.05, floorHeight / 2, (steps * stepDepth) / 2]} castShadow>
            <boxGeometry args={[0.05, floorHeight, steps * stepDepth]} />
            <meshStandardMaterial color="#654321" />
          </mesh>
        </>
      )}

      {staircase.style === "spiral" && (
        <>
          {/* Central pole */}
          <mesh position={[0, floorHeight / 2, 0]} castShadow>
            <cylinderGeometry args={[0.1, 0.1, floorHeight, 16]} />
            <meshStandardMaterial color="#654321" />
          </mesh>
          {/* Spiral steps */}
          {Array.from({ length: steps }).map((_, i) => {
            const angle = (i / steps) * Math.PI * 2
            const radius = staircase.width / 2
            return (
              <mesh
                key={i}
                position={[Math.cos(angle) * radius, i * stepHeight, Math.sin(angle) * radius]}
                rotation={[0, angle, 0]}
                castShadow
                receiveShadow
              >
                <boxGeometry args={[staircase.width, stepHeight, stepDepth]} />
                <meshStandardMaterial color={isSelected ? "#3b82f6" : staircase.color} />
              </mesh>
            )
          })}
        </>
      )}

      {staircase.style === "L-shaped" && (
        <>
          {/* First flight */}
          {Array.from({ length: steps / 2 }).map((_, i) => (
            <mesh
              key={`first-${i}`}
              position={[0, i * stepHeight + stepHeight / 2, i * stepDepth]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[staircase.width, stepHeight, stepDepth]} />
              <meshStandardMaterial color={isSelected ? "#3b82f6" : staircase.color} />
            </mesh>
          ))}
          {/* Landing */}
          <mesh position={[staircase.width / 2, (steps / 2) * stepHeight, (steps / 2) * stepDepth]} receiveShadow>
            <boxGeometry args={[staircase.width, 0.1, staircase.width]} />
            <meshStandardMaterial color={staircase.color} />
          </mesh>
          {/* Second flight */}
          {Array.from({ length: steps / 2 }).map((_, i) => (
            <mesh
              key={`second-${i}`}
              position={[
                staircase.width + i * stepDepth,
                (steps / 2 + i) * stepHeight + stepHeight / 2,
                (steps / 2) * stepDepth,
              ]}
              rotation={[0, Math.PI / 2, 0]}
              castShadow
              receiveShadow
            >
              <boxGeometry args={[staircase.width, stepHeight, stepDepth]} />
              <meshStandardMaterial color={isSelected ? "#3b82f6" : staircase.color} />
            </mesh>
          ))}
        </>
      )}
    </group>
  )
}

function FloorPerimeterGuide({ floorPlan, currentFloor }: { floorPlan: FloorPlan; currentFloor: number }) {
  if (currentFloor === 1) return null

  const floor1 = floorPlan.floors.find((f) => f.level === 1)
  if (!floor1 || floor1.walls.length === 0) return null

  const floorBaseHeight = floorPlan.floors.filter((f) => f.level < currentFloor).reduce((sum, f) => sum + f.height, 0)

  // Get all wall endpoints to form the perimeter
  const points: Point2D[] = []
  floor1.walls.forEach((wall) => {
    points.push(wall.start)
  })

  if (points.length < 3) return null

  // Create shape from wall perimeter for the floor indicator
  const shape = new THREE.Shape()
  shape.moveTo(points[0].x, points[0].z)
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i].x, points[i].z)
  }
  shape.closePath()

  // Calculate center for label
  const centerX = points.reduce((sum, p) => sum + p.x, 0) / points.length
  const centerZ = points.reduce((sum, p) => sum + p.z, 0) / points.length

  return (
    <group>
      {/* Floor 1 perimeter guide lines following actual wall shape */}
      {points.map((point, i) => {
        const nextPoint = points[(i + 1) % points.length]
        const midX = (point.x + nextPoint.x) / 2
        const midZ = (point.z + nextPoint.z) / 2
        const length = Math.sqrt(Math.pow(nextPoint.x - point.x, 2) + Math.pow(nextPoint.z - point.z, 2))
        const angle = Math.atan2(nextPoint.z - point.z, nextPoint.x - point.x)

        return (
          <mesh key={i} position={[midX, floorBaseHeight + 0.05, midZ]} rotation={[0, -angle, 0]}>
            <boxGeometry args={[length, 0.15, 0.05]} />
            <meshStandardMaterial color="#10b981" transparent opacity={0.7} />
          </mesh>
        )
      })}

      {/* Semi-transparent floor area indicator following actual shape */}
      <mesh position={[0, floorBaseHeight + 0.01, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <shapeGeometry args={[shape]} />
        <meshStandardMaterial color="#10b981" transparent opacity={0.1} side={THREE.DoubleSide} />
      </mesh>

      <Html position={[centerX, floorBaseHeight + 1, centerZ]} center>
        <div className="bg-green-500 text-white px-2 py-1 rounded text-xs font-medium">
          Floor 1 Footprint: {calculatePolygonArea(points).toFixed(1)} sqm
        </div>
      </Html>
    </group>
  )
}

// Main Component
export default function AdvancedHouseBuilder() {
  // State management
  const [floorPlan, setFloorPlan] = useState<FloorPlan>({
    walls: [],
    totalArea: 0,
    plotBounds: { width: 20, depth: 10 }, // 200 sqm default
    floors: [
      {
        id: "1",
        level: 1,
        height: 3,
        walls: [],
        beams: [], // Ensure beams array is initialized
        color: "#d1d5db", // Default color for new floor
        texture: "concrete", // Default texture for new floor
      },
    ], // Removed beams array, Added floor color and texture
    staircases: [], // Initialize staircases array
    roofStyle: "flat", // Default to flat roof only
    roofColor: "#8B4513", // Added roof color
    roofSlopeDirection: "north", // Default slope direction
  })

  const [selectedWallId, setSelectedWallId] = useState<string | null>(null)
  const [prevSelectedWallId, setPrevSelectedWallId] = useState<string | null>(null)

  // Remove timer decay from selection state
  // Instead, use a timer to keep the previous wall highlighted for a short time
  useEffect(() => {
    if (prevSelectedWallId) {
      const timer = setTimeout(() => {
        setPrevSelectedWallId(null)
      }, 1000) // 1 second decay for previous wall highlight
      return () => clearTimeout(timer)
    }
  }, [prevSelectedWallId])

  // Update selection logic
  const handleWallSelect = (wallId: string | null, floorLevel: number) => {
    if (selectedWallId === wallId && currentFloor === floorLevel) {
      setSelectedWallId(null)
      setPrevSelectedWallId(null)
    } else {
      if (selectedWallId) setPrevSelectedWallId(selectedWallId)
      setSelectedWallId(wallId)
      if (wallId) setCurrentFloor(floorLevel)
    }
  }

  const [selectedStaircaseId, setSelectedStaircaseId] = useState<string | null>(null) // Added staircase selection
  const [selectedTool, setSelectedTool] = useState<"select" | "wall">("select") // Removed beam tool
  const [currentFloor, setCurrentFloor] = useState(1) // Added current floor tracking

  const [wallVisibility, setWallVisibility] = useState<Record<number, boolean>>({})

  // Wall creation state
  const [wallHeight, setWallHeight] = useState(3)
  const [wallThickness, setWallThickness] = useState(0.15)
  const [wallMaterial, setWallMaterial] = useState("concrete")
  const [wallColor, setWallColor] = useState("#d1d5db") // Added wall color

  // Removed beam-related state
  // const [beamWidth, setBeamWidth] = useState(0.2)
  // const [beamDepth, setBeamDepth] = useState(0.3)
  // const [beamMaterial, setBeamMaterial] = useState("concrete")
  // const [beamColor, setBeamColor] = useState("#666666")

  const [staircaseWidth, setStaircaseWidth] = useState(1.2)
  const [staircaseStyle, setStaircaseStyle] = useState<"straight" | "L-shaped" | "U-shaped" | "spiral">("straight")
  const [staircaseColor, setStaircaseColor] = useState("#8B7355")

  // Visualization settings
  const [showRoof, setShowRoof] = useState(true)
  const [showEnvironment, setShowEnvironment] = useState(true)
  // const [showBeams, setShowBeams] = useState(true) // Added beam visibility toggle - Removed
  const [lightingMode, setLightingMode] = useState<"day" | "night">("day")
  const [cameraMode, setCameraMode] = useState<"orbit" | "walkthrough">("orbit")

  // Validation
  const maxPlotArea = 200 // sqm
  const currentPlotArea = floorPlan.plotBounds.width * floorPlan.plotBounds.depth
  const isPlotValid = currentPlotArea <= maxPlotArea

  // Calculate total built area (considering all floors)
  const totalBuiltArea = useMemo(() => {
    let area = 0
    floorPlan.floors.forEach((floor) => {
      // This calculation needs to be more sophisticated, considering room definitions per floor
      // For now, we'll approximate based on plot bounds if no specific room data exists per floor
      area += floorPlan.plotBounds.width * floorPlan.plotBounds.depth // Placeholder
    })
    // A more accurate calculation would sum up areas of defined rooms on each floor.
    // Since rooms are removed, we'll use a simplified approach for now.
    return (
      floorPlan.floors.reduce(
        (sum, floor) => sum + floor.walls.reduce((wallSum, wall) => wallSum + calculateWallArea(wall), 0),
        0,
      ) / 3
    ) // Rough estimate
  }, [floorPlan.floors, floorPlan.plotBounds])

  const [materialRates, setMaterialRates] = useState<MaterialPrices>(DEFAULT_MATERIAL_RATES)
  const [pricesLoaded, setPricesLoaded] = useState(false)
  const [csvError, setCsvError] = useState<string | null>(null)

  const loadMaterialPricesFromCSV = async () => {
    try {
      const response = await fetch("/material-prices.csv")
      if (!response.ok) {
        throw new Error("Failed to load material prices CSV")
      }
      const csvText = await response.text()
      const prices = parseCSV(csvText)
      setMaterialRates(prices)
      setPricesLoaded(true)
      setCsvError(null)
    } catch (error) {
      console.error("[v0] Error loading material prices:", error)
      setCsvError("Failed to load prices from CSV. Using default rates.")
      setMaterialRates(DEFAULT_MATERIAL_RATES)
      setPricesLoaded(true)
    }
  }

  const parseCSV = (csvText: string): MaterialPrices => {
    const lines = csvText.trim().split("\n")
    const prices: Partial<MaterialPrices> = {}

    // Skip header row
    for (let i = 1; i < lines.length; i++) {
      const [material, unit, price] = lines[i].split(",")
      const priceValue = Number.parseFloat(price)

      switch (material.trim()) {
        case "concrete":
          prices.concrete_per_m3 = priceValue
          break
        case "steel":
          prices.steel_per_kg = priceValue
          break
        case "blocks":
          prices.blocks_per_piece = priceValue
          break
        case "blocks_per_m2":
          prices.blocks_per_m2 = priceValue
          break
        case "roofing":
          prices.roofing_per_m2 = priceValue
          break
        case "window":
          prices.window_per_m2 = priceValue
          break
        case "door":
          prices.door_per_piece = priceValue
          break
        case "beam":
          prices.beam_per_m = priceValue
          break
        case "staircase":
          prices.staircase_per_flight = priceValue
          break
        case "labor":
          prices.labor_per_m2 = priceValue
          break
        case "foundation":
          prices.foundation_per_m = priceValue
          break
      }
    }

    return { ...DEFAULT_MATERIAL_RATES, ...prices }
  }

  useEffect(() => {
    loadMaterialPricesFromCSV()
  }, [])

  const handleCSVUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const csvText = e.target?.result as string
        const prices = parseCSV(csvText)
        setMaterialRates(prices)
        setCsvError(null)
        alert("Material prices updated successfully!")
      } catch (error) {
        console.error("[v0] Error parsing CSV:", error)
        setCsvError("Failed to parse CSV file. Please check the format.")
      }
    }
    reader.readAsText(file)
  }

  // Material estimation
  const [estimate, setEstimate] = useState<MaterialEstimate | null>(null) // Initialize estimate state

  const calculateEstimate = useCallback((): MaterialEstimate => {
    let totalWallArea = 0
    let totalWallLength = 0
    let totalWindowCount = 0
    let totalWindowArea = 0
    let totalDoorCount = 0

    floorPlan.floors.forEach((floor) => {
      floor.walls.forEach((wall) => {
        totalWallArea += calculateWallArea(wall)
        totalWallLength += calculateDistance(wall.start, wall.end)
        totalWindowCount += wall.windows.length
        totalWindowArea += wall.windows.reduce((sum, w) => sum + w.width * w.height, 0)
        totalDoorCount += wall.doors.length
      })
    })

    const concrete = {
      volume: totalBuiltArea * 0.15 + totalWallLength * wallThickness * wallHeight, // Foundation + Walls
      cost: 0,
    }
    concrete.cost = concrete.volume * materialRates.concrete_per_m3

    const steel = {
      weight: totalBuiltArea * 25 + totalWallLength * 8, // Reinforcement estimate
      cost: 0,
    }
    steel.cost = steel.weight * materialRates.steel_per_kg

    const blocks = {
      count: Math.ceil(totalWallArea * materialRates.blocks_per_m2),
      cost: 0,
    }
    blocks.cost = blocks.count * materialRates.blocks_per_piece

    const roofing = {
      area: totalBuiltArea * 1.2, // 20% overhang
      cost: 0,
    }
    roofing.cost = roofing.area * materialRates.roofing_per_m2

    const windows = {
      count: totalWindowCount,
      cost: totalWindowArea * materialRates.window_per_m2,
    }

    const doors = {
      count: totalDoorCount,
      cost: totalDoorCount * materialRates.door_per_piece,
    }

    const staircases = {
      count: floorPlan.staircases.length,
      cost: floorPlan.staircases.length * materialRates.staircase_per_flight,
    }

    const labor = {
      cost: totalBuiltArea * materialRates.labor_per_m2,
    }

    const total =
      concrete.cost + steel.cost + blocks.cost + roofing.cost + windows.cost + doors.cost + staircases.cost + labor.cost

    return { concrete, steel, blocks, roofing, windows, doors, beams: { count: 0, cost: 0 }, staircases, labor, total }
  }, [floorPlan, wallHeight, wallThickness, totalBuiltArea, materialRates])

  const handlePlotResize = (dimension: "width" | "depth", value: number) => {
    const newBounds = { ...floorPlan.plotBounds, [dimension]: value }
    if (newBounds.width * newBounds.depth <= maxPlotArea) {
      setFloorPlan((prev) => ({ ...prev, plotBounds: newBounds }))
    }
  }

  const getFloor1Footprint = (floorPlan: FloorPlan) => {
    const floor1 = floorPlan.floors.find((f) => f.level === 1)
    if (!floor1 || floor1.walls.length === 0) return null

    const xs: number[] = []
    const zs: number[] = []
    floor1.walls.forEach((wall) => {
      xs.push(wall.start.x, wall.end.x)
      zs.push(wall.start.z, wall.end.z)
    })

    if (xs.length === 0) return null

    const minX = Math.min(...xs)
    const maxX = Math.max(...xs)
    const minZ = Math.min(...zs)
    const maxZ = Math.max(...zs)

    return { minX, maxX, minZ, maxZ }
  }

  const isPointWithinBounds = (point: Point2D): boolean => {
    const halfWidth = floorPlan.plotBounds.width / 2
    const halfDepth = floorPlan.plotBounds.depth / 2
    const withinPlot = point.x >= -halfWidth && point.x <= halfWidth && point.z >= -halfDepth && point.z <= halfDepth

    if (currentFloor > 1) {
      const floor1Footprint = getFloor1Footprint(floorPlan)
      if (floor1Footprint) {
        const withinFloor1 =
          point.x >= floor1Footprint.minX &&
          point.x <= floor1Footprint.maxX &&
          point.z >= floor1Footprint.minZ &&
          point.z <= floor1Footprint.maxZ
        return withinPlot && withinFloor1
      }
      // If floor 1 has no walls yet, don't allow building on upper floors
      return false
    }

    return withinPlot
  }

  const addWall = (start: Point2D, end: Point2D, floorLevel: number) => {
    // Validate that both points are within plot boundaries
    if (!isPointWithinBounds(start) || !isPointWithinBounds(end)) {
      console.log("[v0] Wall placement rejected: outside plot boundaries")
      return
    }

    const newWall: Wall = {
      id: generateId(),
      start,
      end,
      height: wallHeight,
      thickness: wallThickness,
      windows: [],
      doors: [],
      material: wallMaterial,
      color: wallColor, // Use the current wall color state
      wallType: "solid", // Default to solid wall
    }

    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) =>
        floor.level === floorLevel ? { ...floor, walls: [...floor.walls, newWall] } : floor,
      ),
    }))
  }

  const updateWindowPosition = (wallId: string, windowId: string, newPosition: number, floorLevel: number) => {
    // Clamp position between 0.1 and 0.9 to keep windows away from wall edges
    const clampedPosition = Math.max(0.1, Math.min(0.9, newPosition))

    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) =>
        floor.level === floorLevel
          ? {
              ...floor,
              walls: floor.walls.map((wall) =>
                wall.id === wallId
                  ? {
                      ...wall,
                      windows: wall.windows.map((window) =>
                        window.id === windowId ? { ...window, position: clampedPosition } : window,
                      ),
                    }
                  : wall,
              ),
            }
          : floor,
      ),
    }))
  }

  const updateDoorPosition = (wallId: string, doorId: string, newPosition: number, floorLevel: number) => {
    // Clamp position between 0.1 and 0.9 to keep doors away from wall edges
    const clampedPosition = Math.max(0.1, Math.min(0.9, newPosition))

    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) =>
        floor.level === floorLevel
          ? {
              ...floor,
              walls: floor.walls.map((wall) =>
                wall.id === wallId
                  ? {
                      ...wall,
                      doors: wall.doors.map((door) =>
                        door.id === doorId ? { ...door, position: clampedPosition } : door,
                      ),
                    }
                  : wall,
              ),
            }
          : floor,
      ),
    }))
  }

  const addWindow = (wallId: string, floorLevel: number) => {
    const newWindow: Window = {
      id: generateId(),
      position: 0.5,
      width: 1.2,
      height: 1.0,
      style: "rectangular",
      sillHeight: 0.9,
      color: "#8B4513", // Default brown frame
    }

    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) =>
        floor.level === floorLevel
          ? {
              ...floor,
              walls: floor.walls.map((wall) =>
                wall.id === wallId ? { ...wall, windows: [...wall.windows, newWindow] } : wall,
              ),
            }
          : floor,
      ),
    }))
  }

  const addDoor = (wallId: string, floorLevel: number) => {
    const newDoor: Door = {
      id: generateId(),
      position: 0.5,
      width: 0.9,
      height: 2.1,
      style: "single",
      color: "#8B4513", // Default brown door
    }

    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) =>
        floor.level === floorLevel
          ? {
              ...floor,
              walls: floor.walls.map((wall) =>
                wall.id === wallId ? { ...wall, doors: [...wall.doors, newDoor] } : wall,
              ),
            }
          : floor,
      ),
    }))
  }

  const addStaircase = () => {
    if (floorPlan.floors.length < 2) {
      alert("You need at least 2 floors to add a staircase!")
      return
    }

    const newStaircase: Staircase = {
      id: generateId(),
      position: { x: 0, z: 0 },
      rotation: 0,
      width: staircaseWidth,
      fromFloor: currentFloor,
      toFloor: currentFloor + 1,
      style: staircaseStyle,
      color: staircaseColor,
    }

    setFloorPlan((prev) => ({
      ...prev,
      staircases: [...prev.staircases, newStaircase],
    }))
  }

  const deleteStaircase = (staircaseId: string) => {
    setFloorPlan((prev) => ({
      ...prev,
      staircases: prev.staircases.filter((s) => s.id !== staircaseId),
    }))
    setSelectedStaircaseId(null)
  }

  const updateStaircasePosition = (staircaseId: string, position: Point2D) => {
    setFloorPlan((prev) => ({
      ...prev,
      staircases: prev.staircases.map((s) => (s.id === staircaseId ? { ...s, position } : s)),
    }))
  }

  const updateStaircaseRotation = (staircaseId: string, rotation: number) => {
    setFloorPlan((prev) => ({
      ...prev,
      staircases: prev.staircases.map((s) => (s.id === staircaseId ? { ...s, rotation } : s)),
    }))
  }

  // Removed addBeam function
  // const addBeam = (start: Point2D, end: Point2D, floorLevel: number) => { ... }

  // Removed deleteBeam function
  // const deleteBeam = (beamId: string, floorLevel: number) => { ... }

  const addFloor = () => {
    // Check if the current floor is already at the maximum allowed
    if (floorPlan.floors.length >= 2) {
      alert("Maximum 2 floors allowed")
      return
    }

    const newFloor: Floor = {
      id: generateId(), // Use a generated ID
      level: floorPlan.floors.length + 1,
      height: 3,
      walls: [],
      beams: [], // Ensure beams array is initialized
      color: "#d1d5db", // Default color for new floor
      texture: "concrete", // Default texture for new floor
    }

    setFloorPlan((prev) => ({
      ...prev,
      floors: [...prev.floors, newFloor],
    }))
    setCurrentFloor(newFloor.level)
  }

  const removeFloor = (floorLevel: number) => {
    // Prevent removing the last floor
    if (floorPlan.floors.length <= 1) {
      alert("Cannot remove the last floor")
      return
    }
    // Prevent removing the ground floor (level 1)
    if (floorLevel === 1) {
      alert("Cannot remove floor 1")
      return
    }

    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors
        .filter((floor) => floor.level !== floorLevel)
        .map((floor, index) => ({
          ...floor,
          level: index + 1, // Renumber floors sequentially
        })),
    }))

    // Adjust currentFloor if the removed floor was the current one or higher
    if (currentFloor === floorLevel) {
      setCurrentFloor(1) // Switch to floor 1
    } else if (currentFloor > floorLevel) {
      setCurrentFloor(currentFloor - 1) // Decrement current floor level
    }
    setSelectedWallId(null) // Deselect any selected wall
  }

  const updateFloorColor = (floorLevel: number, color: string) => {
    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) => (floor.level === floorLevel ? { ...floor, color: color } : floor)),
    }))
  }

  const updateFloorTexture = (floorLevel: number, texture: Floor["texture"]) => {
    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) => (floor.level === floorLevel ? { ...floor, texture: texture } : floor)),
    }))
  }

  const deleteWall = (wallId: string, floorLevel: number) => {
    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) =>
        floor.level === floorLevel ? { ...floor, walls: floor.walls.filter((wall) => wall.id !== wallId) } : floor,
      ),
    }))
    setSelectedWallId(null)
  }

  const toggleWallVisibility = (floorLevel: number) => {
    setWallVisibility((prev) => ({
      ...prev,
      [floorLevel]: !prev[floorLevel],
    }))
  }

  // Removed RoomManager and related functionality
  // const handleRoomsChange = useCallback((rooms: Room[]) => {
  //   setFloorPlan((prev) => ({
  //     ...prev,
  //     rooms,
  //     totalArea: rooms.reduce((sum, room) => sum + room.area, 0),
  //   }))
  // }, [])

  const currentFloorData = floorPlan.floors.find((floor) => floor.level === currentFloor)
  const selectedWall = currentFloorData?.walls.find((wall) => wall.id === selectedWallId)
  // const selectedBeam = currentFloorData?.beams.find((beam) => beam.id === selectedBeamId) // Removed
  const selectedStaircase = floorPlan.staircases.find((s) => s.id === selectedStaircaseId) // Get selected staircase

  // Helper function to handle wall changes for a specific floor
  const handleWallsChange = (newWalls: Wall[], floorLevel: number) => {
    setFloorPlan((prev) => ({
      ...prev,
      floors: prev.floors.map((floor) => (floor.level === floorLevel ? { ...floor, walls: newWalls } : floor)),
    }))
  }

  useEffect(() => {
    if (floorPlan.floors.length >= 2) {
      const floor1 = floorPlan.floors.find((f) => f.level === 1)
      const floor2 = floorPlan.floors.find((f) => f.level === 2)

      if (floor1 && floor2 && floor1.walls.length > 0 && floor2.walls.length > 0) {
        const autoBeams = generateSupportBeams(floor1.walls, floor2.walls, floor1.height)

        // Only update if beams changed
        if (autoBeams.length > 0 && floor1.beams.length !== autoBeams.length) {
          setFloorPlan((prev) => ({
            ...prev,
            floors: prev.floors.map((f) => (f.level === 1 ? { ...f, beams: autoBeams } : f)),
          }))
        }
      }
    }
  }, [floorPlan.floors])

  return (
    <div className="min-h-screen h-screen bg-background flex flex-row overflow-hidden p-4">
      {/* 3D Viewport - 80% width */}
      <div className="flex-1 basis-[80%] max-w-[80%] relative">
        <Canvas
          camera={{ position: [15, 15, 15], fov: 60 }}
          shadows
          style={{ height: "100vh", width: "100%" }}
          className="rounded-xl"
        >
          <ambientLight intensity={lightingMode === "day" ? 0.6 : 0.2} />
          <directionalLight
            position={[10, 20, 5]}
            intensity={lightingMode === "day" ? 0.8 : 0.3}
            castShadow
            shadow-mapSize-width={2048}
            shadow-mapSize-height={2048}
          />
          {lightingMode === "night" && <pointLight position={[0, 10, 0]} intensity={0.5} color="#ffd700" />}

          <OrbitControls makeDefault />
          {/* <Grid args={[50, 50]} /> */}

          {/* Ground plane with grass texture */}
          <mesh position={[0, -0.01, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
            <planeGeometry args={[floorPlan.plotBounds.width + 2, floorPlan.plotBounds.depth + 2]} />
            <meshStandardMaterial color="#22c55e" />
          </mesh>

          {/* Grid overlay on ground */}
          <gridHelper args={[Math.max(floorPlan.plotBounds.width, floorPlan.plotBounds.depth) + 2, 40]} position={[0, 0, 0]} />

          {showEnvironment && <Environment preset="sunset" />}

          {/* Plot boundary */}
          <PlotBoundary width={floorPlan.plotBounds.width} depth={floorPlan.plotBounds.depth} />

          <FloorPerimeterGuide floorPlan={floorPlan} currentFloor={currentFloor} />

          <FloorMesh floorPlan={floorPlan} />

          {floorPlan.floors.map((floor) => {
            const floorBaseHeight = floorPlan.floors
              .filter((f) => f.level < floor.level)
              .reduce((sum, f) => sum + f.height, 0)
            const isWallsVisible = wallVisibility[floor.level] !== false

            return (
              <group key={floor.id} position={[0, floorBaseHeight, 0]}>
                {isWallsVisible &&
                  floor.walls.map((wall) => (
                    <WallMesh
                      key={wall.id}
                      wall={{ ...wall, height: floor.height }}
                      isSelected={
                        wall.id === selectedWallId && currentFloor === floor.level
                        // Highlight previous wall for decay period
                        || wall.id === prevSelectedWallId && currentFloor === floor.level
                      }
                      onClick={() => handleWallSelect(wall.id, floor.level)}
                    />
                  ))}
              </group>
            )
          })}

          {floorPlan.floors.map((floor) => {
            const floorBaseHeight = floorPlan.floors
              .filter((f) => f.level < floor.level)
              .reduce((sum, f) => sum + f.height, 0)

            return floor.beams.map((beam) => <BeamMesh key={beam.id} beam={beam} floorBaseHeight={floorBaseHeight} />)
          })}

          {floorPlan.staircases.map((staircase) => {
            const fromFloor = floorPlan.floors.find((f) => f.level === staircase.fromFloor)
            if (!fromFloor) return null

            const floorBaseHeight = floorPlan.floors
              .filter((f) => f.level < staircase.fromFloor)
              .reduce((sum, f) => sum + f.height, 0)

            return (
              <group key={staircase.id} position={[0, floorBaseHeight, 0]}>
                <StaircaseMesh
                  staircase={staircase}
                  floorHeight={fromFloor.height}
                  isSelected={staircase.id === selectedStaircaseId}
                  onClick={() => setSelectedStaircaseId(staircase.id === selectedStaircaseId ? null : staircase.id)}
                />
              </group>
            )
          })}

          {/* Simple flat roof */}
          {showRoof && <RoofMesh floorPlan={floorPlan} />}

          {currentFloor > 1 && (
            <group position={[0, 0, 0]}>
              {floorPlan.floors
                .filter((f) => f.level === 1)
                .map((floor) =>
                  floor.walls.map((wall) => (
                    <WallMesh
                      key={`ref-${wall.id}`}
                      wall={{ ...wall, height: floor.height }}
                      isSelected={false}
                      onClick={() => {}} // No interaction for reference walls
                      isFromLowerFloor={true}
                    />
                  )),
                )}
            </group>
          )}

          {/* Area indicator */}
          <Html position={[20, 10, 0]} center>
            <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-primary/10">
              <div className="text-sm font-semibold text-primary">
                Floor {currentFloor} - Built Area: {totalBuiltArea.toFixed(1)} sqm
              </div>
              <div className={`text-xs font-medium mt-1 ${isPlotValid ? "text-secondary" : "text-destructive"}`}>
                Plot: {currentPlotArea} / {maxPlotArea} sqm
              </div>
              {currentFloor > 1 && (
                <div className="text-xs text-green-600 font-medium mt-1">
                  Upper floor - must stay within Floor 1 footprint
                </div>
              )}
              {selectedWallId && (
                <div className="text-xs text-accent font-medium mt-2 flex items-center gap-1">
                  <span className="w-2 h-2 bg-accent rounded-full animate-pulse"></span>
                  Wall selected - Add windows/doors
                </div>
              )}
              {selectedStaircaseId && (
                <div className="text-xs text-secondary font-medium mt-2 flex items-center gap-1">
                  <span className="w-2 h-2 bg-secondary rounded-full animate-pulse"></span>
                  Staircase selected
                </div>
              )}
            </div>
          </Html>
        </Canvas>

        {/* Enhanced view controls */}
        <div className="absolute top-4 left-4 flex flex-col gap-3">
          <div className="bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-primary/10">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-2">
              <Eye className="w-4 h-4" />
              <span>View Options</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={showRoof ? "default" : "outline"}
                onClick={() => setShowRoof(!showRoof)}
                className="text-xs"
              >
                Roof
              </Button>
              <Button
                size="sm"
                variant={showEnvironment ? "default" : "outline"}
                onClick={() => setShowEnvironment(!showEnvironment)}
                className="text-xs"
              >
                Sky
              </Button>
            </div>
          </div>

          {/* Floor selector */}
          <div className="bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-primary/10">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-2">
              <span>Floor Levels (Max 2)</span>
            </div>
            <div className="flex gap-2 mb-3 flex-wrap">
              {floorPlan.floors.map((floor) => (
                <div key={floor.id} className="flex gap-1">
                  <Button
                    size="sm"
                    variant={currentFloor === floor.level ? "default" : "outline"}
                    onClick={() => setCurrentFloor(floor.level)}
                    className="text-xs font-medium"
                  >
                    {floor.level}
                  </Button>
                  {floorPlan.floors.length > 1 &&
                    floor.level !== 1 && ( // Only show delete if not floor 1
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => removeFloor(floor.level)}
                        className="text-xs px-2"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                </div>
              ))}
              {floorPlan.floors.length < 2 && (
                <Button size="sm" variant="outline" onClick={addFloor} className="text-xs bg-transparent">
                  <Plus className="w-3 h-3" />
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Wall Visibility:</div>
              {floorPlan.floors.map((floor) => {
                const isVisible = wallVisibility[floor.level] !== false
                return (
                  <div key={`visibility-${floor.id}`} className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={isVisible ? "default" : "outline"}
                      onClick={() => {
                        setWallVisibility((prev) => ({
                          ...prev,
                          [floor.level]: !isVisible,
                        }))
                      }}
                      className="text-xs px-3 py-1.5 w-full font-medium"
                    >
                      Floor {floor.level}: {isVisible ? "Visible" : "Hidden"}
                    </Button>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Lighting controls */}
          <div className="bg-white/95 backdrop-blur-md p-3 rounded-2xl shadow-xl border border-primary/10">
            <div className="flex items-center gap-2 text-xs font-semibold text-primary mb-2">
              {lightingMode === "day" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span>Lighting</span>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant={lightingMode === "day" ? "default" : "outline"}
                onClick={() => setLightingMode("day")}
                className="text-xs"
              >
                Day
              </Button>
              <Button
                size="sm"
                variant={lightingMode === "night" ? "default" : "outline"}
                onClick={() => setLightingMode("night")}
                className="text-xs"
              >
                Night
              </Button>
            </div>
          </div>
        </div>

        {/* Plot validation warning */}
        {!isPlotValid && (
          <div className="absolute top-4 right-4 bg-destructive text-destructive-foreground p-4 rounded-2xl shadow-xl flex items-center gap-3 animate-pulse">
            <AlertTriangle className="w-6 h-6" />
            <span className="font-semibold">Plot exceeds 200 sqm limit!</span>
          </div>
        )}
      </div>

      {/* Builder Console - 20% width, scrollable */}
      <div className="basis-[20%] max-w-[20%] w-[20vw] bg-card border-l border-border h-screen overflow-y-auto">
        <div className="p-6">
          <div className="mb-6">
            <h1 className="text-2xl font-bold mb-1 flex items-center gap-3 text-black">
              <Home className="w-6 h-6 text-primary" />
              House Builder Pro
            </h1>

            <p className="text-xs text-muted-foreground">Design your dream home in 3D</p>
          </div>

          <Tabs defaultValue="design" className="w-full">
            <TabsList className="grid w-full grid-cols-4 text-xs h-11 bg-muted/50">
              <TabsTrigger value="design" className="font-medium">
                Design
              </TabsTrigger>
              <TabsTrigger value="validate" className="font-medium">
                Check
              </TabsTrigger>
              <TabsTrigger value="estimate" className="font-medium">
                Cost
              </TabsTrigger>
              <TabsTrigger value="project" className="font-medium">
                Save
              </TabsTrigger>
            </TabsList>

            <TabsContent value="design" className="space-y-4 mt-4">
              {/* Plot Settings */}
              <Card className="border-primary/10 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-primary">Plot Dimensions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Width (m)</Label>
                    <Slider
                      value={[floorPlan.plotBounds.width]}
                      onValueChange={([value]) => handlePlotResize("width", value)}
                      max={20}
                      min={5}
                      step={0.5}
                      className="mt-1"
                    />
                    <div className="text-xs text-gray-500 mt-1">{floorPlan.plotBounds.width}m</div>
                  </div>
                  <div>
                    <Label className="text-xs">Depth (m)</Label>
                    <Slider
                      value={[floorPlan.plotBounds.depth]}
                      onValueChange={([value]) => handlePlotResize("depth", value)}
                      max={20}
                      min={5}
                      step={0.5}
                      className="mt-1"
                    />
                    <div className="text-xs text-gray-500 mt-1">{floorPlan.plotBounds.depth}m</div>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span>Total Area:</span>
                    <Badge variant={isPlotValid ? "default" : "destructive"}>{currentPlotArea} sqm</Badge>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Floor {currentFloor} Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label className="text-xs">Floor Color</Label>
                    <div className="flex gap-2">
                      <Input
                        type="color"
                        value={floorPlan.floors.find((f) => f.level === currentFloor)?.color || "#e5e7eb"}
                        onChange={(e) => updateFloorColor(currentFloor, e.target.value)}
                        className="w-16 h-8"
                      />
                      <Input
                        type="text"
                        value={floorPlan.floors.find((f) => f.level === currentFloor)?.color || "#e5e7eb"}
                        onChange={(e) => updateFloorColor(currentFloor, e.target.value)}
                        className="flex-1 text-xs"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs">Floor Texture</Label>
                    <Select
                      value={floorPlan.floors.find((f) => f.level === currentFloor)?.texture || "concrete"}
                      onValueChange={(value) => updateFloorTexture(currentFloor, value as Floor["texture"])}
                    >
                      <SelectTrigger className="text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="concrete">Concrete</SelectItem>
                        <SelectItem value="wood">Wood</SelectItem>
                        <SelectItem value="tile">Tile</SelectItem>
                        <SelectItem value="marble">Marble</SelectItem>
                        <SelectItem value="carpet">Carpet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </CardContent>
              </Card>

              {/* Enhanced Wall Settings with Color */}
              <Card className="border-secondary/10 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-secondary">Wall Properties</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Height (m)</Label>
                    <Input
                      type="number"
                      value={wallHeight}
                      onChange={(e) => setWallHeight(Number(e.target.value))}
                      step={0.1}
                      min={2}
                      max={5}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Thickness (m)</Label>
                    <Input
                      type="number"
                      value={wallThickness}
                      onChange={(e) => setWallThickness(Number(e.target.value))}
                      step={0.01}
                      min={0.1}
                      max={0.3}
                      className="mt-1 text-sm"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">Material</Label>
                    <Select value={wallMaterial} onValueChange={setWallMaterial}>
                      <SelectTrigger className="mt-1 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="concrete">Concrete Block</SelectItem>
                        <SelectItem value="brick">Brick</SelectItem>
                        <SelectItem value="wood">Wood Frame</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs">Wall Color</Label>
                    <Input
                      type="color"
                      value={wallColor}
                      onChange={(e) => setWallColor(e.target.value)}
                      className="mt-1 h-8"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Staircase Settings Card */}
              {floorPlan.floors.length >= 2 && (
                <Card className="border-secondary/10 shadow-sm">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm font-semibold text-secondary flex items-center gap-2">
                      <Stairs className="w-4 h-4" />
                      Staircase Settings
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs">Width (m)</Label>
                      <Input
                        type="number"
                        value={staircaseWidth}
                        onChange={(e) => setStaircaseWidth(Number(e.target.value))}
                        step={0.1}
                        min={0.8}
                        max={2.0}
                        className="mt-1 text-sm"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Style</Label>
                      <Select value={staircaseStyle} onValueChange={(value: any) => setStaircaseStyle(value)}>
                        <SelectTrigger className="mt-1 text-sm">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="straight">Straight</SelectItem>
                          <SelectItem value="L-shaped">L-Shaped</SelectItem>
                          <SelectItem value="U-shaped">U-Shaped</SelectItem>
                          <SelectItem value="spiral">Spiral</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Color</Label>
                      <Input
                        type="color"
                        value={staircaseColor}
                        onChange={(e) => setStaircaseColor(e.target.value)}
                        className="mt-1 h-8"
                      />
                    </div>
                    <Button onClick={addStaircase} className="w-full" size="sm">
                      <Plus className="w-3 h-3 mr-1" />
                      Add Staircase
                    </Button>
                    {floorPlan.staircases.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        {floorPlan.staircases.length} staircase(s) added
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Card className="border-accent shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold text-accent">Roof Settings</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <Label className="text-xs">Roof Style</Label>
                    <Select
                      value={floorPlan.roofStyle}
                      onValueChange={(value: "flat" | "gable" | "shed") =>
                        setFloorPlan((prev) => ({ ...prev, roofStyle: value }))
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="flat">Flat Roof</SelectItem>
                        <SelectItem value="gable">Gable Roof</SelectItem>
                        <SelectItem value="shed">Shed Roof (One-Sided Slope)</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {floorPlan.roofStyle === "shed" && (
                    <div>
                      <Label className="text-xs">Slope Direction</Label>
                      <Select
                        value={floorPlan.roofSlopeDirection}
                        onValueChange={(value: "north" | "south" | "east" | "west") =>
                          setFloorPlan((prev) => ({ ...prev, roofSlopeDirection: value }))
                        }
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="north">North (Raised)</SelectItem>
                          <SelectItem value="south">South (Raised)</SelectItem>
                          <SelectItem value="east">East (Raised)</SelectItem>
                          <SelectItem value="west">West (Raised)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label className="text-xs">Roof Color</Label>
                    <Input
                      type="color"
                      value={floorPlan.roofColor}
                      onChange={(e) => setFloorPlan((prev) => ({ ...prev, roofColor: e.target.value }))}
                      className="mt-1 h-8"
                    />
                  </div>
                </CardContent>
              </Card>

              {currentFloor === 2 && selectedWall && (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-semibold">Balcony/Railing Options</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div>
                      <Label className="text-xs">Wall Type</Label>
                      <Select
                        value={selectedWall.wallType || "solid"}
                        onValueChange={(value: "solid" | "railing") => {
                          setFloorPlan((prev) => ({
                            ...prev,
                            floors: prev.floors.map((floor) =>
                              floor.level === currentFloor
                                ? {
                                    ...floor,
                                    walls: floor.walls.map((w) =>
                                      w.id === selectedWall.id ? { ...w, wallType: value } : w,
                                    ),
                                  }
                                : floor,
                            ),
                          }))
                        }}
                      >
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="solid">Solid Wall</SelectItem>
                          <SelectItem value="railing">Railing/Balcony</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <Button
                      onClick={() => {
                        // Convert all floor 2 walls to railings
                        setFloorPlan((prev) => ({
                          ...prev,
                          floors: prev.floors.map((floor) =>
                            floor.level === 2
                              ? {
                                  ...floor,
                                  walls: floor.walls.map((w) => ({ ...w, wallType: "railing" })),
                                }
                              : floor,
                          ),
                        }))
                      }}
                      variant="outline"
                      size="sm"
                      className="w-full"
                    >
                      Convert All Floor 2 Walls to Railings
                    </Button>
                  </CardContent>
                </Card>
              )}

              {selectedWall && (
                <Card className="border-primary bg-primary/5 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-primary font-bold flex justify-between items-center">
                      <span className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-primary rounded-full animate-pulse"></span>
                        Selected Wall - Floor {currentFloor}
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedWallId(null)
                        }}
                        className="text-xs"
                      >
                        Deselect
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>Length: {calculateDistance(selectedWall.start, selectedWall.end).toFixed(1)}m</span>
                      <span>Material: {selectedWall.material}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => addWindow(selectedWall.id, currentFloor)} className="flex-1">
                        <Plus className="w-3 h-3 mr-1" />
                        Window
                      </Button>
                      <Button size="sm" onClick={() => addDoor(selectedWall.id, currentFloor)} className="flex-1">
                        <Plus className="w-3 h-3 mr-1" />
                        Door
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteWall(selectedWall.id, currentFloor)}>
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>

                    {/* Window customization with position slider */}
                    {selectedWall.windows.map((window, index) => (
                      <div key={window.id} className="border rounded p-2 bg-background shadow-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-medium">Window {index + 1}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setFloorPlan((prev) => ({
                                ...prev,
                                floors: prev.floors.map((floor) =>
                                  floor.level === currentFloor
                                    ? {
                                        ...floor,
                                        walls: floor.walls.map((wall) =>
                                          wall.id === selectedWall.id
                                            ? { ...wall, windows: wall.windows.filter((w) => w.id !== window.id) }
                                            : wall,
                                        ),
                                      }
                                    : floor,
                                ),
                              }))
                            }}
                            className="text-xs"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>

                        <div>
                          <Label className="text-xs flex items-center gap-1">
                            <Move className="w-3 h-3 text-muted-foreground" />
                            Position along wall
                          </Label>
                          <Slider
                            value={[window.position]}
                            onValueChange={([value]) =>
                              updateWindowPosition(selectedWall.id, window.id, value, currentFloor)
                            }
                            min={0.1}
                            max={0.9}
                            step={0.05}
                            className="mt-1"
                          />
                          <div className="text-xs text-muted-foreground mt-1">
                            {(window.position * 100).toFixed(0)}% along wall
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Width (m)</Label>
                            <Input
                              type="number"
                              value={window.width}
                              onChange={(e) => {
                                const newWidth = Number(e.target.value)
                                setFloorPlan((prev) => ({
                                  ...prev,
                                  floors: prev.floors.map((floor) =>
                                    floor.level === currentFloor
                                      ? {
                                          ...floor,
                                          walls: floor.walls.map((wall) =>
                                            wall.id === selectedWall.id
                                              ? {
                                                  ...wall,
                                                  windows: wall.windows.map((w) =>
                                                    w.id === window.id ? { ...w, width: newWidth } : w,
                                                  ),
                                                }
                                              : wall,
                                          ),
                                        }
                                      : floor,
                                  ),
                                }))
                              }}
                              step={0.1}
                              min={0.5}
                              max={3}
                              className="text-xs h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Height (m)</Label>
                            <Input
                              type="number"
                              value={window.height}
                              onChange={(e) => {
                                const newHeight = Number(e.target.value)
                                setFloorPlan((prev) => ({
                                  ...prev,
                                  floors: prev.floors.map((floor) =>
                                    floor.level === currentFloor
                                      ? {
                                          ...floor,
                                          walls: floor.walls.map((wall) =>
                                            wall.id === selectedWall.id
                                              ? {
                                                  ...wall,
                                                  windows: wall.windows.map((w) =>
                                                    w.id === window.id ? { ...w, height: newHeight } : w,
                                                  ),
                                                }
                                              : wall,
                                          ),
                                        }
                                      : floor,
                                  ),
                                }))
                              }}
                              step={0.1}
                              min={0.5}
                              max={2.5}
                              className="text-xs h-8"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Style</Label>
                          <Select
                            value={window.style}
                            onValueChange={(value: any) => {
                              setFloorPlan((prev) => ({
                                ...prev,
                                floors: prev.floors.map((floor) =>
                                  floor.level === currentFloor
                                    ? {
                                        ...floor,
                                        walls: floor.walls.map((wall) =>
                                          wall.id === selectedWall.id
                                            ? {
                                                ...wall,
                                                windows: wall.windows.map((w) =>
                                                  w.id === window.id ? { ...w, style: value } : w,
                                                ),
                                              }
                                            : wall,
                                        ),
                                      }
                                    : floor,
                                ),
                              }))
                            }}
                          >
                            <SelectTrigger className="text-xs h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="rectangular">Rectangular</SelectItem>
                              <SelectItem value="arched">Arched</SelectItem>
                              <SelectItem value="bay">Bay</SelectItem>
                              <SelectItem value="sliding">Sliding</SelectItem>
                              <SelectItem value="casement">Casement</SelectItem>
                              <SelectItem value="awning">Awning</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Frame Color</Label>
                          <Input
                            type="color"
                            value={window.color}
                            onChange={(e) => {
                              setFloorPlan((prev) => ({
                                ...prev,
                                floors: prev.floors.map((floor) =>
                                  floor.level === currentFloor
                                    ? {
                                        ...floor,
                                        walls: floor.walls.map((wall) =>
                                          wall.id === selectedWall.id
                                            ? {
                                                ...wall,
                                                windows: wall.windows.map((w) =>
                                                  w.id === window.id ? { ...w, color: e.target.value } : w,
                                                ),
                                              }
                                            : wall,
                                        ),
                                      }
                                    : floor,
                                ),
                              }))
                            }}
                            className="h-6 text-xs"
                          />
                        </div>
                      </div>
                    ))}

                    {/* Door customization with position slider */}
                    {selectedWall.doors.map((door, index) => (
                      <div key={door.id} className="border rounded p-2 bg-background shadow-sm space-y-2">
                        <div className="flex justify-between items-center">
                          <span className="text-xs font-medium">Door {index + 1}</span>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              setFloorPlan((prev) => ({
                                ...prev,
                                floors: prev.floors.map((floor) =>
                                  floor.level === currentFloor
                                    ? {
                                        ...floor,
                                        walls: floor.walls.map((wall) =>
                                          wall.id === selectedWall.id
                                            ? { ...wall, doors: wall.doors.filter((d) => d.id !== door.id) }
                                            : wall,
                                        ),
                                      }
                                    : floor,
                                ),
                              }))
                            }}
                            className="text-xs"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>

                        <div>
                          <Label className="text-xs flex items-center gap-1">
                            <Move className="w-3 h-3 text-muted-foreground" />
                            Position along wall
                          </Label>
                          <Slider
                            value={[door.position]}
                            onValueChange={([value]) =>
                              updateDoorPosition(selectedWall.id, door.id, value, currentFloor)
                            }
                            min={0.1}
                            max={0.9}
                            step={0.05}
                            className="mt-1"
                          />
                          <div className="text-xs text-muted-foreground mt-1">
                            {(door.position * 100).toFixed(0)}% along wall
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <Label className="text-xs">Width (m)</Label>
                            <Input
                              type="number"
                              value={door.width}
                              onChange={(e) => {
                                const newWidth = Number(e.target.value)
                                setFloorPlan((prev) => ({
                                  ...prev,
                                  floors: prev.floors.map((floor) =>
                                    floor.level === currentFloor
                                      ? {
                                          ...floor,
                                          walls: floor.walls.map((wall) =>
                                            wall.id === selectedWall.id
                                              ? {
                                                  ...wall,
                                                  doors: wall.doors.map((d) =>
                                                    d.id === door.id ? { ...d, width: newWidth } : d,
                                                  ),
                                                }
                                              : wall,
                                          ),
                                        }
                                      : floor,
                                  ),
                                }))
                              }}
                              step={0.1}
                              min={0.6}
                              max={2.5}
                              className="text-xs h-8"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Height (m)</Label>
                            <Input
                              type="number"
                              value={door.height}
                              onChange={(e) => {
                                const newHeight = Number(e.target.value)
                                setFloorPlan((prev) => ({
                                  ...prev,
                                  floors: prev.floors.map((floor) =>
                                    floor.level === currentFloor
                                      ? {
                                          ...floor,
                                          walls: floor.walls.map((wall) =>
                                            wall.id === selectedWall.id
                                              ? {
                                                  ...wall,
                                                  doors: wall.doors.map((d) =>
                                                    d.id === door.id ? { ...d, height: newHeight } : d,
                                                  ),
                                                }
                                              : wall,
                                          ),
                                        }
                                      : floor,
                                  ),
                                }))
                              }}
                              step={0.1}
                              min={1.8}
                              max={2.5}
                              className="text-xs h-8"
                            />
                          </div>
                        </div>
                        <div>
                          <Label className="text-xs">Style</Label>
                          <Select
                            value={door.style}
                            onValueChange={(value: any) => {
                              setFloorPlan((prev) => ({
                                ...prev,
                                floors: prev.floors.map((floor) =>
                                  floor.level === currentFloor
                                    ? {
                                        ...floor,
                                        walls: floor.walls.map((wall) =>
                                          wall.id === selectedWall.id
                                            ? {
                                                ...wall,
                                                doors: wall.doors.map((d) =>
                                                  d.id === door.id ? { ...d, style: value } : d,
                                                ),
                                              }
                                            : wall,
                                        ),
                                      }
                                    : floor,
                                ),
                              }))
                            }}
                          >
                            <SelectTrigger className="text-xs h-8">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Single</SelectItem>
                              <SelectItem value="double">Double</SelectItem>
                              <SelectItem value="sliding">Sliding</SelectItem>
                              <SelectItem value="french">French</SelectItem>
                              <SelectItem value="bifold">Bifold</SelectItem>
                              <SelectItem value="pocket">Pocket</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label className="text-xs">Door Color</Label>
                          <Input
                            type="color"
                            value={door.color}
                            onChange={(e) => {
                              setFloorPlan((prev) => ({
                                ...prev,
                                floors: prev.floors.map((floor) =>
                                  floor.level === currentFloor
                                    ? {
                                        ...floor,
                                        walls: floor.walls.map((wall) =>
                                          wall.id === selectedWall.id
                                            ? {
                                                ...wall,
                                                doors: wall.doors.map((d) =>
                                                  d.id === door.id ? { ...d, color: e.target.value } : d,
                                                ),
                                              }
                                            : wall,
                                        ),
                                      }
                                    : floor,
                                ),
                              }))
                            }}
                            className="h-6 text-xs"
                          />
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              )}

              {/* Selected Staircase Card */}
              {selectedStaircase && (
                <Card className="border-secondary bg-secondary/5 shadow-lg">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-secondary font-bold flex justify-between items-center">
                      <span className="flex items-center gap-2">
                        <Stairs className="w-4 h-4" />
                        Selected Staircase
                      </span>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setSelectedStaircaseId(null)}
                        className="text-xs"
                      >
                        Deselect
                      </Button>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-xs text-muted-foreground mb-2">
                      <span>
                        Floor {selectedStaircase.fromFloor} → {selectedStaircase.toFloor}
                      </span>
                      <span>Style: {selectedStaircase.style}</span>
                    </div>
                    <div>
                      <Label className="text-xs">Position X</Label>
                      <Slider
                        value={[selectedStaircase.position.x]}
                        onValueChange={([value]) =>
                          updateStaircasePosition(selectedStaircase.id, { ...selectedStaircase.position, x: value })
                        }
                        min={-floorPlan.plotBounds.width / 2}
                        max={floorPlan.plotBounds.width / 2}
                        step={0.1}
                        className="mt-1"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {selectedStaircase.position.x.toFixed(1)}m
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Position Z</Label>
                      <Slider
                        value={[selectedStaircase.position.z]}
                        onValueChange={([value]) =>
                          updateStaircasePosition(selectedStaircase.id, { ...selectedStaircase.position, z: value })
                        }
                        min={-floorPlan.plotBounds.depth / 2}
                        max={floorPlan.plotBounds.depth / 2}
                        step={0.1}
                        className="mt-1"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {selectedStaircase.position.z.toFixed(1)}m
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs">Rotation (degrees)</Label>
                      <Slider
                        value={[selectedStaircase.rotation * (180 / Math.PI)]}
                        onValueChange={([value]) =>
                          updateStaircaseRotation(selectedStaircase.id, value * (Math.PI / 180))
                        }
                        min={0}
                        max={360}
                        step={15}
                        className="mt-1"
                      />
                      <div className="text-xs text-muted-foreground mt-1">
                        {(selectedStaircase.rotation * (180 / Math.PI)).toFixed(0)}°
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => deleteStaircase(selectedStaircase.id)}
                      className="w-full"
                    >
                      <Trash2 className="w-3 h-3 mr-1" />
                      Delete Staircase
                    </Button>
                  </CardContent>
                </Card>
              )}

              {!selectedWall && !selectedStaircaseId && (
                <Card className="border-muted shadow-sm">
                  <CardContent className="pt-6">
                    <div className="text-center text-muted-foreground text-sm py-4">
                      <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                        <Home className="w-6 h-6" />
                      </div>
                      Click on a wall in the 3D view to select it and add windows or doors, or click on a staircase to
                      edit it.
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* FloorPlanDesigner component - needs to be adapted for multi-floor */}
              <FloorPlanDesigner
                walls={currentFloorData?.walls || []} // Only show walls for the current floor
                plotBounds={floorPlan.plotBounds}
                onWallsChange={(newWalls) => handleWallsChange(newWalls, currentFloor)}
                selectedWallId={selectedWallId}
                onWallSelect={(wallId) => handleWallSelect(wallId, currentFloor)}
                wallHeight={currentFloorData?.height || 3} // Use current floor's height
                wallThickness={wallThickness}
                wallMaterial={wallMaterial}
                referenceWalls={currentFloor > 1 ? floorPlan.floors.find((f) => f.level === 1)?.walls || [] : []} // Pass Floor 1 walls as reference for upper floors
              />

              <Card className="border-muted shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold">Quick Actions</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {selectedWallId && (
                    <Button size="sm" variant="outline" onClick={() => setSelectedWallId(null)} className="w-full">
                      Deselect Wall
                    </Button>
                  )}
                  {selectedStaircaseId && (
                    <Button size="sm" variant="outline" onClick={() => setSelectedStaircaseId(null)} className="w-full">
                      Deselect Staircase
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setFloorPlan((prev) => ({
                        ...prev,
                        floors: prev.floors.map((floor) =>
                          floor.level === currentFloor ? { ...floor, walls: [] } : floor,
                        ),
                      }))
                      setSelectedWallId(null)
                    }}
                    className="w-full"
                  >
                    Clear All Walls
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* <TabsContent value="structure" className="space-y-4"> ... </TabsContent> */}

            {/* Validate tab */}
            <TabsContent value="validate" className="space-y-4 mt-4">
              <PlotValidator
                plotBounds={floorPlan.plotBounds}
                walls={floorPlan.floors.flatMap(f => f.walls)} // <-- All walls from all floors
                maxPlotArea={maxPlotArea}
              />
            </TabsContent>

            {/* Estimate tab */}
            <TabsContent value="estimate" className="space-y-4 mt-4">
              <Card className="border-primary/10 shadow-sm">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-semibold flex items-center gap-2 text-primary">
                    <Calculator className="w-4 h-4" />
                    Cost Estimation
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="mb-4 space-y-2">
                    <Label htmlFor="csv-upload" className="text-xs">
                      Update Material Prices (CSV)
                    </Label>
                    <Input id="csv-upload" type="file" accept=".csv" onChange={handleCSVUpload} className="text-xs" />
                    {csvError && <p className="text-xs text-destructive">{csvError}</p>}
                    {pricesLoaded && !csvError && (
                      <p className="text-xs text-muted-foreground">Prices loaded from CSV</p>
                    )}
                  </div>

                  <Button onClick={() => setEstimate(calculateEstimate())} className="w-full mb-4 font-medium">
                    Calculate Estimate
                  </Button>

                  {estimate && (
                    <div className="space-y-3 text-sm">
                      <div className="flex justify-between">
                        <span>Concrete ({estimate.concrete.volume.toFixed(1)} m³):</span>
                        <span>₱{estimate.concrete.cost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Steel ({estimate.steel.weight.toFixed(0)} kg):</span>
                        <span>₱{estimate.steel.cost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Blocks ({estimate.blocks.count} pcs):</span>
                        <span>₱{estimate.blocks.cost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Roofing ({estimate.roofing.area.toFixed(1)} m²):</span>
                        <span>₱{estimate.roofing.cost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Windows ({estimate.windows.count}):</span>
                        <span>₱{estimate.windows.cost.toLocaleString()}</span>
                      </div>
                      <div className="flex justify-between">
                        <span>Doors ({estimate.doors.count}):</span>
                        <span>₱{estimate.doors.cost.toLocaleString()}</span>
                      </div>
                      <Separator />
                      <div className="flex justify-between font-bold text-base text-primary">
                        <span>Total:</span>
                        <span>₱{estimate.total.toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-2 bg-muted/50 p-2 rounded-lg">
                        Cost per sqm: ₱{(estimate.total / Math.max(totalBuiltArea, 1)).toLocaleString()}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="project" className="space-y-4 mt-4">
              <ProjectManager floorPlan={floorPlan} onFloorPlanChange={setFloorPlan} estimate={estimate} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
