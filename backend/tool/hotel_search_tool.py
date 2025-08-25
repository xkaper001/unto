import os
from typing import Type
from apify_client import ApifyClient
from portia import Tool, ToolRunContext
from pydantic import BaseModel, Field


class AccomodationInputSchema(BaseModel):
    """Schema for accommodation booking details."""
    location: str = Field(..., description="The city where the accommodation is located")
    check_in_date: str = Field(..., description="The date of check-in")
    check_out_date: str = Field(..., description="The date of check-out")
    guests: int = Field(..., description="The number of guests")

class AccomodationOutputSchema(BaseModel):
    """Schema for accommodation search results."""
    accommodations: list[dict] = Field(..., description="List of available accommodations")

class AccomodationSearchTool(Tool[str]):
    """Tool for searching accommodations."""
    id: str = "accommodation_search_tool"
    name: str = "accommodation_search_tool"
    description: str = "Search and return up to 5 accommodation options given location, check-in date, check-out date, and guest count."
    args_schema: Type[BaseModel] = AccomodationInputSchema
    output_schema: tuple[str, str] = ("AccomodationOutputSchema", "List of available accommodations with details")

    def run(self, _: ToolRunContext, location: str, check_in_date: str, check_out_date: str, guests: int) -> AccomodationOutputSchema:
        api_token = os.getenv("APIFY_API_TOKEN")
        if not api_token:
            return AccomodationOutputSchema(accommodations=[{
                "adults": guests,
                "location": [
                    location
                ],
                "check_in": check_in_date,
                "check_out": check_out_date,
                "currency": "INR", # Set dynamic
                "price": "N/A",
                "limit": 10,
                "no_experiment": False,
                "search_mode": "hotel",
                "trip_length": "date",
                "note": "APIFY_API_TOKEN not configured - returning stub data"
            }])
        client = ApifyClient(api_token)
        run_input={
            "adults": guests,
            "location": [
                location
            ],
            "check_in": check_in_date,
            "check_out": check_out_date,
            "currency": "INR", # Set dynamic
            "price": "N/A",
            "limit": 10,
            "no_experiment": False,
            "search_mode": "hotel",
            "trip_length": "date"
        }
        try:
            run = client.actor("viXne7lpALg8viFdh").call(run_input=run_input)
            list_accommodations = []
            for i, item in enumerate(client.dataset(run["defaultDatasetId"]).iterate_items()):
                list_accommodations.append(item)
            return AccomodationOutputSchema(accommodations=list_accommodations)
        except Exception as e:
            # Return stub data if API call fails
            return AccomodationOutputSchema(accommodations=[{
                "location": location,
                "check_in_date": check_in_date,
                "check_out_date": check_out_date,
                "guests": guests,
                "price": "N/A",
                "error": f"API call failed: {str(e)}"
            }])
            