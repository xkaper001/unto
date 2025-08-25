import os
from portia import Config, GenerativeModelsConfig, LLMProvider, LLMTool, LogLevel, Output, Plan, PlanRun, Portia, Step, StorageClass

from tool.flight_search_tool import FlightSearchTool
from tool.hotel_search_tool import AccomodationSearchTool
from portia.cli import CLIExecutionHooks

myTools = [
    FlightSearchTool(),
    AccomodationSearchTool(),
    LLMTool()
]

models = GenerativeModelsConfig(
        execution_model="google/gemini-2.5-flash",
        default_model="google/gemini-2.5-flash",
        introspection_model="google/gemini-2.5-flash",
        planning_model="google/gemini-2.5-flash",
        summarizer_model="google/gemini-2.5-flash",
)

google_config = Config.from_default(
    llm_provider=LLMProvider.GOOGLE,
    google_api_key=os.getenv("GOOGLE_API_KEY"),
    # default_log_level=LogLevel.DEBUG,
    storage_class=StorageClass.CLOUD,
    models=models,
    # storage_dir="demo_runs"
)

def ws_after_hook(plan: Plan, plan_run: PlanRun, step: Step, output: Output):
    step_index = step.index if hasattr(step, 'index') else plan_run.current_step_index
    print(f"WebSocket after hook triggered for plan: {plan.id}, run: {plan_run.id}, step: {step_index}, output type: {type(output)}")
    
    # We'll set this function later to avoid circular imports
    if hasattr(ws_after_hook, 'notify_function') and hasattr(ws_after_hook, 'plan_state_store'):
        
        # Safely serialize output
        def serialize_output_safe(out):
            try:
                if hasattr(out, '__dict__'):
                    result = {}
                    for key, value in out.__dict__.items():
                        try:
                            import json
                            json.dumps(value)
                            result[key] = value
                        except (TypeError, ValueError):
                            result[key] = str(value)
                    return result
                else:
                    return str(out)
            except Exception:
                return str(out)
        
        # Create state object for WebSocket notification
        state = {
            "plan_run_id": plan_run.id,
            "state": "IN_PROGRESS" if step_index < len(plan.steps) - 1 else "COMPLETE",
            "current_step_index": step_index,
            "outputs": serialize_output_safe(output),
        }
        
        # If it's the final step, include final output
        if step_index >= len(plan.steps) - 1:
            state["final_output"] = serialize_output_safe(output)
            state["state"] = "COMPLETE"
        
        # Update the plan state store - use both the Portia plan run ID and check for mapped original ID
        ws_after_hook.plan_state_store[plan_run.id] = state
        
        # Find the original plan ID if it exists in the mapping
        original_plan_id = None
        if hasattr(ws_after_hook, 'plan_id_mapping'):
            for orig_id, portia_id in ws_after_hook.plan_id_mapping.items():
                if portia_id == plan_run.id:
                    original_plan_id = orig_id
                    break
        
        if original_plan_id:
            # Update state with original plan ID for frontend consistency
            state_for_original = state.copy()
            state_for_original["plan_run_id"] = original_plan_id
            ws_after_hook.plan_state_store[original_plan_id] = state_for_original
        
        # Notify WebSocket clients using the queue-based approach
        try:
            # Call the notify function directly (it will queue the message)
            ws_after_hook.notify_function(plan_run.id, state)
            
            # Also notify with original plan ID if it exists
            if original_plan_id:
                state_for_original = state.copy()
                state_for_original["plan_run_id"] = original_plan_id
                ws_after_hook.notify_function(original_plan_id, state_for_original)
                
        except Exception as e:
            print(f"Error in WebSocket notification: {e}")
        
        print(f"Queued WebSocket update: step {step_index}, state: {state['state']}")

myPortia = Portia(
    config=google_config,
    tools=myTools,
    execution_hooks=CLIExecutionHooks(
        after_step_execution=ws_after_hook
    )
)