"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plane, MapPin, Calendar, Users, Sparkles, ArrowRight, Loader2 } from "lucide-react"
import { cn } from "@/lib/utils"
import ReactMarkdown from 'react-markdown'

interface TravelFormData {
  origin: string
  destination: string
  departure_date: string
  return_date: string
  cabin_class: string
  passengers: number
}

interface PlanState {
  plan_run_id: string
  state: "PREPARING" | "IN_PROGRESS" | "COMPLETE" | "FAILED"
  current_step_index: number
  outputs: any
  final_output?: any
  error?: string
}

const steps = [
  { id: "destination", title: "Destination", icon: MapPin },
  { id: "dates", title: "Travel Dates", icon: Calendar },
  { id: "details", title: "Flight Details", icon: Plane },
  { id: "processing", title: "Planning", icon: Loader2 },
  { id: "results", title: "Results", icon: Users },
]

// Helper function to convert JSON to readable markdown
const jsonToMarkdown = (data: any): string => {
  if (!data) return '';
  
  // If it's already a string, return it
  if (typeof data === 'string') {
    return data;
  }
  
  // Convert object to formatted markdown
  const formatValue = (value: any, depth: number = 0): string => {
    const indent = '  '.repeat(depth);
    
    if (value === null || value === undefined) {
      return 'null';
    }
    
    if (typeof value === 'string') {
      return value;
    }
    
    if (typeof value === 'number' || typeof value === 'boolean') {
      return value.toString();
    }
    
    if (Array.isArray(value)) {
      if (value.length === 0) return '[]';
      return value.map(item => `${indent}- ${formatValue(item, depth + 1)}`).join('\n');
    }
    
    if (typeof value === 'object') {
      const entries = Object.entries(value);
      if (entries.length === 0) return '{}';
      
      return entries.map(([key, val]) => {
        if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
          return `${indent}**${key}:**\n${formatValue(val, depth + 1)}`;
        } else {
          return `${indent}**${key}:** ${formatValue(val, depth + 1)}`;
        }
      }).join('\n\n');
    }
    
    return String(value);
  };
  
  return formatValue(data);
};

