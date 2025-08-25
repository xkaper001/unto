
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import asyncio
import uuid
import concurrent.futures
from typing import Dict

from portia import PlanRun
from plans import travel_plan
from constants import ws_after_hook

app = FastAPI()

# Allow CORS for local dev
app.add_middleware(
	CORSMiddleware,
	allow_origins=["*"],
	allow_credentials=True,
	allow_methods=["*"],
	allow_headers=["*"],
)

# In-memory store for plan runs
plan_state_store: Dict[str, Dict] = {}
# Map original plan IDs to Portia plan run IDs  
plan_id_mapping: Dict[str, str] = {}

# Simple state update function - stores state for polling
def update_plan_state(plan_run_id: str, state: dict):
	"""Update plan state in the store for polling."""
	print(f"📊 Updating plan state for {plan_run_id}: {state.get('state', 'UNKNOWN')}")
	plan_state_store[plan_run_id] = state

# Set the notify function and state store to avoid circular imports
ws_after_hook.notify_function = update_plan_state
ws_after_hook.plan_state_store = plan_state_store
ws_after_hook.plan_id_mapping = plan_id_mapping

async def execute_plan_async(plan_run_id: str, form_data: dict):
	"""Execute the travel plan asynchronously in a thread pool to avoid blocking."""
	try:
		print(f"🚀 Starting plan execution for {plan_run_id}")
		
		# Update state to IN_PROGRESS
		state = {
			"plan_run_id": plan_run_id,
			"state": "IN_PROGRESS", 
			"current_step_index": 0,
			"outputs": {},
		}
		plan_state_store[plan_run_id] = state
		
		# Define the blocking function to run in thread pool
		def run_travel_plan():
			"""Run the travel plan in a separate thread to avoid blocking the event loop."""
			print(f"🔄 Executing travel plan in thread for {plan_run_id}")
			return travel_plan(
				form_data["origin"], 
				form_data["destination"], 
				form_data["departure_date"], 
				form_data["return_date"], 
				form_data["cabin_class"], 
				form_data["passengers"]
			)
		
		# Run the plan in a thread pool executor to avoid blocking the event loop
		print(f"🧵 Running plan {plan_run_id} in thread pool executor")
		loop = asyncio.get_event_loop()
		
		# Use run_in_executor to run the blocking function in a thread pool
		result: PlanRun = await loop.run_in_executor(None, run_travel_plan)
		
		print(f"✅ Plan execution completed in thread for {plan_run_id}")
		
		# Store the mapping between our plan ID and Portia's plan run ID
		plan_id_mapping[plan_run_id] = result.id
		print(f"📋 Mapped plan ID {plan_run_id} to Portia plan run ID {result.id}")
		
		# Ensure final state is properly set (hooks should have done this already)
		final_outputs = {}
		if hasattr(result.outputs, 'final_output') and result.outputs.final_output:
			final_outputs = {"final_output": result.outputs.final_output.model_dump_json() if hasattr(result.outputs.final_output, 'model_dump_json') else str(result.outputs.final_output)}
		elif plan_run_id in plan_state_store and "outputs" in plan_state_store[plan_run_id]:
			# Use outputs from hooks if available
			final_outputs = plan_state_store[plan_run_id]["outputs"]
		
		final_state = {
			"plan_run_id": plan_run_id,
			"state": result.state,
			"current_step_index": result.current_step_index,
			"outputs": final_outputs,
		}
		
		if result.state == "COMPLETE":
			if hasattr(result.outputs, 'final_output'):
				try:
					if hasattr(result.outputs.final_output, 'model_dump'):
						final_state["final_output"] = result.outputs.final_output.model_dump()
					elif hasattr(result.outputs.final_output, 'dict'):
						final_state["final_output"] = result.outputs.final_output.dict()
					else:
						final_state["final_output"] = str(result.outputs.final_output)
				except Exception as e:
					print(f"⚠️ Error serializing final output: {e}")
					final_state["final_output"] = str(result.outputs.final_output)
			else:
				try:
					if hasattr(result.outputs, 'model_dump'):
						final_state["final_output"] = result.outputs.model_dump()
					elif hasattr(result.outputs, 'dict'):
						final_state["final_output"] = result.outputs.dict()
					else:
						final_state["final_output"] = str(result.outputs)
				except Exception as e:
					print(f"⚠️ Error serializing outputs: {e}")
					final_state["final_output"] = str(result.outputs)
		
		plan_state_store[plan_run_id] = final_state
		print(f"✅ Plan execution completed for {plan_run_id} with state: {final_state['state']}")
		
	except Exception as e:
		print(f"❌ Error in execute_plan_async: {e}")
		import traceback
		print(f"🔍 Full traceback: {traceback.format_exc()}")
		
		# Handle errors
		error_state = {
			"plan_run_id": plan_run_id,
			"state": "FAILED",
			"current_step_index": -1,
			"error": str(e),
		}
		plan_state_store[plan_run_id] = error_state

