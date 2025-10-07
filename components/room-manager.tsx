"use client"

import { useState, useMemo, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Trash2, Plus, Home, Bed, ChefHat, Bath, Utensils, Wrench, Car } from "lucide-react"

interface Point2D {
  x: number
  z: number
}

interface Window {
  id: string
  position: Point2D
  width: number
  height: number
}

interface Door {
  id: string
  position: Point2D
  width: number
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

interface Room {
  id: string
  name: string
  wallIds: string[]
  area: number
  type: "living" | "bedroom" | "kitchen" | "bathroom" | "dining" | "utility" | "garage"
  color: string
}

interface RoomManagerProps {
  walls: Wall[]
  rooms: Room[]
  onRoomsChange: (rooms: Room[]) => void
  selectedRoomId: string | null
  onRoomSelect: (roomId: string | null) => void
}

function generateId(): string {
  return Math.random().toString(36).substr(2, 9)
}

function calculateDistance(p1: Point2D, p2: Point2D): number {
  return Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.z - p1.z, 2))
}

// Find walls that form a closed polygon
function findEnclosedArea(walls: Wall[]): { area: number; wallIds: string[] } | null {
  if (walls.length < 3) return null

  // Simple polygon area calculation using shoelace formula
  const points: Point2D[] = []
  const wallIds: string[] = []

  // Try to trace a path through connected walls
  const currentWall = walls[0]
  let currentPoint = currentWall.start
  points.push(currentPoint)
  wallIds.push(currentWall.id)

  const usedWalls = new Set([currentWall.id])

  while (usedWalls.size < walls.length) {
    // Find next connected wall
    const nextWall = walls.find(
      (wall) =>
        !usedWalls.has(wall.id) &&
        (calculateDistance(currentPoint, wall.start) < 0.1 || calculateDistance(currentPoint, wall.end) < 0.1),
    )

    if (!nextWall) break

    // Determine which end to use
    if (calculateDistance(currentPoint, nextWall.start) < 0.1) {
      currentPoint = nextWall.end
    } else {
      currentPoint = nextWall.start
    }

    points.push(currentPoint)
    wallIds.push(nextWall.id)
    usedWalls.add(nextWall.id)
  }

  // Check if we have a closed polygon
  if (points.length >= 3 && calculateDistance(points[0], points[points.length - 1]) < 0.1) {
    const area = calculatePolygonArea(points)
    return { area, wallIds }
  }

  return null
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

const ROOM_TYPES = [
  { value: "living", label: "Living Room", icon: Home, color: "#3b82f6" },
  { value: "bedroom", label: "Bedroom", icon: Bed, color: "#8b5cf6" },
  { value: "kitchen", label: "Kitchen", icon: ChefHat, color: "#f59e0b" },
  { value: "bathroom", label: "Bathroom", icon: Bath, color: "#06b6d4" },
  { value: "dining", label: "Dining Room", icon: Utensils, color: "#10b981" },
  { value: "utility", label: "Utility Room", icon: Wrench, color: "#6b7280" },
  { value: "garage", label: "Garage", icon: Car, color: "#ef4444" },
] as const

export default function RoomManager({ walls, rooms, onRoomsChange, selectedRoomId, onRoomSelect }: RoomManagerProps) {
  const [newRoomName, setNewRoomName] = useState("")
  const [newRoomType, setNewRoomType] = useState<Room["type"]>("living")
  const [selectedWallIds, setSelectedWallIds] = useState<string[]>([])

  // Find potential rooms from wall connections
  const potentialRooms = useMemo(() => {
    const roomCandidates: Array<{ area: number; wallIds: string[]; center: Point2D }> = []

    // Group walls that could form rooms
    const wallGroups: Wall[][] = []
    const usedWalls = new Set<string>()

    walls.forEach((wall) => {
      if (usedWalls.has(wall.id)) return

      const connectedWalls = [wall]
      const toCheck = [wall]
      usedWalls.add(wall.id)

      while (toCheck.length > 0) {
        const currentWall = toCheck.pop()!

        walls.forEach((otherWall) => {
          if (usedWalls.has(otherWall.id)) return

          const isConnected =
            calculateDistance(currentWall.start, otherWall.start) < 0.1 ||
            calculateDistance(currentWall.start, otherWall.end) < 0.1 ||
            calculateDistance(currentWall.end, otherWall.start) < 0.1 ||
            calculateDistance(currentWall.end, otherWall.end) < 0.1

          if (isConnected) {
            connectedWalls.push(otherWall)
            toCheck.push(otherWall)
            usedWalls.add(otherWall.id)
          }
        })
      }

      if (connectedWalls.length >= 3) {
        wallGroups.push(connectedWalls)
      }
    })

    // Calculate areas for each group
    wallGroups.forEach((wallGroup) => {
      const enclosedArea = findEnclosedArea(wallGroup)
      if (enclosedArea && enclosedArea.area > 1) {
        // Minimum 1 sqm
        // Calculate center point
        const allPoints: Point2D[] = []
        wallGroup.forEach((wall) => {
          allPoints.push(wall.start, wall.end)
        })

        const center = {
          x: allPoints.reduce((sum, p) => sum + p.x, 0) / allPoints.length,
          z: allPoints.reduce((sum, p) => sum + p.z, 0) / allPoints.length,
        }

        roomCandidates.push({
          area: enclosedArea.area,
          wallIds: enclosedArea.wallIds,
          center,
        })
      }
    })

    return roomCandidates
  }, [walls])

  const createRoom = useCallback(() => {
    if (!newRoomName.trim()) return

    let wallIds = selectedWallIds
    let area = 0

    // If no walls selected, try to use the first potential room
    if (wallIds.length === 0 && potentialRooms.length > 0) {
      const firstCandidate = potentialRooms[0]
      wallIds = firstCandidate.wallIds
      area = firstCandidate.area
    } else if (wallIds.length > 0) {
      // Calculate area from selected walls
      const selectedWalls = walls.filter((wall) => wallIds.includes(wall.id))
      const enclosedArea = findEnclosedArea(selectedWalls)
      area = enclosedArea?.area || 0
    }

    const roomType = ROOM_TYPES.find((type) => type.value === newRoomType)
    const newRoom: Room = {
      id: generateId(),
      name: newRoomName.trim(),
      wallIds,
      area,
      type: newRoomType,
      color: roomType?.color || "#6b7280",
    }

    onRoomsChange([...rooms, newRoom])
    setNewRoomName("")
    setSelectedWallIds([])
  }, [newRoomName, newRoomType, selectedWallIds, potentialRooms, walls, rooms, onRoomsChange])

  const deleteRoom = useCallback(
    (roomId: string) => {
      onRoomsChange(rooms.filter((room) => room.id !== roomId))
      if (selectedRoomId === roomId) {
        onRoomSelect(null)
      }
    },
    [rooms, onRoomsChange, selectedRoomId, onRoomSelect],
  )

  const autoDetectRooms = useCallback(() => {
    const newRooms: Room[] = []

    potentialRooms.forEach((candidate, index) => {
      // Skip if room already exists with these walls
      const existingRoom = rooms.find(
        (room) =>
          room.wallIds.length === candidate.wallIds.length &&
          room.wallIds.every((id) => candidate.wallIds.includes(id)),
      )

      if (!existingRoom) {
        const roomType = ROOM_TYPES[index % ROOM_TYPES.length]
        newRooms.push({
          id: generateId(),
          name: `Room ${rooms.length + newRooms.length + 1}`,
          wallIds: candidate.wallIds,
          area: candidate.area,
          type: roomType.value,
          color: roomType.color,
        })
      }
    })

    if (newRooms.length > 0) {
      onRoomsChange([...rooms, ...newRooms])
    }
  }, [potentialRooms, rooms, onRoomsChange])

  const toggleWallSelection = (wallId: string) => {
    setSelectedWallIds((prev) => (prev.includes(wallId) ? prev.filter((id) => id !== wallId) : [...prev, wallId]))
  }

  const selectedRoom = rooms.find((room) => room.id === selectedRoomId)
  const totalRoomArea = rooms.reduce((sum, room) => sum + room.area, 0)

  return (
    <div className="space-y-4">
      {/* Room Creation */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Create Room</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div>
            <Label className="text-xs">Room Name</Label>
            <Input
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="e.g., Master Bedroom"
              className="mt-1"
            />
          </div>

          <div>
            <Label className="text-xs">Room Type</Label>
            <Select value={newRoomType} onValueChange={(value: Room["type"]) => setNewRoomType(value)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ROOM_TYPES.map((type) => {
                  const Icon = type.icon
                  return (
                    <SelectItem key={type.value} value={type.value}>
                      <div className="flex items-center gap-2">
                        <Icon className="w-4 h-4" />
                        {type.label}
                      </div>
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex gap-2">
            <Button size="sm" onClick={createRoom} disabled={!newRoomName.trim()}>
              <Plus className="w-3 h-3 mr-1" />
              Create Room
            </Button>
            <Button size="sm" variant="outline" onClick={autoDetectRooms}>
              Auto Detect
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Potential Rooms */}
      {potentialRooms.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Detected Spaces</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {potentialRooms.map((candidate, index) => (
                <div key={index} className="p-2 bg-gray-50 rounded text-xs">
                  <div className="flex justify-between items-center">
                    <span>Space {index + 1}</span>
                    <Badge variant="secondary">{candidate.area.toFixed(1)} sqm</Badge>
                  </div>
                  <div className="text-gray-500 mt-1">{candidate.wallIds.length} walls</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Wall Selection for Manual Room Creation */}
      {walls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Select Walls</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-32 overflow-auto">
              {walls.map((wall, index) => (
                <div
                  key={wall.id}
                  className={`p-2 rounded text-xs cursor-pointer ${
                    selectedWallIds.includes(wall.id) ? "bg-blue-100" : "bg-gray-50"
                  }`}
                  onClick={() => toggleWallSelection(wall.id)}
                >
                  <div className="flex justify-between">
                    <span>Wall {index + 1}</span>
                    <span>{calculateDistance(wall.start, wall.end).toFixed(1)}m</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-gray-500 mt-2">Selected: {selectedWallIds.length} walls</div>
          </CardContent>
        </Card>
      )}

      {/* Existing Rooms */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Rooms ({rooms.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {rooms.length === 0 ? (
            <div className="text-xs text-gray-500 text-center py-4">
              No rooms created yet. Create walls first, then add rooms.
            </div>
          ) : (
            <div className="space-y-2">
              {rooms.map((room) => {
                const roomType = ROOM_TYPES.find((type) => type.value === room.type)
                const Icon = roomType?.icon || Home

                return (
                  <div
                    key={room.id}
                    className={`p-3 rounded border cursor-pointer ${
                      room.id === selectedRoomId ? "border-blue-500 bg-blue-50" : "border-gray-200"
                    }`}
                    onClick={() => onRoomSelect(room.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: room.color }} />
                        <Icon className="w-4 h-4" />
                        <span className="text-sm font-medium">{room.name}</span>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={(e) => {
                          e.stopPropagation()
                          deleteRoom(room.id)
                        }}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>

                    <div className="mt-2 text-xs text-gray-600">
                      <div className="flex justify-between">
                        <span>{roomType?.label}</span>
                        <Badge variant="outline">{room.area.toFixed(1)} sqm</Badge>
                      </div>
                      <div className="mt-1">{room.wallIds.length} walls</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Room Statistics */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Room Statistics</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span>Total Rooms:</span>
              <Badge variant="secondary">{rooms.length}</Badge>
            </div>
            <div className="flex justify-between">
              <span>Total Room Area:</span>
              <Badge variant="secondary">{totalRoomArea.toFixed(1)} sqm</Badge>
            </div>
            <Separator />
            {ROOM_TYPES.map((type) => {
              const count = rooms.filter((room) => room.type === type.value).length
              if (count === 0) return null

              const Icon = type.icon
              return (
                <div key={type.value} className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <Icon className="w-3 h-3" />
                    <span>{type.label}:</span>
                  </div>
                  <Badge variant="outline">{count}</Badge>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* Selected Room Details */}
      {selectedRoom && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Selected Room</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-xs">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: selectedRoom.color }} />
                <span className="font-medium">{selectedRoom.name}</span>
              </div>
              <div>Type: {ROOM_TYPES.find((t) => t.value === selectedRoom.type)?.label}</div>
              <div>Area: {selectedRoom.area.toFixed(2)} sqm</div>
              <div>Walls: {selectedRoom.wallIds.length}</div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
