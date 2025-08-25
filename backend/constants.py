import os
from portia import Config, ExecutionHooks, GenerativeModelsConfig, LLMProvider, LLMTool, LogLevel, Output, Plan, PlanRun, Portia, Step, StorageClass

from tool.flight_search_tool import FlightSearchTool
from tool.hotel_search_tool import AccomodationSearchTool

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
        summarizer_model="google/gemini-2.5-pro",
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
    print(f"Hook triggered for plan: {plan.id}, run: {plan_run.id}, step: {step_index}, output type: {type(output)}")
    
    # We'll set this function later to avoid circular imports
    if hasattr(ws_after_hook, 'notify_function') and hasattr(ws_after_hook, 'plan_state_store'):
        
        # Create step output entry
        step_output_name = f"step_{step_index}" if not hasattr(output, 'name') else output.name
        
        step_outputs = {
            step_output_name: {
                "output_name": step_output_name,
                "value": output.model_dump_json() if hasattr(output, 'model_dump_json') else str(output),
                "summary": output.get_summary() if hasattr(output, 'get_summary') else (str(output)[:200] + "..." if len(str(output)) > 200 else str(output)),
                "step_index": step_index
            }
        }
        
        # Find the original plan ID if it exists in the mapping
        original_plan_id = None
        if hasattr(ws_after_hook, 'plan_id_mapping'):
            for orig_id, portia_id in ws_after_hook.plan_id_mapping.items():
                if portia_id == plan_run.id:
                    original_plan_id = orig_id
                    break
        
        # Create state object for notification
        state = {
            "plan_run_id": original_plan_id if original_plan_id else plan_run.id,
            "state": "IN_PROGRESS",
            "current_step_index": step_index,
            "outputs": {"step_outputs": step_outputs},
        }
        
        # If it's the final step, include final output and mark as complete
        if step_index >= len(plan.steps) - 1:
            state["final_output"] = output.model_dump_json() if hasattr(output, 'model_dump_json') else str(output)
            state["state"] = "COMPLETE"
        
        # Update the plan state store 
        plan_id_to_use = original_plan_id if original_plan_id else plan_run.id
        
        # Merge with existing outputs if they exist
        if plan_id_to_use in ws_after_hook.plan_state_store:
            existing_state = ws_after_hook.plan_state_store[plan_id_to_use]
            if "outputs" in existing_state and "step_outputs" in existing_state["outputs"]:
                # Merge step outputs
                existing_step_outputs = existing_state["outputs"]["step_outputs"]
                existing_step_outputs.update(step_outputs)
                state["outputs"]["step_outputs"] = existing_step_outputs
        
        ws_after_hook.plan_state_store[plan_id_to_use] = state
        
        # Store with Portia ID as well for consistency
        ws_after_hook.plan_state_store[plan_run.id] = state
        
        # Call the simple notify function (no async needed)
        ws_after_hook.notify_function(plan_id_to_use, state)
        print(f"✅ Hook processed: step {step_index}, state: {state['state']}")

myPortia = Portia(
    config=google_config,
    tools=myTools,
    execution_hooks=ExecutionHooks(
        after_step_execution=ws_after_hook
    )
)