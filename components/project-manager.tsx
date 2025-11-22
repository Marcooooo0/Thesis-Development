"use client"

import type React from "react"

import { useState, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Save, Upload, Download, FileText, Copy } from "lucide-react"
import { Separator } from "@/components/ui/separator"

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
  windows: any[]
  doors: any[]
  material: string
}

interface Room {
  id: string
  name: string
  wallIds: string[]
  area: number
  type: string
  color: string
}

interface FloorPlan {
  walls: Wall[]
  rooms: Room[]
  totalArea: number
  plotBounds: { width: number; depth: number }
  floors?: any[]
}

interface ProjectData {
  id: string
  name: string
  description: string
  floorPlan: FloorPlan
  createdAt: string
  updatedAt: string
  version: string
}

interface MaterialEstimate {
  concrete: { volume: number; cost: number }
  steel: { weight: number; cost: number }
  blocks: { count: number; cost: number }
  roofing: { area: number; cost: number }
  windows: { count: number; cost: number }
  doors: { count: number; cost: number }
  labor: { cost: number }
  total: number
}

interface ProjectManagerProps {
  floorPlan: FloorPlan
  onFloorPlanChange: (floorPlan: FloorPlan) => void
  estimate: MaterialEstimate | null
}

const CONSTRUCTION_STORES = [
  "Burk Petros Construction Supplies",
  "RJE Construction Supplies",
  "J21 Hardware",
  "5c Hardware",
  "Rococo Ceramic Artwares",
  "Rac Construction Supplies",
]

function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

