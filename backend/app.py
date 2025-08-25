
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import uuid
import threading
from typing import Dict, List
from contextlib import asynccontextmanager

from portia import PlanRun
from plans import travel_plan
from constants import ws_after_hook

# Global queue for WebSocket state changes - needs to be created in async context
websocket_queue = None
websocket_processor_task = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    global websocket_queue, websocket_processor_task
    websocket_queue = asyncio.Queue()
    websocket_processor_task = asyncio.create_task(websocket_message_processor())
    print("WebSocket message processor started")
    yield
    # Shutdown
    if websocket_processor_task:
        websocket_processor_task.cancel()
        try:
            await websocket_processor_task
        except asyncio.CancelledError:
            pass
    print("WebSocket message processor stopped")

app = FastAPI(lifespan=lifespan)

# Allow CORS for local dev
app.add_middleware(
	CORSMiddleware,
	allow_origins=["*"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

# In-memory store for plan runs and websocket connections
plan_state_store: Dict[str, Dict] = {}
active_connections: Dict[str, List[WebSocket]] = {}
# Map original plan IDs to Portia plan run IDs  
plan_id_mapping: Dict[str, str] = {}

def serialize_output(output):
	"""Safely serialize output objects, handling complex Portia types."""
	try:
		if hasattr(output, '__dict__'):
			# Try to serialize the dict, handling nested objects
			result = {}
			for key, value in output.__dict__.items():
				try:
					# Test if value is JSON serializable
					import json
					json.dumps(value)
					result[key] = value
				except (TypeError, ValueError):
					# If not serializable, convert to string
					result[key] = str(value)
			return result
		else:
			return str(output)
	except Exception:
		return str(output)

def serialize_output(output):
	"""Safely serialize output objects, handling complex Portia types."""
	try:
		if hasattr(output, '__dict__'):
			# Try to serialize the dict, handling nested objects
			result = {}
			for key, value in output.__dict__.items():
				try:
					# Test if value is JSON serializable
					import json
					json.dumps(value)
					result[key] = value
				except (TypeError, ValueError):
					# If not serializable, convert to string
					result[key] = str(value)
			return result
		else:
			return str(output)
	except Exception:
		return str(output)

async def websocket_message_processor():
	"""Background task to process WebSocket messages from the queue."""
	global websocket_queue
	print("WebSocket message processor started")
	
	while True:
		try:
			# Wait for a message from the queue
			message = await websocket_queue.get()
			plan_run_id = message.get("plan_run_id")
			state = message.get("state")
			
			if plan_run_id and state:
				await send_state_to_websockets(plan_run_id, state)
			
			# Mark the task as done
			websocket_queue.task_done()
			
		except asyncio.CancelledError:
			print("WebSocket message processor cancelled")
			break
		except Exception as e:
			print(f"Error in WebSocket message processor: {e}")
			# Continue processing other messages

async def send_state_to_websockets(plan_run_id: str, state: dict):
	"""Send state update to all WebSocket connections for a plan."""
	# Check both the original plan ID and the mapped Portia plan run ID
	all_connections = []
	
	# Get connections for the original plan ID
	connections = active_connections.get(plan_run_id, [])
	all_connections.extend(connections)
	
	# Check if this is a Portia plan run ID, find the original plan ID
	original_plan_id = None
	for orig_id, portia_id in plan_id_mapping.items():
		if portia_id == plan_run_id:
			original_plan_id = orig_id
			break
	
	if original_plan_id:
		orig_connections = active_connections.get(original_plan_id, [])
		all_connections.extend(orig_connections)
	
	print(f"Sending to {len(all_connections)} WebSocket connections for plan {plan_run_id} (original: {original_plan_id})")
	
	# Serialize the state to ensure it's JSON-safe
	safe_state = {
		"plan_run_id": state.get("plan_run_id", plan_run_id),
		"state": state.get("state", "UNKNOWN"),
		"current_step_index": state.get("current_step_index", 0),
		"outputs": serialize_output(state.get("outputs", {})),
	}
	
	if "final_output" in state:
		safe_state["final_output"] = serialize_output(state["final_output"])
	
	if "error" in state:
		safe_state["error"] = str(state["error"])
	
	# Send to all connections
	for ws in all_connections[:]:  # Copy list to avoid modification during iteration
		try:
			await ws.send_json(safe_state)
			print(f"Sent real-time state update to WebSocket for plan {plan_run_id}: {state.get('state', 'UNKNOWN')}")
		except Exception as e:
			print(f"Error sending to WebSocket: {e}")
			# Remove dead connections from all relevant lists
			for conn_list in [active_connections.get(plan_run_id, []), active_connections.get(original_plan_id, [])]:
				if ws in conn_list:
					conn_list.remove(ws)
					print(f"Removed dead WebSocket connection")

def queue_state_change(plan_run_id: str, state: dict):
	"""Queue a state change message for async processing."""
	global websocket_queue
	
	if websocket_queue is None:
		print("WebSocket queue not initialized yet")
		return
	
	try:
		# Put the message in the queue (thread-safe, non-blocking)
		message = {
			"plan_run_id": plan_run_id,
			"state": state
		}
		
		# Use put_nowait for non-blocking operation from sync context
		websocket_queue.put_nowait(message)
		print(f"Queued WebSocket state change for plan {plan_run_id}: {state.get('state', 'UNKNOWN')}")
		
	except asyncio.QueueFull:
		print(f"WebSocket queue is full, dropping message for plan {plan_run_id}")
	except Exception as e:
		print(f"Error queuing WebSocket message: {e}")

# Legacy function for backward compatibility - now uses queue
async def notify_state_change(plan_run_id: str, state: dict):
	"""Legacy notify function - now queues the message for processing."""
	queue_state_change(plan_run_id, state)

# Set the notify function and state store to avoid circular imports
# Use the queue-based approach instead of direct async calls
ws_after_hook.notify_function = queue_state_change  # Changed from notify_state_change
ws_after_hook.plan_state_store = plan_state_store
ws_after_hook.plan_id_mapping = plan_id_mapping

async def execute_plan_async(plan_run_id: str, form_data: dict):
	"""Execute the travel plan asynchronously and update state."""
	try:
		# Update state to IN_PROGRESS
		state = {
			"plan_run_id": plan_run_id,
			"state": "IN_PROGRESS", 
			"current_step_index": 0,
			"outputs": {},
		}
		plan_state_store[plan_run_id] = state
		queue_state_change(plan_run_id, state)  # Use queue instead of notify_state_change
		
		# Wait a moment for WebSocket connections to establish
		print(f"Waiting for WebSocket connections for plan {plan_run_id}...")
		await asyncio.sleep(1.0)  # 1 second delay
		
		# Check if we have any WebSocket connections now
		connection_count = len(active_connections.get(plan_run_id, []))
		print(f"Starting plan execution for {plan_run_id} with {connection_count} WebSocket connections")
		
		# Run the actual plan using Portia - this will trigger the WebSocket hooks automatically
		result: PlanRun = travel_plan(
			form_data["origin"], 
			form_data["destination"], 
			form_data["departure_date"], 
			form_data["return_date"], 
			form_data["cabin_class"], 
			form_data["passengers"]
		)
		
		# Store the mapping between our plan ID and Portia's plan run ID
		plan_id_mapping[plan_run_id] = result.id
		print(f"Mapped plan ID {plan_run_id} to Portia plan run ID {result.id}")
		
		# The final state will be set by the WebSocket hook, but let's ensure it's set
		if result.state == "COMPLETE":
			final_state = {
				"plan_run_id": plan_run_id,
				"state": "COMPLETE",
				"current_step_index": result.current_step_index,
				"outputs": serialize_output(result.outputs.step_outputs if hasattr(result.outputs, 'step_outputs') else {}),
				"final_output": serialize_output(result.outputs.final_output if hasattr(result.outputs, 'final_output') else result.outputs),
			}
			plan_state_store[plan_run_id] = final_state
			queue_state_change(plan_run_id, final_state)  # Use queue instead of notify_state_change
		
	except Exception as e:
		print(f"Error in execute_plan_async: {e}")
		# Handle errors
		error_state = {
			"plan_run_id": plan_run_id,
			"state": "FAILED",
			"current_step_index": -1,
			"error": str(e),
		}
		plan_state_store[plan_run_id] = error_state
		queue_state_change(plan_run_id, error_state)  # Use queue instead of notify_state_change

@app.websocket("/ws/plan/{plan_run_id}")
async def websocket_plan_state(websocket: WebSocket, plan_run_id: str):
	try:
		await websocket.accept()
		print(f"WebSocket connection accepted for plan: {plan_run_id}")
		
		if plan_run_id not in active_connections:
			active_connections[plan_run_id] = []
		active_connections[plan_run_id].append(websocket)
		
		# On connect, send current state if exists
		current_state = None
		if plan_run_id in plan_state_store:
			current_state = plan_state_store[plan_run_id]
		else:
			# Check if this plan ID is mapped to a Portia plan run ID
			portia_plan_id = plan_id_mapping.get(plan_run_id)
			if portia_plan_id and portia_plan_id in plan_state_store:
				current_state = plan_state_store[portia_plan_id]
		
		if current_state:
			safe_state = {
				"plan_run_id": current_state.get("plan_run_id", plan_run_id),
				"state": current_state.get("state", "UNKNOWN"),
				"current_step_index": current_state.get("current_step_index", 0),
				"outputs": serialize_output(current_state.get("outputs", {})),
			}
			if "final_output" in current_state:
				safe_state["final_output"] = serialize_output(current_state["final_output"])
			if "error" in current_state:
				safe_state["error"] = str(current_state["error"])
				
			await websocket.send_json(safe_state)
			print(f"Sent existing state for plan: {plan_run_id}")
		
		# Keep connection alive
		while True:
			try:
				# Wait for any message (ping/pong to keep alive)
				message = await websocket.receive_text()
				print(f"Received message from client: {message}")
				
				# Send a pong back
				await websocket.send_text("pong")
			except Exception as e:
				print(f"Error receiving message: {e}")
				break
				
	except WebSocketDisconnect:
		print(f"WebSocket disconnected for plan: {plan_run_id}")
	except Exception as e:
		print(f"WebSocket error for plan {plan_run_id}: {e}")
	finally:
		# Clean up connection
		if plan_run_id in active_connections and websocket in active_connections[plan_run_id]:
			active_connections[plan_run_id].remove(websocket)
			if not active_connections[plan_run_id]:
				del active_connections[plan_run_id]
		print(f"Cleaned up WebSocket connection for plan: {plan_run_id}")

@app.get("/plan/{plan_run_id}/state")
async def get_plan_state(plan_run_id: str):
	"""Get the current state of a plan run."""
	# Check direct plan ID first
	if plan_run_id in plan_state_store:
		state = plan_state_store[plan_run_id]
		return JSONResponse({
			"plan_run_id": state.get("plan_run_id", plan_run_id),
			"state": state.get("state", "UNKNOWN"),
			"current_step_index": state.get("current_step_index", 0),
			"outputs": serialize_output(state.get("outputs", {})),
			"final_output": serialize_output(state.get("final_output")) if "final_output" in state else None,
			"error": str(state["error"]) if "error" in state else None,
		})
	
	# Check if this plan ID is mapped to a Portia plan run ID
	portia_plan_id = plan_id_mapping.get(plan_run_id)
	if portia_plan_id and portia_plan_id in plan_state_store:
		state = plan_state_store[portia_plan_id]
		return JSONResponse({
			"plan_run_id": plan_run_id,  # Return the original plan ID
			"state": state.get("state", "UNKNOWN"),
			"current_step_index": state.get("current_step_index", 0),
			"outputs": serialize_output(state.get("outputs", {})),
			"final_output": serialize_output(state.get("final_output")) if "final_output" in state else None,
			"error": str(state["error"]) if "error" in state else None,
		})
	
	# Plan not found
	return JSONResponse({
		"plan_run_id": plan_run_id,
		"state": "NOT_FOUND",
		"current_step_index": -1,
		"outputs": {},
		"error": "Plan not found"
	}, status_code=404)

@app.post("/plan/start")
async def start_plan(request: Request):
	data = await request.json()
	
	# Generate a unique plan run ID
	plan_run_id = str(uuid.uuid4())
	
	# Return immediately with the plan ID and initial state
	initial_state = {
		"plan_run_id": plan_run_id,
		"state": "PREPARING",  # Changed from "STARTED" to "PREPARING" to indicate waiting for connections
		"current_step_index": 0,
		"outputs": {},
	}
	plan_state_store[plan_run_id] = initial_state
	
	# Start the plan execution in the background
	asyncio.create_task(execute_plan_async(plan_run_id, data))
	
	return JSONResponse(initial_state)
