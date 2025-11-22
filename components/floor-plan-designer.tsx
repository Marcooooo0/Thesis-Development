"use client"

import type React from "react"

import { useState, useCallback, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Trash2, Move, Square } from "lucide-react"

interface Point2D {
  x: number
  z: number
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
}

interface Window {
  id: string
  position: number
  width: number
  height: number
  style: "rectangular" | "arched" | "bay" | "sliding"
  sillHeight: number
}

interface Door {
  id: string
  position: number
  width: number
  height: number
  style: "single" | "double" | "sliding" | "french"
}

interface FloorPlanDesignerProps {
  walls: Wall[]
  plotBounds: { width: number; depth: number }
  onWallsChange: (walls: Wall[]) => void
  selectedWallId: string | null
  onWallSelect: (wallId: string | null) => void
  wallHeight: number
  wallThickness: number
  wallMaterial: string
  referenceWalls?: Wall[]
}

function calculateDistance(p1: Point2D, p2: Point2D): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2))
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

function snapToGrid(value: number, gridSize = 0.5): number {
  return Math.round(value / gridSize) * gridSize
}

function findNearestPoint(point: Point2D, walls: Wall[], threshold = 1): Point2D | null {
  for (const wall of walls) {
    const distToStart = calculateDistance(point, wall.start)
    const distToEnd = calculateDistance(point, wall.end)

    if (distToStart < threshold) return wall.start
    if (distToEnd < threshold) return wall.end
  }
  return null
}