export default function TravelPlannerPage() {
  const [currentStep, setCurrentStep] = useState(0)
  const [formData, setFormData] = useState<TravelFormData>({
    origin: "",
    destination: "",
    departure_date: "",
    return_date: "",
    cabin_class: "economy",
    passengers: 1,
  })
  const [planState, setPlanState] = useState<PlanState | null>(null)
  const [pollingInterval, setPollingInterval] = useState<NodeJS.Timeout | null>(null)

  // Add logging whenever planState changes
  useEffect(() => {
    if (planState) {
      console.log("🔄 Plan state updated:", planState)
      console.log("📊 Current plan state summary:", {
        id: planState.plan_run_id,
        state: planState.state,
        step: planState.current_step_index,
        hasOutputs: !!planState.outputs,
        hasFinalOutput: !!planState.final_output,
        hasError: !!planState.error
      })
    }
  }, [planState])

  // Polling function to check plan state
  const pollPlanState = async (planRunId: string) => {
    try {
      console.log("🔍 Polling plan state for:", planRunId)
      const response = await fetch(`http://localhost:8000/plan/${planRunId}/state`)
      
      if (!response.ok) {
        if (response.status === 404) {
          console.error("❌ Plan not found:", planRunId)
          return
        }
        console.error("❌ Failed to fetch plan state:", response.status)
        return
      }

      const state = await response.json()
      console.log("📊 Received plan state from polling:", state)
      
      // Log additional status information
      if (state.status_message) {
        console.log("📝 Status message:", state.status_message)
      }
      
      // Log step outputs in detail if they exist
      if (state.outputs?.final_output) {
        console.log("📋 Step outputs breakdown:")
        Object.entries(state.outputs.final_output).forEach(([key, value], index) => {
          console.log(`  Step ${index + 1} (${key}):`, value)
          
          // Try to parse nested JSON strings with proper type checking
          if (value && typeof value === 'object' && 'value' in value) {
            const stepOutput = value as any
            if (stepOutput.value && typeof stepOutput.value === 'string') {
              try {
                const parsedValue = JSON.parse(stepOutput.value)
                console.log(`  Step ${index + 1} parsed value:`, parsedValue)
              } catch (e) {
                console.log(`  Step ${index + 1} value (string):`, stepOutput.value)
              }
            }
          }
        })
      }
      
      setPlanState(state)

      // Stop polling if plan is complete or failed
      if (state.state === "COMPLETE" || state.state === "FAILED") {
        console.log("🎯 Plan completed, stopping polling. Final state:", state.state)
        if (state.status_message) {
          console.log("📝 Final status:", state.status_message)
        }
        
        if (pollingInterval) {
          clearInterval(pollingInterval)
          setPollingInterval(null)
        }
        setCurrentStep(4) // Move to results step
      } else if (state.state === "IN_PROGRESS") {
        console.log("⏳ Plan still in progress, current step:", state.current_step_index + 1)
      }
    } catch (error) {
      console.error("❌ Error polling plan state:", error)
    }
  }

  // Start polling when we have a plan run ID
  const startPolling = (planRunId: string) => {
    console.log("⏰ Starting polling for plan:", planRunId)
    
    // Clear any existing interval
    if (pollingInterval) {
      clearInterval(pollingInterval)
    }

    // Poll immediately
    pollPlanState(planRunId)

    // Set up polling every 7-8 seconds (using 7500ms = 7.5 seconds)
    const interval = setInterval(() => {
      pollPlanState(planRunId)
    }, 7500)

    setPollingInterval(interval)
  }

  // Cleanup polling on component unmount
  useEffect(() => {
    return () => {
      if (pollingInterval) {
        console.log("🧹 Cleaning up polling interval")
        clearInterval(pollingInterval)
      }
    }
  }, [pollingInterval])

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep(currentStep + 1)
    }
  }

  const prevStep = () => {
    if (currentStep > 0) {
      setCurrentStep(currentStep - 1)
    }
  }

  const startPlanning = async () => {
    try {
      const processedFormData = {
        ...formData,
        departure_date: formData.departure_date,
        return_date: formData.return_date,
      }

      console.log("🚀 Starting planning with form data:", formData)
      console.log("🔄 Processed form data:", processedFormData)

      const response = await fetch("http://localhost:8000/plan/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(processedFormData),
      })

      console.log("📡 API Response status:", response.status)
      console.log("📡 API Response headers:", Object.fromEntries(response.headers.entries()))

      if (!response.ok) {
        const errorText = await response.text()
        console.error("❌ API Error response:", errorText)
        throw new Error("Failed to start planning")
      }

      const initialState = await response.json()
      console.log("✅ Initial state received:", initialState)
      setPlanState(initialState)

      // Start polling for state updates instead of WebSocket
      startPolling(initialState.plan_run_id)

      setCurrentStep(3) // Move to processing step
    } catch (error) {
      console.error("❌ Error starting plan:", error)
      console.error("📊 Error details:", {
        message: error instanceof Error ? error.message : String(error),
        formData: formData,
        timestamp: new Date().toISOString()
      })
    }
  }

  const renderStep = () => {
    switch (currentStep) {
      case 0:
        return (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5 }}
            className="space-y-12"
          >
            <div className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="mx-auto w-16 h-16 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full flex items-center justify-center backdrop-blur-sm"
              >
                <MapPin className="w-8 h-8 text-primary" />
              </motion.div>
              <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Where are you traveling?
              </h1>
              <p className="text-lg text-muted-foreground/80">Tell us your departure and destination cities</p>
            </div>
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-3"
              >
                <label className="text-sm font-medium text-muted-foreground/60 uppercase tracking-wider">From</label>
                <Input
                  placeholder="Enter departure city"
                  value={formData.origin}
                  onChange={(e) => setFormData({ ...formData, origin: e.target.value })}
                  className="h-16 text-xl bg-transparent border-0 border-b-2 border-muted-foreground/20 rounded-none focus:border-primary focus:bg-transparent transition-all duration-500 placeholder:text-muted-foreground/40"
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                <label className="text-sm font-medium text-muted-foreground/60 uppercase tracking-wider">To</label>
                <Input
                  placeholder="Enter destination city"
                  value={formData.destination}
                  onChange={(e) => setFormData({ ...formData, destination: e.target.value })}
                  className="h-16 text-xl bg-transparent border-0 border-b-2 border-muted-foreground/20 rounded-none focus:border-primary focus:bg-transparent transition-all duration-500 placeholder:text-muted-foreground/40"
                />
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex justify-end"
            >
              <Button
                onClick={nextStep}
                disabled={!formData.origin || !formData.destination}
                size="lg"
                className="bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-white px-8 py-3 rounded-full transition-all duration-300 disabled:opacity-50"
              >
                Continue <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </motion.div>
          </motion.div>
        )

      case 1:
        return (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5 }}
            className="space-y-12"
          >
            <div className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="mx-auto w-16 h-16 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full flex items-center justify-center backdrop-blur-sm"
              >
                <Calendar className="w-8 h-8 text-primary" />
              </motion.div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
                When are you traveling?
              </h2>
              <p className="text-lg text-muted-foreground/80">
                You can type naturally like "2 weeks later" or use specific dates
              </p>
            </div>
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-3"
              >
                <label className="text-sm font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Departure Date
                </label>
                <Input
                  placeholder="e.g., 2 weeks later, March 15, 2025-03-15"
                  value={formData.departure_date}
                  onChange={(e) => setFormData({ ...formData, departure_date: e.target.value })}
                  className="h-16 text-xl bg-transparent border-0 border-b-2 border-muted-foreground/20 rounded-none focus:border-primary focus:bg-transparent transition-all duration-500 placeholder:text-muted-foreground/40"
                />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                <label className="text-sm font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Return Date
                </label>
                <Input
                  placeholder="e.g., 3 weeks later, March 22, 2025-03-22"
                  value={formData.return_date}
                  onChange={(e) => setFormData({ ...formData, return_date: e.target.value })}
                  className="h-16 text-xl bg-transparent border-0 border-b-2 border-muted-foreground/20 rounded-none focus:border-primary focus:bg-transparent transition-all duration-500 placeholder:text-muted-foreground/40"
                />
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex gap-4"
            >
              <Button variant="ghost" onClick={prevStep} className="flex-1 text-muted-foreground hover:text-foreground">
                Back
              </Button>
              <Button
                onClick={nextStep}
                disabled={!formData.departure_date || !formData.return_date}
                size="lg"
                className="flex-1 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-white rounded-full transition-all duration-300"
              >
                Continue <ArrowRight className="ml-2 w-5 h-5" />
              </Button>
            </motion.div>
          </motion.div>
        )

      case 2:
        return (
          <motion.div
            initial={{ opacity: 0, x: 50 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -50 }}
            transition={{ duration: 0.5 }}
            className="space-y-12"
          >
            <div className="text-center space-y-4">
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                className="mx-auto w-16 h-16 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full flex items-center justify-center backdrop-blur-sm"
              >
                <Plane className="w-8 h-8 text-primary" />
              </motion.div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Flight preferences
              </h2>
              <p className="text-lg text-muted-foreground/80">Choose your cabin class and number of passengers</p>
            </div>
            <div className="space-y-8">
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="space-y-3"
              >
                <label className="text-sm font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Cabin Class
                </label>
                <Select
                  value={formData.cabin_class}
                  onValueChange={(value) => setFormData({ ...formData, cabin_class: value })}
                >
                  <SelectTrigger className="h-16 text-xl bg-transparent border-0 border-b-2 border-muted-foreground/20 rounded-none focus:border-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="economy">Economy</SelectItem>
                    <SelectItem value="premiumeconomy">Premium Economy</SelectItem>
                    <SelectItem value="business">Business</SelectItem>
                    <SelectItem value="first">First Class</SelectItem>
                  </SelectContent>
                </Select>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="space-y-3"
              >
                <label className="text-sm font-medium text-muted-foreground/60 uppercase tracking-wider">
                  Number of Passengers
                </label>
                <Select
                  value={formData.passengers.toString()}
                  onValueChange={(value) => setFormData({ ...formData, passengers: Number.parseInt(value) })}
                >
                  <SelectTrigger className="h-16 text-xl bg-transparent border-0 border-b-2 border-muted-foreground/20 rounded-none focus:border-primary">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((num) => (
                      <SelectItem key={num} value={num.toString()}>
                        {num} {num === 1 ? "Passenger" : "Passengers"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </motion.div>
            </div>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="flex gap-4"
            >
              <Button variant="ghost" onClick={prevStep} className="flex-1 text-muted-foreground hover:text-foreground">
                Back
              </Button>
              <Button
                onClick={startPlanning}
                size="lg"
                className="flex-1 bg-gradient-to-r from-primary to-purple-500 hover:from-primary/90 hover:to-purple-500/90 text-white rounded-full transition-all duration-300 animate-pulse"
              >
                Start Planning <Sparkles className="ml-2 w-5 h-5" />
              </Button>
            </motion.div>
          </motion.div>
        )

      case 3:
        return (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            className="text-center space-y-12"
          >
            <div className="space-y-6">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                className="mx-auto w-20 h-20 bg-gradient-to-br from-primary/20 to-purple-500/20 rounded-full flex items-center justify-center backdrop-blur-sm"
              >
                <Loader2 className="w-10 h-10 text-primary" />
              </motion.div>
              <h2 className="text-4xl font-bold bg-gradient-to-r from-primary via-purple-400 to-pink-400 bg-clip-text text-transparent">
                Planning your perfect trip
              </h2>
              <p className="text-lg text-muted-foreground/80">
                Our AI is searching for the best flights and accommodations...
              </p>
            </div>
            {planState && (
              <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                <div className="text-sm text-muted-foreground/60 uppercase tracking-wider">
                  Status: {planState.state}
                </div>
                {planState.state === "IN_PROGRESS" && (
                  <div className="text-sm text-muted-foreground/60">
                    Step {planState.current_step_index + 1} in progress...
                  </div>
                )}
              </motion.div>
            )}
          </motion.div>
        )

      case 4:
        return (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-8"
          >
            <div className="text-center space-y-2">
              <h2 className="text-3xl font-bold">Your travel plan is ready!</h2>
              <p className="text-muted-foreground">Here are the best options we found for you</p>
            </div>

            {planState?.state === "COMPLETE" && (
              <div className="space-y-6">
                {/* Check if we have final_output with the structured data */}
                {planState.final_output && (
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Left side - Flight and Accommodation Cards */}
                    <div className="lg:col-span-2 space-y-6">
                      {(() => {
                        let travelData = null;
                        
                        // Extract the travel data from final_output
                        if (typeof planState.final_output === 'string') {
                          try {
                            travelData = JSON.parse(planState.final_output);
                          } catch (e) {
                            console.log('Failed to parse final_output string');
                          }
                        } else if (planState.final_output.value) {
                          if (typeof planState.final_output.value === 'string') {
                            try {
                              travelData = JSON.parse(planState.final_output.value);
                            } catch (e) {
                              console.log('Failed to parse final_output.value string');
                            }
                          } else {
                            travelData = planState.final_output.value;
                          }
                        } else {
                          travelData = planState.final_output;
                        }
                        
                        if (!travelData) return null;
                        
                        return (
                          <>
                            {/* Departure Flight Card */}
                            {travelData.departureFlight && (
                              <div className="p-6 bg-gradient-to-br from-blue-500/10 to-blue-600/5 backdrop-blur-sm rounded-2xl border border-blue-500/20">
                                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-blue-400">
                                  <Plane className="w-6 h-6" />
                                  Departure Flight
                                </h3>
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <div>
                                      <p className="text-lg font-semibold text-white">{travelData.departureFlight.Airline}</p>
                                      <p className="text-sm text-gray-400">Airline</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-bold text-green-400">₹{travelData.departureFlight.price?.toLocaleString()}</p>
                                      <p className="text-sm text-gray-400">Total Price</p>
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-sm text-gray-400">Departure</p>
                                      <p className="font-semibold text-white">
                                        {new Date(travelData.departureFlight.departTime).toLocaleDateString()}
                                      </p>
                                      <p className="text-sm text-blue-300">
                                        {new Date(travelData.departureFlight.departTime).toLocaleTimeString()}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-gray-400">Arrival</p>
                                      <p className="font-semibold text-white">
                                        {new Date(travelData.departureFlight.arrivalTime).toLocaleDateString()}
                                      </p>
                                      <p className="text-sm text-blue-300">
                                        {new Date(travelData.departureFlight.arrivalTime).toLocaleTimeString()}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  {travelData.departureFlight.deepLinkUrl && (
                                    <Button asChild className="w-full bg-blue-600 hover:bg-blue-700">
                                      <a
                                        href={travelData.departureFlight.deepLinkUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        Book Departure Flight
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Return Flight Card */}
                            {travelData.returnFlight && (
                              <div className="p-6 bg-gradient-to-br from-purple-500/10 to-purple-600/5 backdrop-blur-sm rounded-2xl border border-purple-500/20">
                                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-purple-400">
                                  <Plane className="w-6 h-6 rotate-180" />
                                  Return Flight
                                </h3>
                                <div className="space-y-3">
                                  <div className="flex justify-between items-center">
                                    <div>
                                      <p className="text-lg font-semibold text-white">{travelData.returnFlight.Airline}</p>
                                      <p className="text-sm text-gray-400">Airline</p>
                                    </div>
                                    <div className="text-right">
                                      <p className="text-lg font-bold text-green-400">₹{travelData.returnFlight.price?.toLocaleString()}</p>
                                      <p className="text-sm text-gray-400">Total Price</p>
                                    </div>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-sm text-gray-400">Departure</p>
                                      <p className="font-semibold text-white">
                                        {new Date(travelData.returnFlight.departTime).toLocaleDateString()}
                                      </p>
                                      <p className="text-sm text-purple-300">
                                        {new Date(travelData.returnFlight.departTime).toLocaleTimeString()}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-gray-400">Arrival</p>
                                      <p className="font-semibold text-white">
                                        {new Date(travelData.returnFlight.arrivalTime).toLocaleDateString()}
                                      </p>
                                      <p className="text-sm text-purple-300">
                                        {new Date(travelData.returnFlight.arrivalTime).toLocaleTimeString()}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  {travelData.returnFlight.deepLinkUrl && (
                                    <Button asChild className="w-full bg-purple-600 hover:bg-purple-700">
                                      <a
                                        href={travelData.returnFlight.deepLinkUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        Book Return Flight
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Accommodation Card */}
                            {travelData.accommodation && (
                              <div className="p-6 bg-gradient-to-br from-green-500/10 to-green-600/5 backdrop-blur-sm rounded-2xl border border-green-500/20">
                                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-green-400">
                                  <MapPin className="w-6 h-6" />
                                  Accommodation
                                </h3>
                                <div className="space-y-3">
                                  <div>
                                    <p className="text-lg font-semibold text-white">{travelData.accommodation.HotelName}</p>
                                    <p className="text-sm text-gray-400">{travelData.accommodation.exact_location}</p>
                                  </div>
                                  
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <p className="text-sm text-gray-400">Check-in</p>
                                      <p className="font-semibold text-white">
                                        {new Date(travelData.accommodation.checkInTime).toLocaleDateString()}
                                      </p>
                                    </div>
                                    <div>
                                      <p className="text-sm text-gray-400">Check-out</p>
                                      <p className="font-semibold text-white">
                                        {new Date(travelData.accommodation.checkOutTime).toLocaleDateString()}
                                      </p>
                                    </div>
                                  </div>
                                  
                                  <div className="text-center py-2">
                                    <p className="text-2xl font-bold text-green-400">₹{travelData.accommodation.price?.toLocaleString()}</p>
                                    <p className="text-sm text-gray-400">Total Stay Cost</p>
                                  </div>
                                  
                                  {travelData.accommodation.bookingUrl && (
                                    <Button asChild className="w-full bg-green-600 hover:bg-green-700">
                                      <a
                                        href={travelData.accommodation.bookingUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                      >
                                        Book Accommodation
                                        <ArrowRight className="w-4 h-4 ml-2" />
                                      </a>
                                    </Button>
                                  )}
                                </div>
                              </div>
                            )}

                            {/* Total Cost Summary */}
                            {(travelData.departureFlight || travelData.returnFlight || travelData.accommodation) && (
                              <div className="p-6 bg-gradient-to-br from-yellow-500/10 to-yellow-600/5 backdrop-blur-sm rounded-2xl border border-yellow-500/20">
                                <h3 className="text-xl font-semibold mb-4 flex items-center gap-2 text-yellow-400">
                                  <Sparkles className="w-6 h-6" />
                                  Total Trip Cost
                                </h3>
                                <div className="space-y-2">
                                  {travelData.departureFlight && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-300">Departure Flight:</span>
                                      <span className="text-white font-semibold">₹{travelData.departureFlight.price?.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {travelData.returnFlight && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-300">Return Flight:</span>
                                      <span className="text-white font-semibold">₹{travelData.returnFlight.price?.toLocaleString()}</span>
                                    </div>
                                  )}
                                  {travelData.accommodation && (
                                    <div className="flex justify-between">
                                      <span className="text-gray-300">Accommodation:</span>
                                      <span className="text-white font-semibold">₹{travelData.accommodation.price?.toLocaleString()}</span>
                                    </div>
                                  )}
                                  <hr className="border-yellow-500/20 my-3" />
                                  <div className="flex justify-between text-lg font-bold">
                                    <span className="text-yellow-400">Total:</span>
                                    <span className="text-yellow-400">
                                      ₹{((travelData.departureFlight?.price || 0) + 
                                          (travelData.returnFlight?.price || 0) + 
                                          (travelData.accommodation?.price || 0)).toLocaleString()}
                                    </span>
                                  </div>
                                </div>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>

                    {/* Right side - Summary */}
                    <div className="lg:col-span-1">
                      <div className="sticky top-4">
                        <div className="p-6 bg-gradient-to-br from-background/20 to-background/10 backdrop-blur-sm rounded-2xl border border-white/10">
                          <h3 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <Sparkles className="w-5 h-5" />
                            Trip Summary
                          </h3>
                          <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                            <ReactMarkdown
                              components={{
                                h1: ({children}) => <h1 className="text-lg font-bold text-white mb-2">{children}</h1>,
                                h2: ({children}) => <h2 className="text-base font-semibold text-white mb-2">{children}</h2>,
                                h3: ({children}) => <h3 className="text-sm font-semibold text-blue-300 mb-1">{children}</h3>,
                                p: ({children}) => <p className="text-gray-300 mb-2 text-sm">{children}</p>,
                                strong: ({children}) => <strong className="font-semibold text-blue-300">{children}</strong>,
                                a: ({href, children}) => (
                                  <a 
                                    href={href} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-blue-400 hover:text-blue-300 underline break-all text-sm"
                                  >
                                    {children}
                                  </a>
                                ),
                                ul: ({children}) => <ul className="list-disc list-inside mb-2 text-gray-300 text-sm">{children}</ul>,
                                li: ({children}) => <li className="mb-1">{children}</li>,
                              }}
                            >
                              {(() => {
                                // Extract summary from final_output if it exists
                                if (planState.final_output?.summary) {
                                  return planState.final_output.summary;
                                }
                                
                                // Generate a summary from the travel data
                                let travelData = null;
                                if (typeof planState.final_output === 'string') {
                                  try {
                                    travelData = JSON.parse(planState.final_output);
                                  } catch (e) {
                                    return jsonToMarkdown(planState.final_output);
                                  }
                                } else if (planState.final_output?.value) {
                                  if (typeof planState.final_output.value === 'string') {
                                    try {
                                      travelData = JSON.parse(planState.final_output.value);
                                    } catch (e) {
                                      return planState.final_output.value;
                                    }
                                  } else {
                                    travelData = planState.final_output.value;
                                  }
                                }
                                
                                if (!travelData) return jsonToMarkdown(planState.final_output);
                                
                                // Generate summary markdown
                                let summary = "## Travel Plan Overview\n\n";
                                
                                if (travelData.departureFlight) {
                                  summary += `**Departure Flight:** ${travelData.departureFlight.Airline}\n`;
                                  summary += `- Date: ${new Date(travelData.departureFlight.departTime).toLocaleDateString()}\n`;
                                  summary += `- Price: ₹${travelData.departureFlight.price?.toLocaleString()}\n\n`;
                                }
                                
                                if (travelData.returnFlight) {
                                  summary += `**Return Flight:** ${travelData.returnFlight.Airline}\n`;
                                  summary += `- Date: ${new Date(travelData.returnFlight.departTime).toLocaleDateString()}\n`;
                                  summary += `- Price: ₹${travelData.returnFlight.price?.toLocaleString()}\n\n`;
                                }
                                
                                if (travelData.accommodation) {
                                  summary += `**Accommodation:** ${travelData.accommodation.HotelName}\n`;
                                  summary += `- Location: ${travelData.accommodation.exact_location}\n`;
                                  summary += `- Duration: ${new Date(travelData.accommodation.checkInTime).toLocaleDateString()} - ${new Date(travelData.accommodation.checkOutTime).toLocaleDateString()}\n`;
                                  summary += `- Price: ₹${travelData.accommodation.price?.toLocaleString()}\n\n`;
                                }
                                
                                const total = (travelData.departureFlight?.price || 0) + 
                                             (travelData.returnFlight?.price || 0) + 
                                             (travelData.accommodation?.price || 0);
                                             
                                summary += `**Total Trip Cost:** ₹${total.toLocaleString()}`;
                                
                                return summary;
                              })()}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fallback if no final_output */}
                {!planState.final_output && (
                  <div className="p-6 bg-gradient-to-br from-background/20 to-background/10 backdrop-blur-sm rounded-2xl border border-white/10">
                    <h3 className="text-xl font-semibold mb-4">Plan Details</h3>
                    <div className="prose prose-invert prose-sm max-w-none text-gray-300">
                      <ReactMarkdown
                        components={{
                          h1: ({children}) => <h1 className="text-xl font-bold text-white mb-3">{children}</h1>,
                          h2: ({children}) => <h2 className="text-lg font-semibold text-white mb-2">{children}</h2>,
                          h3: ({children}) => <h3 className="text-base font-semibold text-blue-300 mb-2">{children}</h3>,
                          p: ({children}) => <p className="text-gray-300 mb-2">{children}</p>,
                          strong: ({children}) => <strong className="font-semibold text-blue-300">{children}</strong>,
                          pre: ({children}) => <pre className="bg-gray-800 p-4 rounded-lg overflow-auto text-sm">{children}</pre>,
                          code: ({children}) => <code className="bg-gray-800 px-2 py-1 rounded text-sm">{children}</code>,
                        }}
                      >
                        {jsonToMarkdown(planState)}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>
            )}

            {planState?.state === "FAILED" && (
              <div className="p-6 bg-gradient-to-br from-red-500/10 to-red-600/5 backdrop-blur-sm rounded-2xl border border-red-500/20">
                <h3 className="text-xl font-semibold text-red-400 mb-2">Planning Failed</h3>
                <p className="text-muted-foreground">
                  {planState.error || "An error occurred while planning your trip."}
                </p>
              </div>
            )}

            <Button
              onClick={() => {
                // Clean up polling when starting over
                if (pollingInterval) {
                  clearInterval(pollingInterval)
                  setPollingInterval(null)
                }
                
                setCurrentStep(0)
                setPlanState(null)
                setFormData({
                  origin: "",
                  destination: "",
                  departure_date: "",
                  return_date: "",
                  cabin_class: "economy",
                  passengers: 1,
                })
              }}
              className="w-full"
            >
              Plan Another Trip
            </Button>
          </motion.div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen gradient-bg flex items-center justify-center p-4">
      <div className="w-full max-w-3xl">
        {/* Progress indicator */}
        <div className="mb-12">
          <div className="flex justify-between items-center mb-6">
            {steps.slice(0, -1).map((step, index) => {
              const Icon = step.icon
              return (
                <motion.div
                  key={step.id}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: index * 0.1 }}
                  className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-full transition-all duration-500 backdrop-blur-sm",
                    index <= currentStep
                      ? "bg-gradient-to-br from-primary to-purple-500 text-white shadow-lg shadow-primary/25"
                      : "bg-muted/20 text-muted-foreground border border-muted-foreground/20",
                  )}
                >
                  <Icon className="w-6 h-6" />
                </motion.div>
              )
            })}
          </div>
          <div className="w-full bg-muted/20 rounded-full h-1 backdrop-blur-sm">
            <motion.div
              className="bg-gradient-to-r from-primary to-purple-500 h-1 rounded-full shadow-lg shadow-primary/25"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((currentStep / (steps.length - 2)) * 100, 100)}%` }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
            />
          </div>
        </div>

        <div className="backdrop-blur-sm bg-background/5 rounded-3xl p-12 border border-white/5 shadow-2xl">
          <AnimatePresence mode="wait">{renderStep()}</AnimatePresence>
        </div>
      </div>
    </div>
  )
}