def serialize_outputs_safe(outputs):
	"""Safely serialize outputs to JSON, handling complex objects."""
	if not outputs:
		return {}
	
	try:
		# Try to serialize the outputs
		import json
		json.dumps(outputs)
		return outputs
	except (TypeError, ValueError):
		# If serialization fails, convert complex objects to strings
		serialized = {}
		for key, value in outputs.items():
			try:
				json.dumps(value)
				serialized[key] = value
			except (TypeError, ValueError):
				# Convert non-serializable objects to strings
				serialized[key] = str(value)
		return serialized

@app.get("/plan/{plan_run_id}/state")
async def get_plan_state(plan_run_id: str):
	"""Get the current state of a plan run with detailed information."""
	print(f"🔍 Checking state for plan: {plan_run_id}")
	
	# Check direct plan ID first
	if plan_run_id in plan_state_store:
		state = plan_state_store[plan_run_id]
		print(f"📊 Found state for plan {plan_run_id}: {state.get('state', 'UNKNOWN')}")
		
		response = {
			"plan_run_id": state.get("plan_run_id", plan_run_id),
			"state": state.get("state", "UNKNOWN"),
			"current_step_index": state.get("current_step_index", 0),
			"outputs": serialize_outputs_safe(state.get("outputs", {})),
			"final_output": state.get("final_output") if "final_output" in state else None,
			"error": str(state["error"]) if "error" in state else None,
			"timestamp": state.get("timestamp", "unknown")
		}
		
		# Add additional debug info
		if state.get("state") == "IN_PROGRESS":
			response["status_message"] = f"Processing step {state.get('current_step_index', 0) + 1}"
		elif state.get("state") == "COMPLETE":
			response["status_message"] = "Plan completed successfully"
		elif state.get("state") == "FAILED":
			response["status_message"] = f"Plan failed: {state.get('error', 'Unknown error')}"
		else:
			response["status_message"] = f"Plan state: {state.get('state', 'unknown')}"
		
		return JSONResponse(response)
	
	# Check if this plan ID is mapped to a Portia plan run ID
	portia_plan_id = plan_id_mapping.get(plan_run_id)
	if portia_plan_id and portia_plan_id in plan_state_store:
		state = plan_state_store[portia_plan_id]
		print(f"📊 Found mapped state for plan {plan_run_id} -> {portia_plan_id}: {state.get('state', 'UNKNOWN')}")
		
		response = {
			"plan_run_id": plan_run_id,  # Return the original plan ID
			"state": state.get("state", "UNKNOWN"),
			"current_step_index": state.get("current_step_index", 0),
			"outputs": serialize_outputs_safe(state.get("outputs", {})),
			"final_output": state.get("final_output") if "final_output" in state else None,
			"error": str(state["error"]) if "error" in state else None,
			"portia_plan_id": portia_plan_id,
			"timestamp": state.get("timestamp", "unknown")
		}
		
		# Add status message
		if state.get("state") == "IN_PROGRESS":
			response["status_message"] = f"Processing step {state.get('current_step_index', 0) + 1}"
		elif state.get("state") == "COMPLETE":
			response["status_message"] = "Plan completed successfully"
		elif state.get("state") == "FAILED":
			response["status_message"] = f"Plan failed: {state.get('error', 'Unknown error')}"
		else:
			response["status_message"] = f"Plan state: {state.get('state', 'unknown')}"
		
		return JSONResponse(response)
	
	# Plan not found
	print(f"❌ Plan not found: {plan_run_id}")
	return JSONResponse({
		"plan_run_id": plan_run_id,
		"state": "NOT_FOUND",
		"current_step_index": -1,
		"outputs": {},
		"error": "Plan not found",
		"status_message": "Plan not found in the system"
	}, status_code=404)

@app.post("/plan/start")
async def start_plan(request: Request):
	"""Start a new travel plan and return the plan ID for polling."""
	data = await request.json()
	
	# Generate a unique plan run ID
	plan_run_id = str(uuid.uuid4())
	
	print(f"🚀 Starting new plan: {plan_run_id}")
	print(f"📋 Plan details: {data}")
	
	# Return immediately with the plan ID and initial state
	initial_state = {
		"plan_run_id": plan_run_id,
		"state": "PREPARING",
		"current_step_index": 0,
		"outputs": {},
		"status_message": "Plan is being prepared...",
		"timestamp": "preparing"
	}
	plan_state_store[plan_run_id] = initial_state
	
	# Start the plan execution in the background
	asyncio.create_task(execute_plan_async(plan_run_id, data))
	
	print(f"✅ Plan {plan_run_id} started, returning initial state")
	return JSONResponse(initial_state)