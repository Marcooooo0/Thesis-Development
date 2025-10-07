"use client"

import { useMemo } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { AlertTriangle, CheckCircle, XCircle, Info } from "lucide-react"

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

interface FloorPlan {
  walls: Wall[]
  totalArea: number
  plotBounds: { width: number; depth: number }
  floors: any[] // Accept floors array for multi-floor support
  staircases?: any[]
  roofStyle?: string
  roofColor?: string
  roofSlopeDirection?: string
}

interface ValidationResult {
  isValid: boolean
  warnings: string[]
  errors: string[]
  suggestions: string[]
}

interface PlotValidatorProps {
  plotBounds: { width: number; depth: number }
  walls: Wall[]
  maxPlotArea?: number
}

function calculateDistance(p1: Point2D, p2: Point2D): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2))
}

function isPointInsidePlot(point: Point2D, plotBounds: { width: number; depth: number }): boolean {
  const halfWidth = plotBounds.width / 2
  const halfDepth = plotBounds.depth / 2
  return point.x >= -halfWidth && point.x <= halfWidth && point.z >= -halfDepth && point.z <= halfDepth
}

export default function PlotValidator({ plotBounds, walls, maxPlotArea = 200 }: PlotValidatorProps) {
  const validation = useMemo((): ValidationResult => {
    const warnings: string[] = []
    const errors: string[] = []
    const suggestions: string[] = []

    const currentPlotArea = plotBounds.width * plotBounds.depth
    const totalWallLength = walls.reduce((sum, wall) => sum + calculateDistance(wall.start, wall.end), 0)

    if (currentPlotArea > maxPlotArea) {
      errors.push(`Plot area (${currentPlotArea} sqm) exceeds maximum allowed (${maxPlotArea} sqm)`)
    } else if (currentPlotArea > maxPlotArea * 0.9) {
      warnings.push(`Plot area is close to maximum limit (${currentPlotArea}/${maxPlotArea} sqm)`)
    }

    walls.forEach((wall, index) => {
      if (!isPointInsidePlot(wall.start, plotBounds)) {
        errors.push(`Wall ${index + 1} start point is outside plot boundary`)
      }
      if (!isPointInsidePlot(wall.end, plotBounds)) {
        errors.push(`Wall ${index + 1} end point is outside plot boundary`)
      }

      // Check minimum wall length
      const wallLength = calculateDistance(wall.start, wall.end)
      if (wallLength < 0.5) {
        warnings.push(`Wall ${index + 1} is very short (${wallLength.toFixed(2)}m)`)
      }

      // Check wall height constraints
      if (wall.height > 4) {
        warnings.push(`Wall ${index + 1} is very tall (${wall.height}m) - may require special permits`)
      }
      if (wall.height < 2.4) {
        warnings.push(`Wall ${index + 1} is below standard height (${wall.height}m < 2.4m)`)
      }
    })

    const buildingEfficiency = totalWallLength / currentPlotArea
    if (buildingEfficiency < 0.3) {
      suggestions.push(`Low building efficiency (${(buildingEfficiency * 100).toFixed(1)}%) - consider larger rooms`)
    } else if (buildingEfficiency > 0.8) {
      warnings.push(`High building efficiency (${(buildingEfficiency * 100).toFixed(1)}%) - limited outdoor space`)
    }

    if (totalWallLength > 0) {
      const avgWallThickness = walls.reduce((sum, wall) => sum + wall.thickness, 0) / walls.length
      if (avgWallThickness < 0.15) {
        warnings.push(
          `Average wall thickness (${avgWallThickness.toFixed(2)}m) may be insufficient for structural integrity`,
        )
      }
    }

    const roomTypes = walls.map((wall) => wall.material)
    const hasKitchen = roomTypes.includes("kitchen")
    const hasBathroom = roomTypes.includes("bathroom")
    const hasLiving = roomTypes.includes("living")
    const bedroomCount = roomTypes.filter((type) => type === "bedroom").length

    if (!hasKitchen && walls.length > 0) {
      suggestions.push("Consider adding a kitchen for a complete house design")
    }
    if (!hasBathroom && walls.length > 0) {
      suggestions.push("Consider adding a bathroom for a complete house design")
    }
    if (!hasLiving && walls.length > 1) {
      suggestions.push("Consider adding a living room for better functionality")
    }
    if (bedroomCount > 3) {
      suggestions.push(`${bedroomCount} bedrooms may require additional bathrooms`)
    }

    if (walls.some((wall) => wall.doors.some((door) => door.width < 0.8))) {
      suggestions.push("Consider wider doors (≥0.8m) for accessibility")
    }

    const isValid = errors.length === 0

    return { isValid, warnings, errors, suggestions }
  }, [plotBounds, walls, maxPlotArea])

  const currentPlotArea = plotBounds.width * plotBounds.depth
  const totalWallLength = walls.reduce((sum, wall) => sum + calculateDistance(wall.start, wall.end), 0)
  const buildingEfficiency = currentPlotArea > 0 ? (totalWallLength / currentPlotArea) * 100 : 0
  const plotUsagePercentage = (currentPlotArea / maxPlotArea) * 100

  return (
    <div className="space-y-4">
      {/* Overall Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            {validation.isValid ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <XCircle className="w-4 h-4 text-red-500" />
            )}
            Validation Status
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-sm">Plot Usage:</span>
              <Badge
                variant={plotUsagePercentage > 100 ? "destructive" : plotUsagePercentage > 90 ? "secondary" : "default"}
              >
                {plotUsagePercentage.toFixed(1)}%
              </Badge>
            </div>
            <Progress value={Math.min(plotUsagePercentage, 100)} className="h-2" />
            <div className="text-xs text-gray-500">
              {currentPlotArea} / {maxPlotArea} sqm
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Building Metrics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Building Metrics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span>Plot Dimensions:</span>
              <span>
                {plotBounds.width}m × {plotBounds.depth}m
              </span>
            </div>
            <div className="flex justify-between">
              <span>Total Walls:</span>
              <span>{walls.length}</span>
            </div>
            <div className="flex justify-between">
              <span>Room Area:</span>
              <span>{totalWallLength.toFixed(1)} sqm</span>
            </div>
            <div className="flex justify-between">
              <span>Building Efficiency:</span>
              <Badge
                variant={buildingEfficiency < 30 ? "secondary" : buildingEfficiency > 80 ? "destructive" : "default"}
              >
                {buildingEfficiency.toFixed(1)}%
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Errors */}
      {validation.errors.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-red-600">
              <XCircle className="w-4 h-4" />
              Errors ({validation.errors.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {validation.errors.map((error, index) => (
                <div key={index} className="text-xs text-red-600 flex items-start gap-2">
                  <XCircle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{error}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings */}
      {validation.warnings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-yellow-600">
              <AlertTriangle className="w-4 h-4" />
              Warnings ({validation.warnings.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {validation.warnings.map((warning, index) => (
                <div key={index} className="text-xs text-yellow-600 flex items-start gap-2">
                  <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Suggestions */}
      {validation.suggestions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2 text-blue-600">
              <Info className="w-4 h-4" />
              Suggestions ({validation.suggestions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {validation.suggestions.map((suggestion, index) => (
                <div key={index} className="text-xs text-blue-600 flex items-start gap-2">
                  <Info className="w-3 h-3 mt-0.5 flex-shrink-0" />
                  <span>{suggestion}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Building Code Compliance */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Building Code Compliance</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between items-center">
              <span>Plot Size Limit:</span>
              <Badge variant={currentPlotArea <= maxPlotArea ? "default" : "destructive"}>
                {currentPlotArea <= maxPlotArea ? "✓ Compliant" : "✗ Exceeds Limit"}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span>Minimum Room Sizes:</span>
              <Badge
                variant={
                  walls.every((wall) => {
                    if (wall.material === "bedroom") return wall.thickness >= 6
                    if (wall.material === "bathroom") return wall.thickness >= 4
                    return true
                  })
                    ? "default"
                    : "secondary"
                }
              >
                {walls.every((wall) => {
                  if (wall.material === "bedroom") return wall.thickness >= 6
                  if (wall.material === "bathroom") return wall.thickness >= 4
                  return true
                })
                  ? "✓ Compliant"
                  : "⚠ Check Sizes"}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span>Wall Heights:</span>
              <Badge variant={walls.every((wall) => wall.height >= 2.4 && wall.height <= 4) ? "default" : "secondary"}>
                {walls.every((wall) => wall.height >= 2.4 && wall.height <= 4) ? "✓ Standard" : "⚠ Non-standard"}
              </Badge>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