export default function ProjectManager({ floorPlan, onFloorPlanChange, estimate }: ProjectManagerProps) {
  const [projectName, setProjectName] = useState("My House Design")
  const [projectDescription, setProjectDescription] = useState("")
  const [savedProjects, setSavedProjects] = useState<ProjectData[]>([])
  const [showStoreComparison, setShowStoreComparison] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Save project to localStorage
  const saveProject = () => {
    const projectData: ProjectData = {
      id: generateId(),
      name: projectName,
      description: projectDescription,
      floorPlan,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: "1.0.0",
    }

    // Save to localStorage
    const existingProjects = JSON.parse(localStorage.getItem("houseBuilderProjects") || "[]")
    const updatedProjects = [...existingProjects, projectData]
    localStorage.setItem("houseBuilderProjects", JSON.stringify(updatedProjects))
    setSavedProjects(updatedProjects)

    // Download as JSON file
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(projectData, null, 2))
    const downloadAnchorNode = document.createElement("a")
    downloadAnchorNode.setAttribute("href", dataStr)
    downloadAnchorNode.setAttribute("download", `${projectName.replace(/\s+/g, "_")}.json`)
    document.body.appendChild(downloadAnchorNode)
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
  }

  // Load project from file
  const loadProject = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const projectData: ProjectData = JSON.parse(e.target?.result as string)
        onFloorPlanChange(projectData.floorPlan)
        setProjectName(projectData.name)
        setProjectDescription(projectData.description)
      } catch (error) {
        console.error("Error loading project:", error)
        alert("Error loading project file. Please check the file format.")
      }
    }
    reader.readAsText(file)
  }

  // Export floor plan as JSON
  const exportFloorPlan = () => {
    const exportData = {
      floorPlan,
      estimate,
      exportedAt: new Date().toISOString(),
      metadata: {
        totalWalls: floorPlan.walls.length,
        totalRooms: floorPlan.rooms.length,
        plotArea: floorPlan.plotBounds.width * floorPlan.plotBounds.depth,
        builtArea: floorPlan.rooms.reduce((sum, room) => sum + room.area, 0),
      },
    }

    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(exportData, null, 2))
    const downloadAnchorNode = document.createElement("a")
    downloadAnchorNode.setAttribute("href", dataStr)
    downloadAnchorNode.setAttribute("download", `${projectName.replace(/\s+/g, "_")}_floorplan.json`)
    document.body.appendChild(downloadAnchorNode)
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
  }

  // Export material list as CSV
  const exportMaterialList = () => {
    if (!estimate) {
      alert("Please calculate estimate first")
      return
    }

    const csvContent = [
      ["Material", "Quantity", "Unit", "Cost (PHP)"],
      ["Concrete", estimate.concrete.volume.toFixed(2), "m³", estimate.concrete.cost.toFixed(2)],
      ["Steel Reinforcement", estimate.steel.weight.toFixed(0), "kg", estimate.steel.cost.toFixed(2)],
      ["Concrete Blocks", estimate.blocks.count.toString(), "pieces", estimate.blocks.cost.toFixed(2)],
      ["Roofing Materials", estimate.roofing.area.toFixed(2), "m²", estimate.roofing.cost.toFixed(2)],
      ["Windows", estimate.windows.count.toString(), "pieces", estimate.windows.cost.toFixed(2)],
      ["Doors", estimate.doors.count.toString(), "pieces", estimate.doors.cost.toFixed(2)],
      ["Labor", "1", "lump sum", estimate.labor.cost.toFixed(2)],
      ["", "", "TOTAL", estimate.total.toFixed(2)],
    ]
      .map((row) => row.join(","))
      .join("\n")

    const blob = new Blob([csvContent], { type: "text/csv" })
    const url = window.URL.createObjectURL(blob)
    const downloadAnchorNode = document.createElement("a")
    downloadAnchorNode.setAttribute("href", url)
    downloadAnchorNode.setAttribute("download", `${projectName.replace(/\s+/g, "_")}_materials.csv`)
    document.body.appendChild(downloadAnchorNode)
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
    window.URL.revokeObjectURL(url)
  }

  // Generate project report
  const generateReport = () => {
    const totalWalls = floorPlan.walls.length
    const totalRooms = floorPlan.rooms.length
    const plotArea = floorPlan.plotBounds.width * floorPlan.plotBounds.depth
    const builtArea = floorPlan.rooms.reduce((sum, room) => sum + room.area, 0)
    const buildingEfficiency = plotArea > 0 ? (builtArea / plotArea) * 100 : 0

    const roomBreakdown = floorPlan.rooms
      .map((room) => `${room.name} (${room.type}): ${room.area.toFixed(1)} sqm`)
      .join("\n")

    const report = `
HOUSE DESIGN PROJECT REPORT
===========================

Project: ${projectName}
Description: ${projectDescription}
Generated: ${new Date().toLocaleString()}

PLOT INFORMATION
----------------
Plot Dimensions: ${floorPlan.plotBounds.width}m × ${floorPlan.plotBounds.depth}m
Total Plot Area: ${plotArea} sqm
Built Area: ${builtArea.toFixed(1)} sqm

STRUCTURE SUMMARY
-----------------
Total Walls: ${totalWalls}
Total Floors: ${floorPlan.floors?.length || 1}
Total Windows: ${floorPlan.floors?.reduce((sum: number, floor: { walls?: Wall[] }) => sum + (floor.walls?.reduce((wSum: number, wall: Wall) => wSum + (wall.windows?.length || 0), 0) || 0), 0) || 0}
Total Doors: ${floorPlan.floors?.reduce((sum: number, floor: { walls?: Wall[] }) => sum + (floor.walls?.reduce((wSum: number, wall: Wall) => wSum + (wall.doors?.length || 0), 0) || 0), 0) || 0}

${
  estimate
    ? `
COST ESTIMATION
---------------
Concrete: ₱${estimate.concrete.cost.toLocaleString()} (${estimate.concrete.volume.toFixed(1)} m³)
Steel: ₱${estimate.steel.cost.toLocaleString()} (${estimate.steel.weight.toFixed(0)} kg)
Blocks: ₱${estimate.blocks.cost.toLocaleString()} (${estimate.blocks.count} pieces)
Roofing: ₱${estimate.roofing.cost.toLocaleString()} (${estimate.roofing.area.toFixed(1)} m²)
Windows: ₱${estimate.windows.cost.toLocaleString()} (${estimate.windows.count} pieces)
Doors: ₱${estimate.doors.cost.toLocaleString()} (${estimate.doors.count} pieces)
Labor: ₱${estimate.labor.cost.toLocaleString()}

TOTAL ESTIMATED COST: ₱${estimate.total.toLocaleString()}
Cost per sqm: ₱${(estimate.total / Math.max(builtArea, 1)).toLocaleString()}
`
    : "Cost estimation not calculated"
}
` .trim()

    const blob = new Blob([report], { type: "text/plain" })
    const url = window.URL.createObjectURL(blob)
    const downloadAnchorNode = document.createElement("a")
    downloadAnchorNode.setAttribute("href", url)
    downloadAnchorNode.setAttribute("download", `${projectName.replace(/\s+/g, "_")}_report.txt`)
    document.body.appendChild(downloadAnchorNode)
    downloadAnchorNode.click()
    downloadAnchorNode.remove()
    window.URL.revokeObjectURL(url)
  }

  // Copy project data to clipboard
  const copyToClipboard = async () => {
    const projectData = {
      name: projectName,
      description: projectDescription,
      floorPlan,
      estimate,
    }

    try {
      await navigator.clipboard.writeText(JSON.stringify(projectData, null, 2))
      alert("Project data copied to clipboard!")
    } catch (error) {
      console.error("Failed to copy to clipboard:", error)
      alert("Failed to copy to clipboard")
    }
  }

  // Calculate total walls and built area using floors/walls
  const allWalls = floorPlan.floors?.flatMap((f: { walls?: Wall[] }) => f.walls) || []
  const totalWalls = allWalls.length
  const totalFloors = floorPlan.floors?.length || 1
  const plotArea = floorPlan.plotBounds.width * floorPlan.plotBounds.depth
  const builtArea =
    floorPlan.floors?.reduce(
      (sum: number, floor: { walls?: Wall[] }) =>
        sum +
        (floor.walls?.reduce((wallSum: number, wall: Wall) => wallSum + wall.height * calculateDistance(wall.start, wall.end), 0) ||
          0),
      0,
    ) / 3 || 0 // Divide by 3 for average height, as in your builder

  return (
    <div className="space-y-4">
      {/* Project Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Project Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Project Name</Label>
            <Input
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="Enter project name"
              className="mt-1"
            />
          </div>
          <div>
            <Label className="text-xs">Description</Label>
            <Textarea
              value={projectDescription}
              onChange={(e) => setProjectDescription(e.target.value)}
              placeholder="Project description (optional)"
              className="mt-1 h-20"
            />
          </div>
        </CardContent>
      </Card>

      {/* Project Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Project Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="flex justify-between">
              <span>Plot Area:</span>
              <Badge variant="outline">{plotArea} sqm</Badge>
            </div>
            <div className="flex justify-between">
              <span>Built Area:</span>
              <Badge variant="outline">{builtArea.toFixed(1)} sqm</Badge>
            </div>
            <div className="flex justify-between">
              <span>Total Walls:</span>
              <Badge variant="outline">{totalWalls}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Total Floors:</span>
              <Badge variant="outline">{floorPlan.floors?.length || 1}</Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Cost Estimation with Store Recommendations */}
      {estimate && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Cost Estimation & Best Prices</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2 text-xs">
              <div className="flex justify-between font-semibold">
                <span>Material</span>
                <span>Estimated Cost</span>
              </div>
              <Separator />

              <div className="flex justify-between">
                <span>Concrete ({estimate.concrete.volume.toFixed(1)} m³)</span>
                <span>₱{estimate.concrete.cost.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-500 ml-4">
                Best: {CONSTRUCTION_STORES[0]} - ₱{(estimate.concrete.cost * 0.95).toLocaleString()}
              </div>

              <div className="flex justify-between">
                <span>Steel ({estimate.steel.weight.toFixed(0)} kg)</span>
                <span>₱{estimate.steel.cost.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-500 ml-4">
                Best: {CONSTRUCTION_STORES[1]} - ₱{(estimate.steel.cost * 0.97).toLocaleString()}
              </div>

              <div className="flex justify-between">
                <span>Blocks ({estimate.blocks.count} pieces)</span>
                <span>₱{estimate.blocks.cost.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-500 ml-4">
                Best: {CONSTRUCTION_STORES[2]} - ₱{(estimate.blocks.cost * 0.96).toLocaleString()}
              </div>

              <div className="flex justify-between">
                <span>Roofing ({estimate.roofing.area.toFixed(1)} m²)</span>
                <span>₱{estimate.roofing.cost.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-500 ml-4">
                Best: {CONSTRUCTION_STORES[3]} - ₱{(estimate.roofing.cost * 0.94).toLocaleString()}
              </div>

              <div className="flex justify-between">
                <span>Windows ({estimate.windows.count} pieces)</span>
                <span>₱{estimate.windows.cost.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-500 ml-4">
                Best: {CONSTRUCTION_STORES[4]} - ₱{(estimate.windows.cost * 0.98).toLocaleString()}
              </div>

              <div className="flex justify-between">
                <span>Doors ({estimate.doors.count} pieces)</span>
                <span>₱{estimate.doors.cost.toLocaleString()}</span>
              </div>
              <div className="text-xs text-gray-500 ml-4">
                Best: {CONSTRUCTION_STORES[5]} - ₱{(estimate.doors.cost * 0.95).toLocaleString()}
              </div>

              <div className="flex justify-between">
                <span>Labor</span>
                <span>₱{estimate.labor.cost.toLocaleString()}</span>
              </div>

              <Separator />
              <div className="flex justify-between font-bold">
                <span>TOTAL PROJECT COST</span>
                <span>₱{estimate.total.toLocaleString()}</span>
              </div>
            </div>

            <Button
              size="sm"
              variant="outline"
              className="w-full bg-transparent"
              onClick={() => setShowStoreComparison(!showStoreComparison)}
            >
              {showStoreComparison ? "Hide" : "Show"} Construction Stores
            </Button>

            {showStoreComparison && (
              <div className="mt-3 p-3 bg-gray-50 rounded text-xs space-y-2">
                <div className="font-semibold">Available Construction Stores:</div>
                {CONSTRUCTION_STORES.map((store, idx) => (
                  <div key={idx} className="text-gray-700">
                    • {store}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Save/Load Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Save & Load</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button onClick={saveProject} className="w-full" size="sm" disabled={totalWalls === 0}>
            <Save className="w-4 h-4 mr-2" />
            Save Project
          </Button>

          <Button
            onClick={() => fileInputRef.current?.click()}
            className="w-full bg-transparent"
            size="sm"
            variant="outline"
          >
            <Upload className="w-4 h-4 mr-2" />
            Load Project
          </Button>

          <input ref={fileInputRef} type="file" accept=".json" onChange={loadProject} style={{ display: "none" }} />
        </CardContent>
      </Card>

      {/* Export Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Export Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={exportFloorPlan}
            className="w-full bg-transparent"
            size="sm"
            variant="outline"
            disabled={totalWalls === 0}
          >
            <Download className="w-4 h-4 mr-2" />
            Export Floor Plan
          </Button>

          <Button
            onClick={exportMaterialList}
            className="w-full bg-transparent"
            size="sm"
            variant="outline"
            disabled={!estimate}
          >
            <FileText className="w-4 h-4 mr-2" />
            Export Material List
          </Button>

          <Button
            onClick={generateReport}
            className="w-full bg-transparent"
            size="sm"
            variant="outline"
            disabled={totalWalls === 0}
          >
            <FileText className="w-4 h-4 mr-2" />
            Generate Report
          </Button>
        </CardContent>
      </Card>

      {/* Share Options */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Share Options</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Button
            onClick={copyToClipboard}
            className="w-full bg-transparent"
            size="sm"
            variant="outline"
            disabled={totalWalls === 0}
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy to Clipboard
          </Button>
        </CardContent>
      </Card>

      {/* File Format Information */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">File Formats</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs text-gray-600">
            <div>
              <strong>.json</strong> - Complete project data
            </div>
            <div>
              <strong>.csv</strong> - Material list for spreadsheets
            </div>
            <div>
              <strong>.txt</strong> - Human-readable project report
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Tips */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1 text-xs text-gray-600">
            <div>• Save regularly to avoid losing work</div>
            <div>• Export material lists for contractors</div>
            <div>• Generate reports for project documentation</div>
            <div>• Check multiple stores for best pricing</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function calculateDistance(p1: { x: number; z: number }, p2: { x: number; z: number }): number {
  const dx = p2.x - p1.x
  const dz = p2.z - p1.z
  return Math.sqrt(dx * dx + dz * dz)
}
