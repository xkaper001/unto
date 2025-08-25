import os
from typing import Type
from apify_client import ApifyClient
from portia import Tool, ToolRunContext
from pydantic import BaseModel, Field


class FlightInputSchema(BaseModel):
    """Schema for flight booking details."""
    origin: str = Field(..., description="The city from which the flight departs")
    destination: str = Field(..., description="The city to which the flight is headed")
    departure_date: str = Field(..., description="The date of departure in format YYYY-MM-DD")
    cabin_class: str = Field(..., description="The class of service for the flight. Can be any of (economy, business, first, premiumeconomy)")
    passengers: int = Field(..., description="The number of passengers traveling")

class FlightOutputSchema(BaseModel):
    """Schema for flight search results."""
    flights: list[dict] = Field(..., description="List of available flights")

class FlightSearchTool(Tool[str]):
    """Tool for searching flights."""
    id: str = "flight_search_tool"
    name: str = "flight_search_tool"
    description: str = "Search and return up to 5 flight options given origin, destination, departure date, cabin class, and passenger count."
    args_schema: Type[BaseModel] = FlightInputSchema
    output_schema: tuple[str, str] = ("FlightOutputSchema", "List of available flights with details")

    def run(self, _: ToolRunContext, origin: str, destination: str, departure_date: str, cabin_class: str, passengers: int) -> FlightOutputSchema:
        api_token = os.getenv("APIFY_API_TOKEN")
        if not api_token:
            # Return stub data if API token is missing
            return FlightOutputSchema(flights=[{
                "origin": origin,
                "destination": destination,
                "departure_date": departure_date,
                "cabin_class": cabin_class,
                "passengers": passengers,
                "price": "N/A",
                "note": "APIFY_API_TOKEN not configured - returning stub data"
            }])
            
        client = ApifyClient(api_token)
        run_input={
            "origin.0": origin,
            "target.0": destination,
            "depart.0": departure_date,
            "cabin_class": cabin_class,
            "adults": passengers,
            "currency": "INR",
            "alternate_origin": True,
            "alternate_target": True,
        }
        try:
            run = client.actor("tiveIS4hgXOMtu3Hf").call(run_input=run_input)
            list_flights = []
            for i, item in enumerate(client.dataset(run["defaultDatasetId"]).iterate_items()):
                if i >= 5:
                    break
                list_flights.append(item)
            return FlightOutputSchema(flights=list_flights)
        except Exception as e:
            # Return stub data if API call fails
            return FlightOutputSchema(flights=[{
                "origin": origin,
                "destination": destination,
                "departure_date": departure_date,
                "cabin_class": cabin_class,
                "passengers": passengers,
                "price": "N/A",
                "error": f"API call failed: {str(e)}"
            }])