export default function FloorPlanDesigner({
  walls,
  plotBounds,
  onWallsChange,
  selectedWallId,
  onWallSelect,
  wallHeight,
  wallThickness,
  wallMaterial,
  referenceWalls = [],
}: FloorPlanDesignerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [drawingStart, setDrawingStart] = useState<Point2D | null>(null)
  const [currentMousePos, setCurrentMousePos] = useState<Point2D | null>(null)
  const [tool, setTool] = useState<"select" | "wall" | "rectangle" | "room">("wall")
  const [draggedWall, setDraggedWall] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState<Point2D>({ x: 0, z: 0 })

  const scale = 20 // pixels per meter
  const canvasWidth = 500
  const canvasHeight = 600
  const centerX = canvasWidth / 2
  const centerY = canvasHeight / 2

  // Convert world coordinates to canvas coordinates
  const worldToCanvas = useCallback(
    (point: Point2D): Point2D => {
      return {
        x: centerX + point.x * scale,
        z: centerY - point.z * scale, // Flip Z for canvas
      }
    },
    [scale, centerX, centerY],
  )

  // Convert canvas coordinates to world coordinates
  const canvasToWorld = useCallback(
    (point: Point2D): Point2D => {
      return {
        x: (point.x - centerX) / scale,
        z: -(point.z - centerY) / scale, // Flip Z back
      }
    },
    [scale, centerX, centerY],
  )

  // Draw the floor plan
  const drawFloorPlan = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext("2d")
    if (!ctx) return

    // Clear canvas
    ctx.clearRect(0, 0, canvasWidth, canvasHeight)

    // Draw grid
    ctx.strokeStyle = "#f0f0f0"
    ctx.lineWidth = 1
    for (let x = 0; x <= canvasWidth; x += scale) {
      ctx.beginPath()
      ctx.moveTo(x, 0)
      ctx.lineTo(x, canvasHeight)
      ctx.stroke()
    }
    for (let y = 0; y <= canvasHeight; y += scale) {
      ctx.beginPath()
      ctx.moveTo(0, y)
      ctx.lineTo(canvasWidth, y)
      ctx.stroke()
    }

    // Draw plot boundary
    const plotCorners = [
      { x: -plotBounds.width / 2, z: -plotBounds.depth / 2 },
      { x: plotBounds.width / 2, z: -plotBounds.depth / 2 },
      { x: plotBounds.width / 2, z: plotBounds.depth / 2 },
      { x: -plotBounds.width / 2, z: plotBounds.depth / 2 },
    ]

    ctx.strokeStyle = "#ef4444"
    ctx.lineWidth = 3
    ctx.setLineDash([5, 5])
    ctx.beginPath()
    plotCorners.forEach((corner, i) => {
      const canvasPoint = worldToCanvas(corner)
      if (i === 0) {
        ctx.moveTo(canvasPoint.x, canvasPoint.z)
      } else {
        ctx.lineTo(canvasPoint.x, canvasPoint.z)
      }
    })
    ctx.closePath()
    ctx.stroke()
    ctx.setLineDash([])

    if (referenceWalls.length > 0) {
      referenceWalls.forEach((wall) => {
        const startCanvas = worldToCanvas(wall.start)
        const endCanvas = worldToCanvas(wall.end)

        ctx.strokeStyle = "#10b981"
        ctx.lineWidth = 2
        ctx.globalAlpha = 0.5
        ctx.setLineDash([3, 3])
        ctx.beginPath()
        ctx.moveTo(startCanvas.x, startCanvas.z)
        ctx.lineTo(endCanvas.x, endCanvas.z)
        ctx.stroke()
        ctx.setLineDash([])
        ctx.globalAlpha = 1
      })
    }

    // Draw walls
    walls.forEach((wall) => {
      const startCanvas = worldToCanvas(wall.start)
      const endCanvas = worldToCanvas(wall.end)

      ctx.strokeStyle = wall.id === selectedWallId ? "#3b82f6" : "#374151"
      ctx.lineWidth = Math.max(2, wall.thickness * scale)
      ctx.beginPath()
      ctx.moveTo(startCanvas.x, startCanvas.z)
      ctx.lineTo(endCanvas.x, endCanvas.z)
      ctx.stroke()

      // Draw wall endpoints
      ctx.fillStyle = wall.id === selectedWallId ? "#3b82f6" : "#6b7280"
      ctx.beginPath()
      ctx.arc(startCanvas.x, startCanvas.z, 4, 0, 2 * Math.PI)
      ctx.fill()
      ctx.beginPath()
      ctx.arc(endCanvas.x, endCanvas.z, 4, 0, 2 * Math.PI)
      ctx.fill()

      // Draw windows and doors
      wall.windows.forEach((window) => {
        const windowPos = {
          x: wall.start.x + (wall.end.x - wall.start.x) * window.position,
          z: wall.start.z + (wall.end.z - wall.start.z) * window.position,
        }
        const canvasPos = worldToCanvas(windowPos)

        ctx.fillStyle = "#87CEEB"
        ctx.beginPath()
        ctx.arc(canvasPos.x, canvasPos.z, 6, 0, 2 * Math.PI)
        ctx.fill()
      })

      wall.doors.forEach((door) => {
        const doorPos = {
          x: wall.start.x + (wall.end.x - wall.start.x) * door.position,
          z: wall.start.z + (wall.end.z - wall.start.z) * door.position,
        }
        const canvasPos = worldToCanvas(doorPos)

        ctx.fillStyle = "#000000"
        ctx.fillRect(canvasPos.x - 4, canvasPos.z - 4, 8, 8)
      })
    })

    // Draw current drawing line
    if (isDrawing && drawingStart && currentMousePos) {
      const startCanvas = worldToCanvas(drawingStart)
      const endCanvas = worldToCanvas(currentMousePos)

      ctx.strokeStyle = "#10b981"
      ctx.lineWidth = 2
      ctx.setLineDash([5, 5])
      ctx.beginPath()
      ctx.moveTo(startCanvas.x, startCanvas.z)
      ctx.lineTo(endCanvas.x, endCanvas.z)
      ctx.stroke()
      ctx.setLineDash([])
    }

    // Draw measurements for selected wall
    if (selectedWallId) {
      const selectedWall = walls.find((w) => w.id === selectedWallId)
      if (selectedWall) {
        const length = calculateDistance(selectedWall.start, selectedWall.end)
        const midPoint = {
          x: (selectedWall.start.x + selectedWall.end.x) / 2,
          z: (selectedWall.start.z + selectedWall.end.z) / 2,
        }
        const canvasMid = worldToCanvas(midPoint)

        ctx.fillStyle = "#1f2937"
        ctx.font = "12px sans-serif"
        ctx.textAlign = "center"
        ctx.fillText(`${length.toFixed(2)}m`, canvasMid.x, canvasMid.z - 10)
      }
    }
  }, [walls, plotBounds, selectedWallId, isDrawing, drawingStart, currentMousePos, worldToCanvas, referenceWalls])

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const canvasPoint = {
      x: e.clientX - rect.left,
      z: e.clientY - rect.top,
    }
    const worldPoint = canvasToWorld(canvasPoint)
    const snappedPoint = {
      x: snapToGrid(worldPoint.x),
      z: snapToGrid(worldPoint.z),
    }

    if (tool === "wall") {
      if (!isDrawing) {
        // Start drawing
        const nearestPoint = findNearestPoint(snappedPoint, walls)
        setDrawingStart(nearestPoint || snappedPoint)
        setIsDrawing(true)
      } else {
        // Finish drawing
        if (drawingStart) {
          const nearestPoint = findNearestPoint(snappedPoint, walls)
          const endPoint = nearestPoint || snappedPoint

          // Don't create zero-length walls
          if (calculateDistance(drawingStart, endPoint) > 0.1) {
            const newWall: Wall = {
              id: generateId(),
              start: drawingStart,
              end: endPoint,
              height: wallHeight,
              thickness: wallThickness,
              windows: [],
              doors: [],
              material: wallMaterial,
            }
            onWallsChange([...walls, newWall])
          }
        }
        setIsDrawing(false)
        setDrawingStart(null)
        setCurrentMousePos(null)
      }
    } else if (tool === "select") {
      // Find clicked wall
      let clickedWallId: string | null = null
      let minDistance = Number.POSITIVE_INFINITY

      walls.forEach((wall) => {
        const startCanvas = worldToCanvas(wall.start)
        const endCanvas = worldToCanvas(wall.end)

        // Check if click is near wall line
        const distToLine = distanceToLineSegment(canvasPoint, startCanvas, endCanvas)
        if (distToLine < 10 && distToLine < minDistance) {
          minDistance = distToLine
          clickedWallId = wall.id
        }
      })

      onWallSelect(clickedWallId)
    } else if (tool === "rectangle") {
      // Create rectangular room
      if (!isDrawing) {
        setDrawingStart(snappedPoint)
        setIsDrawing(true)
      } else {
        if (drawingStart) {
          createRectangularRoom(drawingStart, snappedPoint)
        }
        setIsDrawing(false)
        setDrawingStart(null)
        setCurrentMousePos(null)
      }
    }
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return

    const rect = canvas.getBoundingClientRect()
    const canvasPoint = {
      x: e.clientX - rect.left,
      z: e.clientY - rect.top,
    }
    const worldPoint = canvasToWorld(canvasPoint)
    const snappedPoint = {
      x: snapToGrid(worldPoint.x),
      z: snapToGrid(worldPoint.z),
    }

    if (isDrawing) {
      setCurrentMousePos(snappedPoint)
    }
  }

  const handleMouseUp = () => {
    setDraggedWall(null)
  }

  // Distance from point to line segment
  function distanceToLineSegment(point: Point2D, lineStart: Point2D, lineEnd: Point2D): number {
    const A = point.x - lineStart.x
    const B = point.z - lineStart.z
    const C = lineEnd.x - lineStart.x
    const D = lineEnd.z - lineStart.z

    const dot = A * C + B * D
    const lenSq = C * C + D * D
    let param = -1
    if (lenSq !== 0) param = dot / lenSq

    let xx, yy
    if (param < 0) {
      xx = lineStart.x
      yy = lineStart.z
    } else if (param > 1) {
      xx = lineEnd.x
      yy = lineEnd.z
    } else {
      xx = lineStart.x + param * C
      yy = lineStart.z + param * D
    }

    const dx = point.x - xx
    const dy = point.z - yy
    return Math.sqrt(dx * dx + dy * dy)
  }

  // Create rectangular room
  const createRectangularRoom = (start: Point2D, end: Point2D) => {
    const minX = Math.min(start.x, end.x)
    const maxX = Math.max(start.x, end.x)
    const minZ = Math.min(start.z, end.z)
    const maxZ = Math.max(start.z, end.z)

    const corners = [
      { x: minX, z: minZ },
      { x: maxX, z: minZ },
      { x: maxX, z: maxZ },
      { x: minX, z: maxZ },
    ]

    const newWalls: Wall[] = []
    for (let i = 0; i < corners.length; i++) {
      const startCorner = corners[i]
      const endCorner = corners[(i + 1) % corners.length]

      newWalls.push({
        id: generateId(),
        start: startCorner,
        end: endCorner,
        height: wallHeight,
        thickness: wallThickness,
        windows: [],
        doors: [],
        material: wallMaterial,
      })
    }

    onWallsChange([...walls, ...newWalls])
  }

  // Delete selected wall
  const deleteSelectedWall = () => {
    if (selectedWallId) {
      onWallsChange(walls.filter((wall) => wall.id !== selectedWallId))
      onWallSelect(null)
    }
  }

  // Add window to selected wall
  const addWindow = () => {
    if (!selectedWallId) return

    const newWindow: Window = {
      id: generateId(),
      position: 0.5,
      width: 1.2,
      height: 1.0,
      style: "rectangular",
      sillHeight: 0.9,
    }

    onWallsChange(
      walls.map((wall) => (wall.id === selectedWallId ? { ...wall, windows: [...wall.windows, newWindow] } : wall)),
    )
  }

  // Add door to selected wall
  const addDoor = () => {
    if (!selectedWallId) return

    const newDoor: Door = {
      id: generateId(),
      position: 0.5,
      width: 0.9,
      height: 2.1,
      style: "single",
    }

    onWallsChange(
      walls.map((wall) => (wall.id === selectedWallId ? { ...wall, doors: [...wall.doors, newDoor] } : wall)),
    )
  }

  useEffect(() => {
    drawFloorPlan()
  }, [drawFloorPlan])

  const selectedWall = walls.find((wall) => wall.id === selectedWallId)

  return (
    <div className="space-y-4">
      {/* Tool Selection */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Drawing Tools</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button size="sm" variant={tool === "select" ? "default" : "outline"} onClick={() => setTool("select")}>
              <Move className="w-4 h-4" />
            </Button>
            <Button size="sm" variant={tool === "wall" ? "default" : "outline"} onClick={() => setTool("wall")}>
              Wall
            </Button>
            <Button
              size="sm"
              variant={tool === "rectangle" ? "default" : "outline"}
              onClick={() => setTool("rectangle")}
            >
              <Square className="w-4 h-4" />
            </Button>
          </div>
          <div className="text-xs text-gray-500 mt-2">
            {tool === "wall" && "Click to start/end walls. Snaps to existing points."}
            {tool === "select" && "Click walls to select and edit them."}
            {tool === "rectangle" && "Click and drag to create rectangular rooms."}
          </div>
        </CardContent>
      </Card>

      {/* Canvas */}
      <Card>
        <CardContent className="p-4 overflow-auto">
          <canvas
            ref={canvasRef}
            width={canvasWidth}
            height={canvasHeight}
            className="border border-gray-200 cursor-crosshair" 
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
          />
          <div className="text-xs text-gray-500 mt-2">
            Grid: 0.5m squares • Red dashed line: Plot boundary • Blue: Selected wall
          </div>
        </CardContent>
      </Card>

      {/* Selected Wall Controls */}
      {selectedWall && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Selected Wall</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-4 text-xs">
              <div>
                <Label>Length</Label>
                <div className="font-mono">{calculateDistance(selectedWall.start, selectedWall.end).toFixed(2)}m</div>
              </div>
              <div>
                <Label>Material</Label>
                <div>{selectedWall.material}</div>
              </div>
            </div>

            <div className="flex gap-2">
              <Button size="sm" onClick={addWindow}>
                + Window
              </Button>
              <Button size="sm" onClick={addDoor}>
                + Door
              </Button>
              <Button size="sm" variant="destructive" onClick={deleteSelectedWall}>
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>

            {(selectedWall.windows.length > 0 || selectedWall.doors.length > 0) && (
              <div className="space-y-2">
                <Separator />
                <div className="text-xs">
                  <div>Windows: {selectedWall.windows.length}</div>
                  <div>Doors: {selectedWall.doors.length}</div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full bg-transparent"
            onClick={() => {
              setIsDrawing(false)
              setDrawingStart(null)
              setCurrentMousePos(null)
            }}
          >
            Cancel Drawing
          </Button>
          <Button size="sm" variant="outline" className="w-full bg-transparent" onClick={() => onWallsChange([])}>
            Clear All Walls
          </Button>
        </CardContent>
      </Card>

      {/* Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-xs">
            <div className="flex justify-between">
              <span>Total Walls:</span>
              <Badge variant="secondary">{walls.length}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Total Windows:</span>
              <Badge variant="secondary">{walls.reduce((sum, wall) => sum + wall.windows.length, 0)}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Total Doors:</span>
              <Badge variant="secondary">{walls.reduce((sum, wall) => sum + wall.doors.length, 0)}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
  